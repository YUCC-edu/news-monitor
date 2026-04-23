# news-monitor

自用的多源资讯监控大屏：5–10 分钟内把 RSS / Hacker News / X (经 RSSHub) 的新内容采集、翻译、打标签、聚类后呈现到 Web 大屏，并对关键词命中弹桌面通知。

## 文档

- **进度与里程碑快照（推荐先看）**：`docs/STATUS.md`
- 设计：`docs/specs/2026-04-17-news-monitor-design.md`
- 设计 vs 实现差异表：`docs/DESIGN-DELTA.md`
- Agent 接入能力：`docs/agent-integration/README.md`
- 回归与灰度矩阵：`docs/runbooks/product-rollout-regression-matrix.md`
- 实现计划（历史分步稿）：`docs/plans/2026-04-17-news-monitor-implementation.md`（交付状态以本 README 与 `docs/STATUS.md` 为准）

## 当前状态

- ✅ **M0-M5 已完成主链路**：信源管理、抓取、时间轴、SSE、翻译打标签、聚类、健康面板、关键词通知。
- ✅ **M6（主路径）**：数据保留（retention）、备份脚本与运维说明已接入；里程碑与路径锚点见 `docs/STATUS.md`。
- ✅ **近期增强已落地**：全局搜索（`⌘K` + `/search`）、Agent API（`/api/agent/*`）、队列排障 runbook。

## 快速开始（M0）

> 前提：Node 22+、pnpm 9.12+、Docker Desktop（含 compose）。

```powershell
# 0. 安装依赖
pnpm install

# 1. 起底座容器（postgres / redis / rsshub）
cd docker
docker compose up -d postgres redis rsshub
docker compose ps   # 三个都应为 running / healthy

# 2. 跑数据库迁移（首次）
cd ..
pnpm --filter @news/db migrate

# 3. 准备 .env（首次）
Copy-Item .env.example .env

# 4. 起 web（两种方式选一）
# 4a. 开发模式（热更新）
pnpm dev:web
# 4b. 容器模式（与生产一致）
cd docker
docker compose up -d --build web
```

