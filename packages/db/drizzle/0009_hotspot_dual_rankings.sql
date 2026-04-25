ALTER TABLE "item_enrichments"
  ADD COLUMN IF NOT EXISTS "platform_metrics" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "clusters"
  ADD COLUMN IF NOT EXISTS "weighted_distinct_sources" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cross_platform_score" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "breaking_score" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "consensus_score" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "burst_velocity" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "x_signal_score" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "hn_signal_score" integer NOT NULL DEFAULT 0;

UPDATE "clusters" c
SET
  "weighted_distinct_sources" = COALESCE(stats.weighted_distinct_sources, 0),
  "cross_platform_score" = COALESCE(stats.cross_platform_score, 0),
  "breaking_score" = COALESCE(stats.breaking_score, 0),
  "consensus_score" = COALESCE(stats.consensus_score, 0),
  "burst_velocity" = COALESCE(stats.burst_velocity, 0),
  "x_signal_score" = COALESCE(stats.x_signal_score, 0),
  "hn_signal_score" = COALESCE(stats.hn_signal_score, 0)
FROM (
  SELECT
    ie.cluster_id,
    COUNT(DISTINCT i.source_id)::int AS weighted_distinct_sources,
    COUNT(DISTINCT s.kind)::int AS cross_platform_score,
    0::int AS breaking_score,
    (COUNT(DISTINCT i.source_id) * 1000 + COUNT(*) * 100)::int AS consensus_score,
    0::int AS burst_velocity,
    0::int AS x_signal_score,
    0::int AS hn_signal_score
  FROM "item_enrichments" ie
  INNER JOIN "items" i ON i.id = ie.item_id
  INNER JOIN "sources" s ON s.id = i.source_id
  WHERE ie.cluster_id IS NOT NULL
  GROUP BY ie.cluster_id
) stats
WHERE c.id = stats.cluster_id;
