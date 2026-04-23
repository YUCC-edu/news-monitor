# Runbook：BullMQ `fetch-source` / `enrich-item` 出现大量 `failed`

设置页提示形如：`fetch-source（waiting=0，failed=200）`、`enrich-item（waiting=0，failed=114）`。  
`waiting=0` 说明当前没有在排队积压；**问题集中在「历史失败作业仍留在 Redis」**。

## 1. 机制说明（为何会有数字）

- Worker 使用 [BullMQ](https://docs.bullmq.io/)，失败且超过重试次数的作业会进入 **`failed`** 状态，默认**不会自动消失**。
- `fetch-source` 的定时调度在 `scheduler.ts` 里配置了 `removeOnFail: 200`，因此 **`failed` 最多保留约 200 条**；你看到的 `failed=200` 往往表示已顶到上限，之后新失败会顶掉最旧的记录。
- `enrich-item` 在入队时使用 `removeOnFail: 200`、`attempts: 3`（见 `apps/worker/src/index.ts`），富化在 LLM/embedding/DB 任一步抛错，三次后进入 `failed`。

**结论**：数字大 ≠ 当前 Worker 一定坏了；可能是过去某段时间配置错误、上游宕机、LLM 限流等留下的**历史失败快照**。

## 2. 排查步骤（必须先做）

在**仓库根目录**、且 `.env` 中 `REDIS_URL` 与 Worker/Web 一致的前提下执行：

```powershell
pnpm exec tsx --env-file=.env scripts/inspect-queue-failures.ts
```

只看最近窗口（建议排查实时增长时使用）：

```powershell
pnpm exec tsx --env-file=.env scripts/inspect-queue-failures.ts --recent-minutes 30
```

只看某条队列：

```powershell
pnpm exec tsx --env-file=.env scripts/inspect-queue-failures.ts --queue fetch-source
pnpm exec tsx --env-file=.env scripts/inspect-queue-failures.ts --queue enrich-item
```

根据输出中的 **`categories` / `remediation suggestion` / `[Nx] 错误摘要`** 归类：

| 聚类特征（示例） | 更可能根因 | 下一步 |
|------------------|------------|--------|
| `Received an instance of Date`（`createHash().update`） | 上游 RSS/Atom 里 `guid`/`id` 被 rss-parser 解析成 **Date**；旧版 connector 曾直接用作 `externalId` 并传入 `createHash`（已在新版本用 `coerceRssIdField` 修复） | **升级含该修复的 Worker 代码并重启**；然后 `retry-fetch-failed` 或等下一轮调度；历史 `failed` 可用 `clean-failed-jobs` 清掉 |
| `ECONNREFUSED`、`timeout`、`fetch failed`、RSSHub/WeWe URL | `RSSHUB_BASE` / `WEWE_RSS_BASE` 不可达、Docker 未起、防火墙、误用宿主机 `127.0.0.1` 而 Worker 在容器内 | 修正 `.env` 与 compose 网络，确保 Worker 进程内能 `curl` 到同一 URL |
| `401`、`403`、`code`、鉴权 | `WEWE_RSS_AUTH_CODE` 与 WeWe 不一致，或 RSSHub 路由需 Cookie | 对齐口令；按 RSSHub 文档配置 |
| `wechat-wewe 返回的是网页 HTML` | Feed 贴成 `/dash/...` 或未映射的地址 | 使用 `/feeds/...atom` 或依赖 connector 的 URL 规范化 |
| `404 status code (no body)`（富化） | 嵌入或聊天接口 **URL 路径错误**、网关返回空 404、或模型路由不存在 | 核对 `LLM_BASE_URL`（是否含 `/v1`）、`LLM_CHAT_MODEL` / `LLM_EMBEDDING_MODEL` 与供应商文档；用 `curl` 对 `.../embeddings` 与 `.../chat/completions` 试跑 |
| `invalid_type` + `Expected array, received string`（`tags` / `category_domain` / `category_topic` / `category_entity`） | LLM 返回把数组字段写成了逗号分隔字符串，旧版 `translateAndTag` 只接受数组，导致 `enrich-item` 任务直接失败 | 升级到包含字符串数组兼容修复的版本并重启 Worker；执行 `retry-enrich-failed` 重新富化失败条目 |
| `LLM`、`401`、`429`、`JSON`、`embedding` | `LLM_BASE_URL` / `LLM_API_KEY` / 模型名错误或限流 | 在设置页修正 LLM；降温请求频率 |
| `item-not-found`（若出现） | 数据与队列不一致 | 较少见；`enrich` 若未抛错则不会进 failed，多为其它 DB 错误 |

同时对照 **Worker 终端** 里 `[worker] failed ...` 行（与 `failedReason` 一致）。

### 日志定位建议（本地）

- Worker 现已使用统一模块日志格式：`[time] [level] [module] message key=value...`。  
- 建议先聚焦模块再放大范围：  
  - 仅抓取链路：`LOG_MODULES=worker:fetch-source`  
  - 仅富化链路：`LOG_MODULES=worker:enrich-item`  
  - 看队列事件：`LOG_MODULES=worker:index`  
- 常用级别：排障时 `LOG_LEVEL=debug`，日常观察 `LOG_LEVEL=info`。  
- 关键检索键：`jobId`、`sourceId`、`itemId`、`errorClass`、`queue`。

## 3. 修复规划（按顺序执行）

### 阶段 A — 消除根因（必做）

1. **确认 Worker 常驻**：`pnpm --filter @news/worker dev`（或生产等价命令）；无 Worker 则只有失败/无消费。
2. **按 inspect 结果修正配置**（`.env` / 设置页）：Redis、Postgres、`RSSHUB_BASE`、`WEWE_RSS_*`、`LLM_*`。
3. **验证上游**：在运行 Worker 的机器上对典型 URL 做一次 HTTP GET（含公众号 Atom、RSSHub `/twitter/user/...`）。
4. **看信源健康**：Web 里各信源 `lastError`、`failCount`；若已自动禁用（连续失败 ≥10），修正后重新启用信源。

### 阶段 B — 处理已存在的 `failed` 作业

在**根因已修复**后再做，否则重试会再次失败。

1. **抓取队列**：  
   `pnpm exec tsx --env-file=.env scripts/retry-fetch-failed.ts`  
   将当前 `failed` 的 `fetch-source` 作业重新入队（会再次请求各信源 Feed）。

2. **富化队列**：  
   `pnpm exec tsx --env-file=.env scripts/retry-enrich-failed.ts`  
   （已有脚本）重试 `enrich-item` 的 failed。

#### LLM 404 快速探活（在配置好 `LLM_API_KEY` 的机器上）

将下面 `BASE` 换成与 `LLM_BASE_URL` 一致（含 `/v1`），`KEY` 换成密钥，`CHAT`/`EMBED` 换成与 `.env` 中模型名一致：

```bash
curl -sS -o /dev/null -w "chat %{http_code}\n" -X POST "$BASE/chat/completions" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"model\":\"$CHAT\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":1}"
curl -sS -o /dev/null -w "embed %{http_code}\n" -X POST "$BASE/embeddings" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"model\":\"$EMBED\",\"input\":\"x\"}"
```

若 `embed` 为 404：多为供应商**无 embeddings 路由**或模型名错误；Worker 会降级确定性向量，但 BullMQ 里若 `translateAndTag` 先调用 chat 且 chat 404，仍会失败——需先保证 **chat** 与 **embed** 至少与供应商文档一致。

3. **若确认这些失败已无价值**（例如旧环境、已删信源、只想清告警）：  
   - Dry-run：`pnpm exec tsx --env-file=.env scripts/clean-failed-jobs.ts --queue fetch-source`  
   - 执行删除：`... --queue fetch-source --apply`  
   对 `enrich-item` 同理。  
   **注意**：`clean` 不会补跑业务逻辑；若仍需富化，请用 `/ops` 或 `POST /api/ops/re-enrich` 按信源/时间窗重新入队。

### 阶段 C — 验证

1. 刷新设置页：各队列 `failed` 应下降或归零（新失败除外）。  
2. Worker 日志中 `completed` 增多、`failed` 减少。  
3. 时间轴或 DB `items` / 富化表有预期更新。

## 4. 预防与运维习惯

- 部署或改 `.env` 后**重启 Worker**。  
- 上游不稳定时，适当增大信源 `fetchIntervalSec`，避免瞬间打满失败槽。  
- 定期跑 `inspect-queue-failures.ts` 做健康检查；可将输出接入日志采集。

## 5. 与设置页提示的关系

设置页在 **`failed > 0` 或 `waiting > 100`** 时提示异常；**单独存在历史 `failed` 也会触发**。清队列或重试成功后，提示会消失（除非再次出现新失败）。
