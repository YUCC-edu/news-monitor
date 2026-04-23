# Stats Workbench Roadmap

## Goal
Evolve `/stats` from a snapshot dashboard into a reusable analysis workbench with saved views, richer drilldowns, and stable performance under larger datasets.

## Rollout Strategy

### Milestone A: Interaction Foundation (now)
- Unified dashboard visual language on stats page.
- URL-synced filters (`range`, `platform`, `tag`, `compare`) for shareable views.
- Interactive charts (trend, platform, tags) and drilldown jumps to timeline/categories.
- Filter-aware CSV export.

### Milestone B: Analytical Depth (next)
- Add API-level period comparison for all KPIs and chart series.
- Add window-aware top-N and dynamic ranking controls.
- Add anomaly hints (spikes, drops) based on trend deltas.
- Add explanatory metadata (sampling window, filter scope, data freshness).

### Milestone C: Workbench Features
- Saved presets (named filter sets) per user.
- Multi-panel layouts (default and custom panel sets).
- Drilldown inspector panel for cluster/source/tag details without page jump.
- Comparative mode between two selected segments.

### Milestone D: Scale and Reliability
- Cache and pre-aggregation for expensive trend queries.
- Optional materialized views for historical windows.
- Background refresh indicators and stale-while-revalidate behavior.
- Client perf instrumentation and budget checks.

## Delivery Phases

1. **Phase 1 (1 sprint)**: Ship Milestone A to production.
2. **Phase 2 (1 sprint)**: Ship Milestone B with API contract stabilization.
3. **Phase 3 (2+ sprints)**: Ship Milestone C iteratively behind feature flags.
4. **Phase 4 (ongoing)**: Implement Milestone D as data volume grows.

## Success Metrics
- Stats page interaction response stays smooth under active filtering.
- Time to first meaningful chart render remains stable as data grows.
- Percentage of sessions using filter interactions or drilldowns increases.
- Reduced support requests around "stats interpretation ambiguity".

## Risks and Mitigation
- **Risk**: API complexity growth slows delivery.
  - **Mitigation**: Keep route contracts versioned and typed.
- **Risk**: Chart interactions become noisy.
  - **Mitigation**: Enforce a single interaction model (click to filter, button to drilldown).
- **Risk**: Historical queries become expensive.
  - **Mitigation**: Introduce caching/materialized views before wide rollout.
