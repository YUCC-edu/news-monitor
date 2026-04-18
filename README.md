# news-monitor

自用的多源资讯监控大屏：5–10 分钟内把 RSS / Hacker News / X (经 RSSHub) 的新内容采集、翻译、打标签、聚类后呈现到 Web 大屏，并对关键词命中弹桌面通知。

## 文档

- **进度与里程碑快照（推荐先看）**：`docs/STATUS.md`
- 设计：`docs/specs/2026-04-17-news-monitor-design.md`
- 设计 vs 实现差异表：`docs/DESIGN-DELTA.md`
- 实现计划（历史分步稿）：`docs/plans/2026-04-17-news-monitor-implementation.md`（交付状态以本 README 与 `docs/STATUS.md` 为准）

## 当前状态

- ✅ **M0-M5 已完成主链路**：信源管理、抓取、时间轴、SSE、翻译打标签、聚类、健康面板、关键词通知。
- ✅ **M6（主路径）**：数据保留（retention）、备份脚本与运维说明已接入；里程碑与路径锚点见 `docs/STATUS.md`。

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

打开 <http://localhost:3000> → 进入时间轴。

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

> 需要在 `.env` 中配置 `WEWE_RSS_BASE` 与 `WEWE_RSS_AUTH_CODE`（后者要与 compose 里 AUTH_CODE 一致）。

#### 公众号一直抓失败？按顺序做这三步

1. **开一个专门终端，启动 Worker**（只开 Web 页面不会拉 Feed；抓取是 Worker 做的）  
   在**仓库根目录**执行：`pnpm --filter @news/worker dev`  
   看到 `[worker] scheduler ready` 且无报错即正常。保持这个窗口不关。
2. **把 `WEWE_RSS_BASE`、`WEWE_RSS_AUTH_CODE` 写在仓库根目录的 `.env`**  
   Worker 用的是 `apps/worker` 里的 `tsx --env-file=../../.env`，**不会读** `apps/web/.env.local`。  
   `WEWE_RSS_AUTH_CODE` 必须与 `docker/.env`（或 compose）里 WeWe 的 `WEWE_RSS_AUTH_CODE` / 容器 `AUTH_CODE` 一致。改完后**关掉 Worker 再重新执行第 1 步**。
3. **在网页里对该公众号点一次「立即抓取」**（或等定时抓取）。若仍失败，看博主卡片上的 **`lastError`** 全文；若是网络/401，多半是第 2 步或 Feed 地址（Docker 内不要用宿主机的 `127.0.0.1`，可改成 `host.docker.internal` 等 Worker 能访问的地址）。

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
```

每天 03:00 worker 会自动执行 retention：删除 90 天前 items，并清理孤立 clusters。

## 运行情况判读（设置页）

- 绿（OK）：依赖可达，队列无明显异常。
- 红（FAIL）：优先检查对应 URL 配置、容器运行状态与网络联通。
- 队列 `failed` 增长：查看 worker 日志，确认上游接口和 Redis 正常。
- 队列 `waiting` 长期积压：通常是 worker 未启动、并发不足或依赖故障。
- 修改配置后仍未生效：若 `uptime` 持续增长，通常说明进程尚未重启。

## 仓库结构

```
apps/web              Next.js 大屏 + API
packages/shared       通用类型 / env / 受控标签 / 语言启发
packages/db           Drizzle schema / 客户端 / 迁移
docker/               compose.yaml + Dockerfile
docs/specs/           设计文档
docs/plans/           实现计划
```

后续里程碑（apps/worker、connectors/*、ai 等）见 `docs/plans/`.
