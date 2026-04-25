# news-monitor 新用户启动指南

这份文档面向第一次从 GitHub 拿到项目的人。目标是先把本地 Web 跑起来，再添加信源并看到“值得关注”结果。

## 1. 准备环境

必须安装：

- Docker Desktop
- Node.js 22 LTS
- Git

Windows 用户建议直接使用仓库根目录的 `.cmd` 文件。PowerShell 启动也可以，但第一次使用时请先打开 Docker Desktop。

检查版本：

```powershell
node -v
docker version
corepack --version
```

`node -v` 应该是 `v22.x`。

## 2. 获取项目

```powershell
git clone <your-repo-url>
cd news-monitor
```

如果你拿到的是 zip 包，解压后进入项目根目录即可。

## 3. 最简单启动方式：双击

在仓库根目录双击：

```text
start-dev.cmd
```

启动脚本会做这些事：

1. 检查 Node、Corepack、Docker。
2. 如果没有 `.env`，从 `.env.example` 自动复制。
3. 安装 pnpm 依赖。
4. 启动 Docker 依赖：Postgres、Redis、RSSHub、WeWe-RSS。
5. 等待数据库和 Redis 健康。
6. 执行数据库迁移。
7. 启动 Web 和 worker。
8. 检查 Web 是否可访问。
9. 打开浏览器到 `http://localhost:3000`。

启动完成后会看到两个本地进程窗口：一个 Web，一个 worker。不要手动关闭它们；需要停止时用 `stop-dev.cmd`。

## 4. PowerShell 启动方式

如果你不想双击文件，可以运行：

```powershell
corepack pnpm install
Copy-Item .env.example .env
corepack pnpm start:dev
```

打开：

```text
http://localhost:3000
```

## 5. 日常启动、停止、重启

完整启动：

```text
start-dev.cmd
```

停止全部本地服务：

```text
stop-dev.cmd
```

只重启 Web 和 worker：

```text
restart-web-worker.cmd
```

对应 PowerShell 命令：

```powershell
corepack pnpm start:dev
corepack pnpm stop:dev
corepack pnpm restart:dev
```

## 6. 第一次使用流程

1. 打开 `http://localhost:3000`。
2. 进入 `信源库`。
3. 从推荐信源里添加一批高质量 AI / 科技源。
4. 等待 worker 抓取。
5. 回到 `总编台` 查看：
   - `正在升温`
   - `已被确认`
   - `我的订阅`

如果一开始没有结果，通常是还没有足够信源或 worker 还没有完成抓取。

## 7. LLM 配置是可选的

默认 `.env` 使用：

```env
AI_MODE=core
```

这个模式不需要 LLM API Key。项目仍然可以抓取、提取关键词、聚类、排序和展示结果。

只有你想启用 LLM 增强时，才需要改成：

```env
AI_MODE=llm
LLM_BASE_URL=https://your-openai-compatible-endpoint
LLM_API_KEY=your-api-key
LLM_CHAT_MODEL=your-chat-model
LLM_EMBEDDING_MODEL=your-embedding-model
```

改完 `.env` 后重启：

```text
restart-web-worker.cmd
```

## 8. 如何确认 worker 正在工作

查看队列状态：

```powershell
corepack pnpm nm -- queue status --json
```

查看抓取失败详情：

```powershell
corepack pnpm queue:inspect
```

如果新增信源后没有内容：

1. 确认 worker 窗口还在运行。
2. 确认信源 URL 可访问。
3. 执行 `corepack pnpm queue:inspect` 查看失败原因。
4. 修复后执行 `corepack pnpm queue:retry-fetch`。

## 9. 常见启动问题

### Docker Desktop 没开

现象：脚本提示 Docker engine 不可用。

处理：

1. 打开 Docker Desktop。
2. 等待它显示 Engine running。
3. 重新运行 `start-dev.cmd`。

### Corepack / pnpm 权限错误

现象：看到类似 `Corepack`、`EPERM`、`pnpm` 的错误。

处理：

```powershell
corepack prepare pnpm@9.12.0 --activate
```

如果仍失败，关闭管理员权限终端，改用普通用户 PowerShell，再运行 `start-dev.cmd`。

### 端口被占用

默认端口：

- Web: `3000`
- Postgres: `55432`
- Redis: `6379`
- RSSHub: `1200`
- WeWe-RSS: `4000`

先尝试：

```text
stop-dev.cmd
start-dev.cmd
```

如果仍失败，检查是否有其他项目占用了这些端口。

### fetch-source 显示 200

队列状态里的 `fetch-source failed=200` 通常表示 BullMQ 最多保留 200 条失败记录，不一定表示当前还有 200 个源正在失败。

查看真实原因：

```powershell
corepack pnpm queue:inspect
```

常见原因包括：

- RSS URL 不可访问
- RSSHub 路由失败
- WeWe-RSS 未绑定微信
- 网络超时

### WeWe-RSS 不能抓公众号

先打开：

```text
http://127.0.0.1:4000
```

按页面提示绑定微信。然后确认 `.env` 里的：

```env
WEWE_RSS_BASE=http://127.0.0.1:4000
WEWE_RSS_AUTH_CODE=change-me
```

如果你改过 `WEWE_RSS_AUTH_CODE`，Web 和 worker 都需要重启。

## 10. 推送 GitHub 前的安全检查

不要提交：

- `.env`
- `.env.local`
- `.env.backup.*`
- 本地日志
- Docker 数据目录

检查：

```powershell
git status --short
```

质量门：

```powershell
corepack pnpm check
```

如果只想先验证启动体验，至少跑一次：

```text
start-dev.cmd
```

并确认 Web 能访问 `http://localhost:3000`。
