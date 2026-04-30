# news-monitor

自托管的多信源“值得关注”发现引擎。它会抓取 RSS、公众号、Hacker News、X/RSSHub 和推荐信源，把内容归并成事件、关键词和跨来源覆盖信号，帮助你持续发现真正值得关注的 AI / 科技动态。

当前主入口是 Web 控制台；CLI、HTTP API 和 Agent 能力保留为诊断与集成入口。

## 界面预览

### 总编台

![总编台](docs/assets/overview.png)

### 推荐信源

![推荐信源](docs/assets/recommended-sources.png)

### 来源覆盖

![来源覆盖](docs/assets/stats.png)

### 一键启动

![一键启动](docs/assets/quick-start.png)

### Demo 视频

[观看 demo 视频](docs/assets/news-monitor-demo.mp4)

视频源码在 [demos/news-monitor-remotion](demos/news-monitor-remotion)，可用 Remotion 重新渲染。

## 核心能力

- 多信源采集：RSS、HN、X/RSSHub、WeWe-RSS、预设推荐源。
- 事件聚类：按主题、关键词、来源覆盖和时间窗口合并相近内容。
- 可解释排序：展示来源数量、平台覆盖、热度变化和“为什么值得关注”。
- Core 模式可离线运行：默认 `AI_MODE=core`，不依赖 LLM Key。
- LLM 可选增强：用于摘要、中文标题、标签、聚类命名和解释。
- 本地诊断：队列、AI 状态、抓取失败、数据质量巡检都有脚本入口。

## 环境要求

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Node.js 22 LTS](https://nodejs.org/)
- Windows 建议使用 PowerShell 7 或系统自带 PowerShell

启动前先打开 Docker Desktop，并确认 Docker Engine 已运行。

## Windows 一键启动

在仓库根目录双击：

```text
start-dev.cmd
```

脚本会自动完成：

- 检查 Node、Corepack、Docker
- 从 `.env.example` 创建 `.env`
- 安装 pnpm 依赖
- 启动 Postgres、Redis、RSSHub、WeWe-RSS
- 执行数据库迁移
- 启动 Web 和 worker
- 打开 [http://localhost:3000](http://localhost:3000)

日常脚本：

```text
start-dev.cmd              启动完整本地开发环境
restart-web-worker.cmd     只重启 Web 和 worker
stop-dev.cmd               停止 Web、worker 和 Docker 依赖
```

## 命令行启动

```powershell
corepack pnpm install
Copy-Item .env.example .env
corepack pnpm start:dev
```

打开：

```text
http://localhost:3000
```

停止：

```powershell
corepack pnpm stop:dev
```

只重启 Web 和 worker：

```powershell
corepack pnpm restart:dev
```

## 首次使用流程

1. 打开 `总编台`，确认页面可以加载。
2. 进入 `推荐信源`，导入一批公共高质量源。
3. 进入 `信源库`，按需要补充个人 RSS、公众号或 X/RSSHub 源。
4. 等待 worker 抓取、抽取关键词、聚类和排序。
5. 回到 `总编台` 查看 `正在升温`、`已被确认` 和 `我的订阅`。

## 配置

首次启动会从 `.env.example` 复制 `.env`。本地最小配置：

```env
DATABASE_URL=postgres://news:news@127.0.0.1:55432/news
REDIS_URL=redis://localhost:6379
RSSHUB_BASE=http://localhost:1200
WEWE_RSS_BASE=http://127.0.0.1:4000
AI_MODE=core
```

启用 LLM 增强时再补充：

```env
AI_MODE=llm
LLM_BASE_URL=https://your-openai-compatible-endpoint
LLM_API_KEY=your-api-key
LLM_CHAT_MODEL=your-chat-model
LLM_EMBEDDING_MODEL=your-embedding-model
```

不要提交 `.env`、`.env.local`、`.env.backup.*` 或任何真实密钥。

## 常用诊断

```powershell
corepack pnpm nm -- status
corepack pnpm nm -- ai status --json
corepack pnpm nm -- queue status --json
corepack pnpm queue:inspect
corepack pnpm queue:retry-fetch
corepack pnpm queue:retry-enrich
corepack pnpm quality:eval -- --days 7
```

## CI 与发布检查

GitHub Actions 使用 [.github/workflows/ci.yml](.github/workflows/ci.yml)，核心命令是：

```powershell
corepack pnpm check
```

推送前建议确认：

- `corepack pnpm check` 本地通过。
- `.env` 和 `.env.backup.*` 没有出现在 `git status`。
- `.env.example` 不包含真实密钥。
- README、截图和 demo 视频路径可访问。
- Docker Desktop 启动后，`start-dev.cmd` 能完成首启。

## 常见问题

### Docker 连接失败

先启动 Docker Desktop，等 Docker Engine 正常运行，再重新执行 `start-dev.cmd`。

### Corepack / pnpm 启动失败

确认 Node.js 是 22：

```powershell
node -v
```

必要时激活 pnpm：

```powershell
corepack prepare pnpm@9.12.0 --activate
```

### 页面 API 报数据库字段不存在

通常是本地数据库 schema 旧于当前代码。启动 Docker 后执行：

```powershell
corepack pnpm --filter @news/db migrate
```

然后重启 Web 和 worker：

```powershell
corepack pnpm restart:dev
```

### 没有 LLM Key 能不能用

可以。默认 `AI_MODE=core`，抓取、关键词、聚类和排序都能运行；LLM 只是增强能力。

## 项目结构

```text
apps/web                 Web 控制台与 HTTP API
apps/worker              队列消费、抓取、增强、聚类
packages/db              Drizzle schema、迁移、查询
packages/engine          能力层与业务编排
packages/connectors/*    RSS、HN、WeWe、X/RSSHub 等连接器
packages/shared          共享类型、日志、环境与文本工具
scripts/                 启动、诊断、队列与质量巡检脚本
docker/                  本地依赖服务与容器镜像
docs/                    启动文档、runbook、设计与状态文档
demos/news-monitor-remotion  README demo 视频工程
```

## 更多文档

- [快速开始](docs/getting-started.md)
- [Agent / HTTP 集成](docs/agent-integration/README.md)
- [队列失败处理](docs/runbooks/queue-failed-jobs.md)
- [聚类质量巡检](docs/runbooks/cluster-taxonomy-quality-loop.md)
