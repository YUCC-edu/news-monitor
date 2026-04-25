# news-monitor

`news-monitor` 是一个可自托管的多信源“值得关注”发现引擎。它会抓取你配置的 RSS、平台订阅和推荐信源，汇总内容里的关键词、事件组和多源覆盖信号，帮助你发现当前真正值得关注的 AI / 科技动态。

这个项目当前的主入口是 Web 控制台。Agent / HTTP / CLI 能力会继续保留为高级能力，但不作为新用户的第一启动路径。

## 你需要先安装

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Node.js 22 LTS](https://nodejs.org/)
- Windows 用户建议使用 PowerShell 7 或系统自带 PowerShell

安装完成后，打开 Docker Desktop，并等待 Docker Engine 处于运行状态。

## Windows 一键启动

在仓库根目录双击：

```text
start-dev.cmd
```

它会自动执行：

- 检查 Node、Corepack、Docker
- 根据 `.env.example` 创建 `.env`
- 安装依赖
- 启动 Docker 依赖：Postgres、Redis、RSSHub、WeWe-RSS
- 执行数据库迁移
- 启动本地 Web 和 worker
- 打开浏览器访问 [http://localhost:3000](http://localhost:3000)

日常使用这三个文件即可：

```text
start-dev.cmd                 启动完整本地开发环境
restart-web-worker.cmd        只重启 Web 和 worker
stop-dev.cmd                  停止 Web、worker 和 Docker 依赖
```

## 终端启动

如果你更习惯命令行，在 PowerShell 中运行：

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

## 第一次进入 Web 后做什么

1. 打开 `总编台`，确认页面能加载。
2. 进入 `信源库`。
3. 在推荐信源中选择一批高质量源，或者手动添加 RSS / 平台源。
4. 等待 worker 抓取和处理内容。
5. 回到 `总编台` 查看：
   - `正在升温`
   - `已被确认`
   - `我的订阅`

默认模式是 `AI_MODE=core`，不需要 LLM API Key 也能运行。LLM 只作为可选增强。

## 配置文件

第一次启动时会从 `.env.example` 复制出 `.env`。

最小本地配置已经给好默认值：

```env
DATABASE_URL=postgres://news:news@127.0.0.1:55432/news
REDIS_URL=redis://localhost:6379
RSSHUB_BASE=http://localhost:1200
WEWE_RSS_BASE=http://127.0.0.1:4000
AI_MODE=core
```

如果要使用 LLM 增强，再把 `.env` 改成：

```env
AI_MODE=llm
LLM_BASE_URL=https://your-openai-compatible-endpoint
LLM_API_KEY=your-api-key
LLM_CHAT_MODEL=your-chat-model
LLM_EMBEDDING_MODEL=your-embedding-model
```

不要把 `.env`、`.env.local`、`.env.backup.*` 提交到 GitHub。

## 常用诊断命令

CLI 目前只建议作为本地诊断工具使用：

```powershell
corepack pnpm nm -- status
corepack pnpm nm -- ai status --json
corepack pnpm nm -- queue status --json
```

查看队列失败详情：

```powershell
corepack pnpm queue:inspect
```

重试抓取失败任务：

```powershell
corepack pnpm queue:retry-fetch
```

## 常见问题

### Docker 提示连接失败

先启动 Docker Desktop，等它显示 Docker Engine 正常运行，再重新执行 `start-dev.cmd`。

### Corepack / pnpm 启动失败

先确认 Node.js 版本是 22：

```powershell
node -v
```

如果 Corepack 无法启动 pnpm，可以运行：

```powershell
corepack prepare pnpm@9.12.0 --activate
```

然后重新运行 `start-dev.cmd`。

### 页面打不开

确认 `http://localhost:3000` 没有被其他程序占用。也可以先执行：

```powershell
.\stop-dev.cmd
.\start-dev.cmd
```

### 队列里 `fetch-source` 显示 200

这个数字通常表示队列保留的失败任务数量上限，不一定等于当前正在失败的任务数量。用下面命令看具体失败原因：

```powershell
corepack pnpm queue:inspect
```

### 没有 LLM Key 能不能用

可以。默认 `AI_MODE=core`，项目会用规则、关键词、聚类和多源覆盖信号运行。LLM 只是摘要、命名、解释等增强能力。

## 详细启动文档

如果你是第一次部署，或者启动失败，先看：

- [docs/getting-started.md](docs/getting-started.md)

高级 Agent / HTTP 集成文档暂时放在：

- [docs/agent-integration/README.md](docs/agent-integration/README.md)

它不是当前新用户的主入口。

## 发布到 GitHub 前检查

在推送仓库前运行：

```powershell
corepack pnpm check
```

并确认：

- `.env` 没有出现在 `git status`
- `.env.backup.*` 没有出现在 `git status`
- `.env.example` 不包含真实密钥
- `README.md` 和 `.env.example` 没有乱码
- 双击 `start-dev.cmd` 可以跑通首启

## 项目结构

```text
apps/web              Web 控制台与 HTTP API
apps/worker           队列消费、抓取、增强、聚类
packages/db           Drizzle schema、迁移、查询
packages/engine       能力层与业务编排
packages/shared       共享类型、文本归一化、关键词规则
docker/               本地依赖服务
docs/                 启动文档、runbook、设计文档
scripts/              启动脚本、诊断脚本、CLI
```
