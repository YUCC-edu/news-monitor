# Runbook: 聚类/分类质量评测与反馈闭环

本手册用于执行 Phase D：离线评测、在线监控、人工反馈回流。

## 1) 离线评测（每日/每周）

运行窗口质量评测：

```powershell
pnpm exec tsx --env-file=.env scripts/evaluate-cluster-quality.ts --days 7
```

输出字段说明：

- `clusterQuality.multi_source_clusters`：多信源簇数量（越高通常越好）
- `clusterQuality.single_source_clusters`：单信源簇数量（过高代表碎片化）
- `clusterQuality.named_cluster_ratio`：非默认命名占比（可解释性）
- `splitRiskClusters`：潜在碎簇风险（单源且>=3条）
- `taxonomyCoverage.with_* / enriched_rows`：domain/topic/entity 覆盖率

建议阈值（起步）：

- 多信源簇占比 `>= 45%`
- `splitRiskClusters / clusters_total <= 25%`
- taxonomy 三维覆盖率均 `>= 70%`
- 非默认命名占比 `>= 80%`

## 2) 在线监控（每小时）

从 stats 页观察：

- 热门簇中是否出现“高条目但低信源”的异常上榜
- 切换 `clusterSort` 到 `sources/items/recency/cohesion` 是否结果一致可解释
- `minSources` 提升到 3 后，热点是否仍稳定

建议将以下指标接入监控系统：

- `top_clusters.avg_hybrid_score`
- `top_clusters.avg_distinct_sources`
- `taxonomy.low_confidence_ratio`
- `cluster.naming.fallback_ratio`

## 3) 人工反馈回流（运营巡检）

每日抽检 Top10 热门簇并记录：

- 误合并（应拆分）
- 漏合并（应合并）
- 分类误判（domain/topic/entity）
- 命名歧义（标题不可读）

处理路径建议：

1. 先修 taxonomy 词典（同义词/黑名单）
2. 再调 cluster 权重（`CLUSTER_SCORE_W_*`）
3. 最后调阈值（`CLUSTER_SIM_THRESHOLD` 与动态阈值参数）

## 4) 常见问题

- 热门簇“显示不全”：优先检查 `minSources` 是否过高、窗口是否过短。
- 同一事件仍碎裂：检查 `splitRiskClusters` 是否上升，必要时降低基础阈值 0.01~0.02。
- 分类回退过多：检查 `TAXONOMY_MIN_CONFIDENCE` 是否过高。
