import postgres from "postgres";

function parseArgs() {
  const argv = process.argv.slice(2);
  const daysIdx = argv.indexOf("--days");
  const daysRaw = daysIdx >= 0 ? Number.parseInt(argv[daysIdx + 1] ?? "", 10) : 7;
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 7;
  return { days };
}

async function main() {
  const { days } = parseArgs();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const sql = postgres(url);
  try {
    const [summary] = await sql<{
      clusters_total: number;
      multi_source_clusters: number;
      single_source_clusters: number;
      avg_sources_per_cluster: number;
      avg_items_per_cluster: number;
      named_cluster_ratio: number;
    }[]>`
      WITH base AS (
        SELECT
          ie.cluster_id,
          COUNT(*)::int AS items_count,
          COUNT(DISTINCT i.source_id)::int AS source_count,
          MAX(c.topic) AS topic
        FROM item_enrichments ie
        INNER JOIN items i ON i.id = ie.item_id
        INNER JOIN clusters c ON c.id = ie.cluster_id
        WHERE ie.cluster_id IS NOT NULL
          AND i.fetched_at > now() - (${days} || ' days')::interval
        GROUP BY ie.cluster_id
      )
      SELECT
        COUNT(*)::int AS clusters_total,
        COUNT(*) FILTER (WHERE source_count >= 2)::int AS multi_source_clusters,
        COUNT(*) FILTER (WHERE source_count = 1)::int AS single_source_clusters,
        COALESCE(AVG(source_count), 0)::float AS avg_sources_per_cluster,
        COALESCE(AVG(items_count), 0)::float AS avg_items_per_cluster,
        COALESCE(
          AVG(CASE WHEN topic IS NOT NULL AND btrim(topic) <> '' AND topic <> '事件聚合' THEN 1 ELSE 0 END),
          0
        )::float AS named_cluster_ratio
      FROM base
    `;

    const [topSplitCandidates] = await sql<{ cnt: number }[]>`
      WITH base AS (
        SELECT
          ie.cluster_id,
          COUNT(*)::int AS items_count,
          COUNT(DISTINCT i.source_id)::int AS source_count
        FROM item_enrichments ie
        INNER JOIN items i ON i.id = ie.item_id
        WHERE ie.cluster_id IS NOT NULL
          AND i.fetched_at > now() - (${days} || ' days')::interval
        GROUP BY ie.cluster_id
      )
      SELECT COUNT(*)::int AS cnt
      FROM base
      WHERE source_count = 1 AND items_count >= 3
    `;

    const [taxonomyCoverage] = await sql<{
      enriched_rows: number;
      with_domain: number;
      with_topic: number;
      with_entity: number;
    }[]>`
      SELECT
        COUNT(*)::int AS enriched_rows,
        COUNT(*) FILTER (WHERE array_length(category_domain, 1) > 0)::int AS with_domain,
        COUNT(*) FILTER (WHERE array_length(category_topic, 1) > 0)::int AS with_topic,
        COUNT(*) FILTER (WHERE array_length(category_entity, 1) > 0)::int AS with_entity
      FROM item_enrichments ie
      INNER JOIN items i ON i.id = ie.item_id
      WHERE i.fetched_at > now() - (${days} || ' days')::interval
    `;

    console.log(
      JSON.stringify(
        {
          windowDays: days,
          clusterQuality: summary ?? null,
          splitRiskClusters: topSplitCandidates?.cnt ?? 0,
          taxonomyCoverage,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main();
