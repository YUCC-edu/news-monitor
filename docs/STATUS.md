# 项目进度与里程碑快照

**单一事实来源（SSOT）**：本文件 + 根目录 [README.md](../README.md)「当前状态」一节。  
[实现计划](./plans/2026-04-17-news-monitor-implementation.md) 中的逐步 checkbox 为历史分步稿，**不以全篇 `- [ ]` 作为交付依据**。

最后更新：2026-04-21（与仓库当前结构对齐，含全局搜索与 Agent 接口增强）。

---

## 里程碑总览

| 里程碑 | 状态 | 说明与代码锚点 |
|--------|------|----------------|
| **M0** 脚手架、登录、空壳运营 UI | **完成** | Next App Router：[`apps/web/app/(auth)/`](../apps/web/app/(auth)/)、[`apps/web/middleware.ts`](../apps/web/middleware.ts)、[`apps/web/app/(dash)/layout.tsx`](../apps/web/app/(dash)/layout.tsx)；根 [`package.json`](../package.json)、[`pnpm-workspace.yaml`](../pnpm-workspace.yaml) |
| **M1** 信源 CRUD、抓取、时间轴、SSE | **完成** | API：[`apps/web/app/api/sources/`](../apps/web/app/api/sources/)、[`apps/web/app/api/items/route.ts`](../apps/web/app/api/items/route.ts)、[`apps/web/app/api/stream/route.ts`](../apps/web/app/api/stream/route.ts)；页面：[`apps/web/app/(dash)/page.tsx`](../apps/web/app/(dash)/page.tsx)、[`apps/web/app/(dash)/sources/page.tsx`](../apps/web/app/(dash)/sources/page.tsx)；Worker：[`apps/worker/src/jobs/fetch-source.ts`](../apps/worker/src/jobs/fetch-source.ts)、[`apps/worker/src/scheduler.ts`](../apps/worker/src/scheduler.ts)、[`apps/worker/src/ipc/publish.ts`](../apps/worker/src/ipc/publish.ts)；DB：[`packages/db/src/ops.ts`](../packages/db/src/ops.ts) |
| **M2** X（RSSHub） | **完成** | Connector：[`packages/connectors/x-rsshub/`](../packages/connectors/x-rsshub/)；Worker 注册：[`apps/worker/src/index.ts`](../apps/worker/src/index.ts)；信源表单见 `sources` 页 |
| **M3** 翻译、打标签、enrich 队列 | **完成** | [`packages/ai/`](../packages/ai/)、[`apps/worker/src/jobs/enrich-item.ts`](../apps/worker/src/jobs/enrich-item.ts)；`enrich-item` BullMQ 与并发见 [`apps/worker/src/index.ts`](../apps/worker/src/index.ts) |
| **M4** 聚类、多源提示、簇命名 | **完成**（含后续增强） | 聚类：[`apps/worker/src/pipeline/cluster.ts`](../apps/worker/src/pipeline/cluster.ts)、[`packages/db/src/ops.ts`](../packages/db/src/ops.ts)（`listCuratedItems`、`findTopClusterCandidates*`、`listClusterSiblingItems` 等）；命名：[`apps/worker/src/jobs/name-cluster.ts`](../apps/worker/src/jobs/name-cluster.ts)；多源 UI：[`apps/web/app/(dash)/page.tsx`](../apps/web/app/(dash)/page.tsx)（「另有 N 个源」+ Drawer）；API：[`apps/web/app/api/clusters/[clusterId]/siblings/route.ts`](../apps/web/app/api/clusters/[clusterId]/siblings/route.ts) |
| **M5** 信源健康、关键词与桌面通知 | **完成** | [`apps/web/app/(dash)/health/page.tsx`](../apps/web/app/(dash)/health/page.tsx)、[`apps/web/app/api/health/route.ts`](../apps/web/app/api/health/route.ts)；[`apps/web/app/(dash)/keywords/page.tsx`](../apps/web/app/(dash)/keywords/page.tsx)、[`apps/web/app/api/keywords/`](../apps/web/app/api/keywords/)；大屏 `Notification` 见 [`apps/web/app/(dash)/page.tsx`](../apps/web/app/(dash)/page.tsx) |
| **M6** 数据保留、备份、运维文档 | **完成（主路径）** | Retention：[`apps/worker/src/jobs/retention.ts`](../apps/worker/src/jobs/retention.ts)、Worker 内定时调度；备份：[`docker/cron-pgdump.sh`](../docker/cron-pgdump.sh) / [`docker/cron-pgdump.ps1`](../docker/cron-pgdump.ps1)；运维说明见 [README.md](../README.md)「常用运维」「运行情况判读」 |
| **M7** Web 设置中心（根 `.env`） | **完成**（实现计划未单列） | [`apps/web/app/(dash)/settings/page.tsx`](../apps/web/app/(dash)/settings/page.tsx)、[`apps/web/app/api/settings/route.ts`](../apps/web/app/api/settings/route.ts)；[`apps/web/app/(dash)/system/page.tsx`](../apps/web/app/(dash)/system/page.tsx)、[`apps/web/app/api/system/route.ts`](../apps/web/app/api/system/route.ts) |
| **M8** 信源去重、合并、头像等 | **完成（主路径）**（README 用语） | DB：`dedup_key` 等迁移于 [`packages/db/drizzle/`](../packages/db/drizzle/)；脚本 [`scripts/dedup-sources.ts`](../scripts/dedup-sources.ts)；API：[`apps/web/app/api/sources/check-dedup`](../apps/web/app/api/sources/check-dedup)、[`duplicates`](../apps/web/app/api/sources/duplicates)、[`merge`](../apps/web/app/api/sources/merge)；UI：[`apps/web/app/(dash)/sources/page.tsx`](../apps/web/app/(dash)/sources/page.tsx)；公众号博主：[`apps/web/app/(dash)/creators/page.tsx`](../apps/web/app/(dash)/creators/page.tsx)、[`apps/web/app/api/creators/counts/route.ts`](../apps/web/app/api/creators/counts/route.ts) |

