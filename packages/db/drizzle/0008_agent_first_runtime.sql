ALTER TABLE "item_enrichments"
  ADD COLUMN IF NOT EXISTS "enrichment_source" text NOT NULL DEFAULT 'rules',
  ADD COLUMN IF NOT EXISTS "enrichment_version" text NOT NULL DEFAULT 'rules-v1';

ALTER TABLE "clusters"
  ADD COLUMN IF NOT EXISTS "topic_source" text NOT NULL DEFAULT 'rules',
  ADD COLUMN IF NOT EXISTS "hotspot_score" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "distinct_sources" integer NOT NULL DEFAULT 0;

UPDATE "clusters" c
SET
  "distinct_sources" = COALESCE(stats.distinct_sources, 0),
  "hotspot_score" = COALESCE(stats.distinct_sources, 0) * 1000 + COALESCE(stats.items_count, 0) * 100
FROM (
  SELECT
    ie.cluster_id,
    COUNT(DISTINCT i.source_id)::int AS distinct_sources,
    COUNT(*)::int AS items_count
  FROM "item_enrichments" ie
  INNER JOIN "items" i ON i.id = ie.item_id
  WHERE ie.cluster_id IS NOT NULL
  GROUP BY ie.cluster_id
) stats
WHERE c.id = stats.cluster_id;
