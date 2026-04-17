# news-monitor

自用的多源资讯监控大屏：5–10 分钟内把 RSS / Hacker News / X (经 RSSHub) 的新内容采集、翻译、打标签、聚类后呈现到 Web 大屏，并对关键词命中弹桌面通知。

## 文档

- 设计：`docs/specs/2026-04-17-news-monitor-design.md`
- 实现计划：`docs/plans/2026-04-17-news-monitor-implementation.md`

## 当前状态

- M0 进行中：脚手架与登录大屏

## 快速开始（M0 完成后可用）

```powershell
# 1. 安装依赖
pnpm install

# 2. 起依赖容器（postgres / redis / rsshub）
cd docker
docker compose up -d postgres redis rsshub

# 3. 回根目录跑迁移
cd ..
$env:DATABASE_URL = "postgres://news:news@localhost:5432/news"
pnpm --filter @news/db exec tsx src/migrate.ts

# 4. 生成密码哈希并填回 .env
pnpm --filter @news/web exec node scripts/hash-password.mjs '你的密码'

# 5. 起 web
pnpm dev:web
# → http://localhost:3000
```