---

## 其它已交付但计划未逐条列出的能力（节选）

- **收藏 / 标签 / 分类**：[`apps/web/app/(dash)/favorites/page.tsx`](../apps/web/app/(dash)/favorites/page.tsx)、[`api/favorites`](../apps/web/app/api/favorites/route.ts)、[`api/tags`](../apps/web/app/api/tags/route.ts)、[`categories`](../apps/web/app/(dash)/categories/page.tsx)
- **全局搜索（⌘K）**：[`apps/web/app/ui/command-palette.tsx`](../apps/web/app/ui/command-palette.tsx)、[`apps/web/app/api/search/global/route.ts`](../apps/web/app/api/search/global/route.ts)、[`apps/web/app/(dash)/search/page.tsx`](../apps/web/app/(dash)/search/page.tsx)
- **Agent 能力接口**：[`apps/web/app/api/agent/`](../apps/web/app/api/agent/)（对接说明见 [`docs/agent-integration/README.md`](./agent-integration/README.md)）
- **统计页**：[`apps/web/app/(dash)/stats/page.tsx`](../apps/web/app/(dash)/stats/page.tsx)（轻量 CSS 条形图，非 ECharts；见 [DESIGN-DELTA.md](./DESIGN-DELTA.md)）
- **全部分页**：[`apps/web/app/(dash)/all/page.tsx`](../apps/web/app/(dash)/all/page.tsx)
- **运维脚本**：[`scripts/retry-enrich-failed.ts`](../scripts/retry-enrich-failed.ts)、[`scripts/cleanup-repeat-jobs.ts`](../scripts/cleanup-repeat-jobs.ts) 等

---

## 与设计文档的差异登记

见 **[DESIGN-DELTA.md](./DESIGN-DELTA.md)**：索引、SSE 事件类型、抓取退避、ECharts、`user_links` 等「设计写明 vs 当前实现」对照及后续决策位。
