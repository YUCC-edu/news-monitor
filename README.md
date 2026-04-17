# news-monitor

自用的多源资讯监控大屏：5–10 分钟内把 RSS / Hacker News / X (经 RSSHub) 的新内容采集、翻译、打标签、聚类后呈现到 Web 大屏，并对关键词命中弹桌面通知。

## 文档

- 设计：`docs/specs/2026-04-17-news-monitor-design.md`
- 实现计划：`docs/plans/2026-04-17-news-monitor-implementation.md`

## 当前状态

- ✅ **M0 完成**：脚手架、Docker compose、登录大屏（导航 + 占位页）。下一步 M1：RSS / HN connector + 时间轴。

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
$env:DATABASE_URL = "postgres://news:news@localhost:5432/news"
pnpm --filter @news/db migrate

# 3. 准备 .env（首次）
Copy-Item .env.example .env
# 生成密码哈希并把 stdout 填进 .env 的 AUTH_PASS_HASH
node apps/web/scripts/hash-password.mjs '你的密码'
# 同时填一个随机的 AUTH_SECRET（≥ 32 位随机字符）

# 4. 起 web（两种方式选一）
# 4a. 开发模式（热更新）
pnpm dev:web
# 4b. 容器模式（与生产一致）
cd docker
docker compose up -d --build web
```

打开 <http://localhost:3000> → 跳转登录 → 输入用户名/密码 → 看到空时间轴大屏。

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
