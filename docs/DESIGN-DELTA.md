# 设计文档 vs 当前实现（差异登记）

**权威设计**：[`docs/specs/2026-04-17-news-monitor-design.md`](./specs/2026-04-17-news-monitor-design.md)  
**权威进度**：[`docs/STATUS.md`](./STATUS.md)

本表用于记录「设计写明」与「仓库现状」不一致之处，便于产品/开发统一决策；**不表示必须改代码**，也可能选择修订设计。

最后更新：2026-04-19

**决策列说明**：`Implement` = 本仓库已按该方向落地或已纳入迭代交付；`Defer` = 明确推迟并写触发条件；`ReviseSpec` = 以设计文档修订为准、不再当成功能缺口。

---

## 差异表

| 设计章节 | 设计表述 | 当前实现 | 建议决策方向 | 决策 | 决策说明 |
|---------|----------|----------|--------------|------|----------|
| §2 技术栈 | 前端写 **ECharts** | 统计等页为 **CSS 轻量条形图**，`apps/web` 未依赖 `echarts` | 二选一：引入 ECharts 对齐设计；或修订设计为「轻量图表，可选 ECharts」 | **ReviseSpec** | §2 表已改为「轻量 CSS 图 + ECharts 可选」；统计页补 CSV 导出，不强制引入 `echarts`。 |
| §5.3 索引 | `items.title` **GIN trigram** | 曾未见 `pg_trgm` / 该索引 | 数据量上来后补迁移；或文档标注「首版未启用」 | **Implement** | 迁移 `0005_*`：`CREATE EXTENSION pg_trgm` + `items` 标题 GIN（`gin_trgm_ops`）。 |
| §5.3 索引 | `item_enrichments.embedding` **ivfflat** | 曾未见 `ivfflat` | 同上；聚类查询依赖向量与 btree，大规模时需评估 | **Implement** | 同上迁移：`ivfflat`（cosine，`lists` 默认 50，可按体量调参）。 |
| §6.2 | 连续失败 **指数退避**；`fail_count >= 10` **自动停源** | 曾为主要固定间隔 + 计数 | 若要对齐设计：在 worker/DB 层实现退避与自动 `enabled=false`；否则修订 §6.2 | **Implement** | `sources.next_run_after` + `markSourceRun` 失败分支计算；抓取作业窗内跳过；达阈值 `enabled=false` 并 `sources.changed` + SSE `source.health`。 |
| §8.1 SSE | 事件含 **`source.health`**、**`cluster.updated`** | 曾主要 **`item.created`** / **`item.enriched`** | 补发事件 + 前端订阅；或从设计删除未使用事件类型 | **Implement** | Worker 在抓取成功/失败、自动停源及 enrich 后发布；时间轴订阅 `cluster.updated` 更新 `relatedCount`；健康页可订阅 `source.health`。 |
| §7.4 | **三粒度** re-enrich（source / 时间窗 / 单条） | 曾有脚本，**无完整 UI/API 三粒度** | 产品化 API + 设置或运维页；或文档降级为「脚本运维」 | **Implement** | `POST /api/ops/re-enrich` + `/ops` 运维页；README 链到脚本与 API。 |
| §5 / §9 | **`user_links`** 手动收藏链接闭环 | 曾有表，**Web 未接 CRUD/展示** | 实现最小 API + 一页；或明确列为后续/非目标并修订设计 | **Implement** | `GET/POST /api/user-links`、`DELETE /api/user-links/[id]` + `/link-saves` 与导航「链接收藏」。 |
| §1.2 | 公众号等列为 **非目标** | 已通过 **WeWe-RSS** 支持 **`wechat-wewe`** | 已在设计文档修订中区分「官方开放平台」与「WeWe 网关」 | **ReviseSpec** | §1.2 已写明官方 connector 非目标与 WeWe 网关说明；本行关闭。 |

---

## 建议后续优先级（文档层已记录，实施时另开任务）

1. ~~定稿 §6.2 / §8.1 / `user_links`~~：已按上表 **Implement / ReviseSpec** 落地或冻结。
2. 索引与检索：按数据量与 `q=` 体验再调 `ivfflat lists`、EXPLAIN 基线。
3. ECharts：若未来要 richer 图表，再引入 `echarts` 与 §2「可选增强」对齐。