打开 [http://localhost:3000](http://localhost:3000) → 进入时间轴。

> 说明：只启动 `web` 可浏览页面；要执行抓取、入队、富化与聚类，请额外启动 `pnpm --filter @news/worker dev`。

## 全局搜索（⌘K）

已支持全局命令搜索与搜索页（Hybrid 模式）：

- 触发方式：右上角 `⌘K 搜索` 或 `Ctrl/Cmd + K`
- 交互：`↑/↓` 选择、`Enter` 打开、`Esc` 关闭
- 覆盖范围：`nav / setting / source / creator / item`
- 更多结果：可跳转 `/search?q=...`

API 示例：

```powershell
Invoke-RestMethod "http://localhost:3000/api/search/global?q=设置&limitPerGroup=5"
```

## Web 一站式设置页

`/settings` 页面支持直接写入仓库根目录 `.env`。

Web 现已通过 `apps/web/scripts/run-next-with-root-env.mjs` 在启动前预加载根 `.env`（`dev/build/start` 都一致）。若你本地仍保留 `apps/web/.env.local` 且 `AUTH_*` 与根 `.env` 不一致，启动时会给出告警，建议清理或保持同步。

- 可编辑：`DATABASE_URL`、`REDIS_URL`、`RSSHUB_BASE`、`WEWE_RSS_BASE`、`WEWE_RSS_AUTH_CODE`、`LLM_*`
- 可观测：服务连通（Redis / RSSHub / WeWe）、队列状态、最近备份、Node 运行时
- 安全：敏感字段（如 `LLM_API_KEY`）仅显示“是否已配置”，不会回传明文

保存后必须重启进程才会生效：

```powershell
# 本地开发
pnpm --filter @news/web dev
pnpm --filter @news/worker dev

# Docker
cd docker
docker compose restart web worker
```

如果是 Docker 部署，确保根目录 `.env` 为可写挂载（`docker/compose.yaml` 的 `env_file: ../.env` 只负责读取，不会自动把容器内写入回宿主机）。

## DeepSeek 配置（OpenAI 兼容）

`.env` 示例：

```env
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=你的key
LLM_CHAT_MODEL=deepseek-chat
LLM_EMBEDDING_MODEL=deepseek-embedding
```

> 如果 embedding 接口不可用，系统会自动降级到本地确定性向量，保证聚类功能可用。

## 订阅公众号（WeWe-RSS）

公众号通过自建 [WeWe-RSS](https://github.com/cooderl/wewe-rss) 网关获取，无需微信开放平台。

```powershell
# 1. 起 WeWe-RSS 容器
cd docker
docker compose up -d wewe-rss

# 2. 打开面板扫码绑定微信
#    浏览器访问：http://127.0.0.1:4000
#    用微信扫码登录，WeWe-RSS 会保存到 ./.data/wewe/db.sqlite

# 3. 在 WeWe-RSS 面板里添加要订阅的公众号，复制它的 Feed URL
#    服务端 Atom 接口形如：http://127.0.0.1:4000/feeds/MP_WXS_xxxxxxxxx.atom（上游 FeedsController）
#    控制台地址栏常见：http://127.0.0.1:4000/dash/feeds/MP_WXS_… —— 这是前端 SPA 路由，GET 下来是 HTML；
#    news-monitor / 多数阅读器在后台会请求「/feeds/… .atom」。你可继续粘贴 /dash/feeds/…，抓取时会自动映射。
#    如果 .env 里设置了 WEWE_RSS_AUTH_CODE，系统会自动拼上 ?code=xxx

# 4. 在我们 web 的 /creators 页，选"公众号"，粘贴 Feed URL 即可
```

> 需要在 `.env` 中配置 `WEWE_RSS_BASE` 与 `WEWE_RSS_AUTH_CODE`（后者要与 compose 里 AUTH_CODE 一致）。`WEWE_RSS_AUTH_CODE` 请只用可打印 ASCII（不要从带中文或弯引号的文档里整段粘贴），否则 WeWe 自带 SPA 可能整页报错 `RequestInit` / `ISO-8859-1`，且无法在面板里登录或同步；**不影响** news-monitor Worker 用 Atom URL 拉取（只要 URL 与 code 正确）。设置页保存时会自动去掉 BOM 与非 ASCII。

#### 公众号一直抓失败？按顺序做这三步

1. **开一个专门终端，启动 Worker**（只开 Web 页面不会拉 Feed；抓取是 Worker 做的）
  在**仓库根目录**执行：`pnpm --filter @news/worker dev`  
   看到 `[worker] scheduler ready` 且无报错即正常。保持这个窗口不关。
2. **把 `WEWE_RSS_BASE`、`WEWE_RSS_AUTH_CODE` 写在仓库根目录的 `.env`**
  Worker 用的是 `apps/worker` 里的 `tsx --env-file=../../.env`，**不会读** `apps/web/.env.local`。  
   `WEWE_RSS_AUTH_CODE` 必须与 `docker/.env`（或 compose）里 WeWe 的 `WEWE_RSS_AUTH_CODE` / 容器 `AUTH_CODE` 一致。改完后**关掉 Worker 再重新执行第 1 步**。
3. **在网页里对该公众号点一次「立即抓取」**（或等定时抓取）。若仍失败，看博主卡片上的 `lastError` 全文；若是网络/401，多半是第 2 步或 Feed 地址（Docker 内不要用宿主机的 `127.0.0.1`，可改成 `host.docker.internal` 等 Worker 能访问的地址）。

#### WeWe 网页打不开、控制台报 fetch / Headers / ISO-8859-1

这是 **WeWe-RSS 浏览器端** 的限制（请求头只能是 Latin-1），与 Worker 抓取不是同一条路径。上游前端在 `httpBatchLink` 里把 `localStorage` 的 `authCode` 原样放进 `Authorization` 头；若你曾在登录框粘贴过带 BOM/中文的口令，或从文档里复制了「智能引号」，就会触发该错误，而 **news-monitor 里保存的 `WEWE_RSS_AUTH_CODE` 不会同步到浏览器的 `localStorage`**。

处理（在 WeWe 的源站上操作）：F12 → Application → Local Storage → 删除键 `authCode`，或对 `http://127.0.0.1:4000`（或你的实际域名）「清除站点数据」→ 刷新 `/dash` 后重新登录；compose / `.env` 里的口令保持纯 ASCII。必要时 `docker pull` 升级镜像并在上游 [cooderl/wewe-rss](https://github.com/cooderl/wewe-rss) 搜同类 issue。

## 信源去重与迁移（M8）

1. 运行数据库迁移：`pnpm --filter @news/db migrate`（会应用 `0002` 增加 `dedup_key` / `initial_fetch_days` / `max_item_age_days`，以及 `0003` 唯一约束）。
2. （推荐）合并历史重复信源并回填语义去重键：`pnpm exec tsx --env-file=.env scripts/dedup-sources.ts`
3. 头像：X 使用 [unavatar.io](https://unavatar.io)；RSS 使用 Google favicons；公众号在抓取后从 Atom `feed.image` 写入 `config.avatarUrl`。

主题样式见 `apps/web/app/globals.css`（黑白极简 + 动效）。

## 常用运维

```powershell
# 启动 web / worker
pnpm --filter @news/web dev
pnpm --filter @news/worker dev

# 手动备份数据库（保留最近14份）
sh docker/cron-pgdump.sh

# BullMQ 队列失败排查 / 重试 / 清理（需仓库根目录 .env 中 REDIS_URL）
pnpm exec tsx --env-file=.env scripts/inspect-queue-failures.ts
pnpm exec tsx --env-file=.env scripts/inspect-queue-failures.ts --recent-minutes 30
pnpm exec tsx --env-file=.env scripts/retry-fetch-failed.ts
pnpm exec tsx --env-file=.env scripts/retry-enrich-failed.ts
pnpm exec tsx --env-file=.env scripts/clean-failed-jobs.ts --queue fetch-source
pnpm exec tsx --env-file=.env scripts/clean-failed-jobs.ts --queue enrich-item --apply

# 本地调试日志（按级别 / 模块过滤）
$env:LOG_LEVEL="debug"; pnpm --filter @news/worker dev
$env:LOG_LEVEL="info"; $env:LOG_MODULES="worker:fetch-source,worker:enrich-item"; pnpm --filter @news/worker dev
```

详细步骤与根因对照见 `docs/runbooks/queue-failed-jobs.md`。
回归与灰度发布检查清单见 `docs/runbooks/product-rollout-regression-matrix.md`。

每天 03:00 worker 会自动执行 retention：删除 90 天前 items，并清理孤立 clusters。

## 重新 enrich（Web + 脚本）

- **Web**：打开 `/ops` 运维页，按 **信源 / 时间窗 / 单条** 将条目重新入队 `enrich-item`（单次最多 500 条）。
- **HTTP API**：`POST /api/ops/re-enrich`，body 示例：`{ "scope": "source", "sourceId": "<uuid>", "limit": 200 }`；`scope` 还可为 `window`（配合 `since` / `until` ISO 字符串）或 `item`（配合 `itemId`）。
- **脚本**：`pnpm exec tsx --env-file=.env scripts/retry-enrich-failed.ts` 用于重试队列里 **已失败** 的 enrich 作业（与上面「主动重跑」互补）。

## 端到端（E2E）自动化

本期仓库 **不引入 Playwright**；回归以数据库迁移、`pnpm --filter @news/db test` 与关键路径手动冒烟为主。若后续要在 CI 加浏览器级 E2E，再单独加依赖与流水线步骤。

## 运行情况判读（设置页）

- 绿（OK）：依赖可达，队列无明显异常。
- 红（FAIL）：优先检查对应 URL 配置、容器运行状态与网络联通。
- 队列 `failed` 增长：多为历史失败作业仍留在 Redis（`fetch-source` 单队列最多约保留 200 条）；先用 `scripts/inspect-queue-failures.ts` 看错误聚类，再按 `docs/runbooks/queue-failed-jobs.md` 修正配置并重试或清理。
- 队列 `waiting` 长期积压：通常是 worker 未启动、并发不足或依赖故障。
- 修改配置后仍未生效：若 `uptime` 持续增长，通常说明进程尚未重启。
- 本地日志调试：`LOG_LEVEL` 控制输出门槛（`debug|info|warn|error`），`LOG_MODULES` 可限定模块（逗号分隔）；Worker 关键模块为 `worker:index` / `worker:fetch-source` / `worker:enrich-item`。

## 运维演练与SLO（建议）

- 每周演练 5 类故障：Redis 断连、LLM 404、WeWe 401、RSSHub 超时、历史 failed 残留。
- 建议基线：`queue failed` 不持续增长、`queue waiting` 不长期 > 100、health 24h 流水线比例稳定回升。
- 排查路径：设置页发现异常 → `queue:inspect -- --recent-minutes 30` → 修复后 `queue:retry-`* → 再 inspect 验证。

## 仓库结构

```
apps/web              Next.js 大屏 + API
packages/shared       通用类型 / env / 受控标签 / 语言启发
packages/db           Drizzle schema / 客户端 / 迁移
docker/               compose.yaml + Dockerfile
docs/specs/           设计文档
docs/plans/           实现计划
docs/runbooks/        运维排障（如队列 failed）
```

后续里程碑（apps/worker、connectors/*、ai 等）见 `docs/plans/`.