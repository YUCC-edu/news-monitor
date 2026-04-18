# 设计文档 vs 当前实现（差异登记）

**权威设计**：[`docs/specs/2026-04-17-news-monitor-design.md`](./specs/2026-04-17-news-monitor-design.md)  
**权威进度**：[`docs/STATUS.md`](./STATUS.md)

本表用于记录「设计写明」与「仓库现状」不一致之处，便于产品/开发统一决策；**不表示必须改代码**，也可能选择修订设计。

最后更新：2026-04-19

---

## 差异表

| 设计章节 | 设计表述 | 当前实现 | 建议决策方向 |
|---------|----------|----------|--------------|
| §2 技术栈 | 前端写 **ECharts** | 统计等页为 **CSS 轻量条形图**，`apps/web` 未依赖 `echarts` | 二选一：引入 ECharts 对齐设计；或修订设计为「轻量图表，可选 ECharts」 |
| §5.3 索引 | `items.title` **GIN trigram** | `packages/db/drizzle` 中未见 `pg_trgm` / 该索引 | 数据量上来后补迁移；或文档标注「首版未启用」 |
| §5.3 索引 | `item_enrichments.embedding` **ivfflat** | 迁移中未见 `ivfflat` | 同上；聚类查询依赖向量与 btree，大规模时需评估 |
| §6.2 | 连续失败 **指数退避**；`fail_count >= 10` **自动停源** | [`markSourceRun`](../packages/db/src/ops.ts) 主要更新计数/错误；[`scheduler`](../apps/worker/src/scheduler.ts) 为固定 `every` 间隔 | 若要对齐设计：在 worker/DB 层实现退避与自动 `enabled=false`；否则修订 §6.2 |
| §8.1 SSE | 事件含 **`source.health`**、**`cluster.updated`** | Worker 主要 publish **`item.created`** / **`item.enriched`**（见 `fetch-source` / `enrich-item`）；[`api/stream`](../apps/web/app/api/stream/route.ts) 透传 JSON | 补发事件 + 前端订阅；或从设计删除未使用事件类型 |
| §7.4 | **三粒度** re-enrich（source / 时间窗 / 单条） | 存在 [`scripts/retry-enrich-failed.ts`](../scripts/retry-enrich-failed.ts) 等脚本，**无完整 UI/API 三粒度** | 产品化 API + 设置或运维页；或文档降级为「脚本运维」 |
| §5 / §9 | **`user_links`** 手动收藏链接闭环 | [`schema`](../packages/db/src/schema.ts) 有 `user_links` 表，**Web 未接 CRUD/展示** | 实现最小 API + 一页；或明确列为后续/非目标并修订设计 |
| §1.2 | 公众号等列为 **非目标** | 已通过 **WeWe-RSS** 支持 **`wechat-wewe`**（见 README、`creators` 页） | 已在设计文档修订中区分「官方开放平台」与「WeWe 网关」 |

---

## 建议后续优先级（文档层已记录，实施时另开任务）

1. 定稿 §6.2 / §8.1 / `user_links`：做实现或正式降级设计。
2. 索引与检索：按数据量与 `q=` 体验再开迁移。
3. ECharts：与 §2 对齐方式二选一后执行。
