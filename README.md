# News Monitor

自托管的多信源“值得关注”发现与日报发布中心。它可以抓取 RSS、公众号、Hacker News、X/RSSHub 和推荐信源，把内容聚合成热点、关键词和跨来源覆盖信号，并支持生成中文日报、创建微信公众号草稿、推送飞书、沉淀到本地 Obsidian。

## 下载后直接使用

Windows 用户推荐使用打包版：

1. 安装并启动 [Docker Desktop](https://www.docker.com/products/docker-desktop/)。
2. 解压 `news-monitor-windows-*.zip`。
3. 双击 `News Monitor.cmd`。
4. 打开 [http://localhost:3000](http://localhost:3000)。

这个模式由 Docker 运行 Postgres、Redis、RSSHub、WeWe-RSS、Web 和 worker，不要求宿主机安装 Node.js 或 pnpm。停止软件时双击 `Stop News Monitor.cmd`；诊断问题时双击 `Diagnose News Monitor.cmd`。

开发者也可以从源码打包 Windows 分发包：

```powershell
corepack pnpm package:windows -- -Version 0.1.0
```

产物会生成在 `dist/news-monitor-windows-0.1.0.zip`。

## 核心能力

- 多信源采集：RSS、HN、X/RSSHub、WeWe-RSS、预设推荐源。
- 热点聚合：按主题、关键词、来源覆盖和时间窗口合并相近内容。
- 可解释排序：展示来源数量、平台覆盖、热度变化和关注理由。
- 日报发布中心：在 `/reports` 生成、预览、编辑、重试并一键推送。
- 微信公众号：只创建草稿箱草稿，不自动群发。
- 飞书：通过自定义机器人 Webhook 推送日报卡片。
- Obsidian：写入 `Daily/YYYY-MM-DD.md`，并追加 `Topics/<topic>.md` 知识卡片。
- Core 模式：默认 `AI_MODE=core`，没有 LLM Key 也能抓取、聚类和排序。
- LLM 增强：可选用于摘要、中文标题、标签、聚类命名和解释。

## 环境配置

首次启动会从 `.env.example` 创建 `.env`。最小配置如下：

```env
DATABASE_URL=postgres://news:news@127.0.0.1:55432/news
REDIS_URL=redis://localhost:6379
RSSHUB_BASE=http://localhost:1200
WEWE_RSS_BASE=http://127.0.0.1:4000
AI_MODE=core
```

日报发布相关配置：

```env
WECHAT_MP_APP_ID=
WECHAT_MP_APP_SECRET=
WECHAT_MP_DEFAULT_THUMB_MEDIA_ID=
FEISHU_WEBHOOK_URL=
FEISHU_WEBHOOK_SECRET=
OBSIDIAN_VAULT_PATH=
REPORT_DAILY_TIME=08:30
REPORT_TIMEZONE=Asia/Shanghai
```

Docker 软件模式下，Obsidian 会挂载 `.env` 里的 `OBSIDIAN_VAULT_PATH`；如果留空，会写入 `docker/.data/obsidian`。

不要提交 `.env`、`.env.local`、`.env.backup.*` 或任何真实密钥。

## 本地开发

开发模式需要 Docker Desktop、Node.js 22 LTS 和 Corepack：

```powershell
corepack pnpm install
copy .env.example .env
corepack pnpm start:dev
```

常用命令：

```powershell
corepack pnpm dev:web
corepack pnpm dev:worker
corepack pnpm restart:dev
corepack pnpm stop:dev
corepack pnpm check
```

只用 Docker 运行完整应用：

```powershell
corepack pnpm start:app
```

## 首次使用流程

1. 打开总编台，确认页面能加载。
2. 进入推荐信源，导入一批公共高质量信源。
3. 进入信源库，按需补充个人 RSS、公众号或 X/RSSHub 信源。
4. 等待 worker 抓取、抽取关键词、聚类和排序。
5. 进入日报发布中心，生成当日日报并按目标渠道推送。
6. 进入设置页补充微信、飞书和 Obsidian 配置。

## 诊断

```powershell
corepack pnpm doctor
corepack pnpm nm -- status
corepack pnpm nm -- ai status --json
corepack pnpm nm -- queue status --json
corepack pnpm queue:inspect
```

如果页面提示数据库字段不存在，通常是迁移未执行：

```powershell
corepack pnpm --filter @news/db migrate
corepack pnpm restart:dev
```

## 项目结构

```text
apps/web                 Web 控制台、PWA 元信息与 HTTP API
apps/worker              队列消费、抓取、增强、聚类、日报调度
packages/db              Drizzle schema、迁移、查询
packages/engine          业务编排、队列、日报生成与发布适配器
packages/connectors/*    RSS、HN、WeWe、X/RSSHub 连接器
packages/shared          共享类型、环境配置、日志与文本工具
scripts/                 启动、诊断、打包和质量巡检脚本
docker/                  软件模式依赖服务与应用镜像
docs/                    启动文档、runbook、设计与状态文档
```

## 发布检查

```powershell
corepack pnpm check
corepack pnpm audit:prod
corepack pnpm package:windows -- -Version 0.1.0
```

确认事项：

- `corepack pnpm check` 通过。
- `.env` 没有出现在 `git status`。
- `.env.example` 不包含真实密钥。
- Docker Desktop 启动后，`News Monitor.cmd` 能完成首次启动。
- `/reports` 能生成日报；微信只创建草稿，飞书和 Obsidian 失败不会阻断其他渠道。
