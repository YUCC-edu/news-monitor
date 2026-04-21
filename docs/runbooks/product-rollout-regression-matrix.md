# Product Rollout Regression Matrix

## Regression Matrix

- Related sources correctness
  - Validate "other sources" excludes current source and deduplicates by source.
  - Validate related source count matches modal list count + current source.
- Taxonomy quality
  - Spot-check domain/topic/entity labeling on 100 sampled items.
  - Target: Top1 precision >= 80% for curated benchmark set.
- Timeline ordering
  - Default `published` ordering desc for first page and pagination.
  - Verify switching to `fetched` preserves deterministic order.
- Search and SSE
  - Verify query results remain filtered after SSE appends.
  - Verify empty-state copy in search mode.
- Health and agent endpoints
  - Verify `/api/agent/*` contract and error remediation fields.
  - Verify `trigger_reenrich` audit trail and queue enqueue success.

## KPI Acceptance

- Taxonomy hit rate (domain/topic/entity): >= 80% on weekly samples.
- Related source correctness: >= 99%.
- Timeline order correctness: 100% on automated snapshot tests.
- Agent API success ratio: >= 99% for read tools, >= 97% for write tool.

## Gray Release Strategy

1. Enable read-only agent endpoints (`search_items`, `list_trending_clusters`, `list_source_health`).
2. Observe 24h traffic and error budget.
3. Enable `trigger_reenrich` for allowlisted agents only.
4. Expand write access gradually after queue stability checks.
