import postgres from "postgres";
import { extractAttentionKeywords } from "@news/shared";

const GENERIC_KEYWORDS = new Set([
  "and",
  "in",
  "of",
  "the",
  "for",
  "with",
  "agent",
  "agents",
  "ai",
  "model",
  "models",
  "news",
  "update",
  "新闻",
  "动态",
  "行业",
  "相关",
]);

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
      split_risk_rate: number;
      multi_source_rate: number;
      single_source_rate: number;
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
          AVG(CASE WHEN topic IS NOT NULL AND btrim(topic) <> '' AND topic <> '浜嬩欢鑱氬悎' THEN 1 ELSE 0 END),
          0
        )::float AS named_cluster_ratio,
        COALESCE(
          COUNT(*) FILTER (WHERE source_count = 1 AND items_count >= 3)::float / NULLIF(COUNT(*)::float, 0),
          0
        )::float AS split_risk_rate,
        COALESCE(
          COUNT(*) FILTER (WHERE source_count >= 2)::float / NULLIF(COUNT(*)::float, 0),
          0
        )::float AS multi_source_rate,
        COALESCE(
          COUNT(*) FILTER (WHERE source_count = 1)::float / NULLIF(COUNT(*)::float, 0),
          0
        )::float AS single_source_rate
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

    const keywordRows = await sql<{
      id: string;
      source_id: string;
      source_name: string;
      title: string | null;
      title_zh: string | null;
      content_text: string | null;
      content_zh: string | null;
      fetched_at: Date;
    }[]>`
      SELECT
        i.id,
        i.source_id,
        s.name AS source_name,
        i.title,
        ie.title_zh,
        i.content_text,
        ie.content_zh,
        i.fetched_at
      FROM items i
      INNER JOIN sources s ON s.id = i.source_id
      LEFT JOIN item_enrichments ie ON ie.item_id = i.id
      WHERE i.fetched_at > now() - (${days} || ' days')::interval
      ORDER BY i.fetched_at DESC
      LIMIT 1000
    `;

    const keywordStats = new Map<
      string,
      { keyword: string; mentions: number; sourceIds: Set<string>; sourceNames: Set<string> }
    >();
    for (const row of keywordRows) {
      const text = [row.title_zh, row.title, row.content_zh, row.content_text]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .join(" ");
      const keywords = [...new Set(extractAttentionKeywords(text))];
      for (const keyword of keywords) {
        const key = keyword.toLowerCase();
        const current =
          keywordStats.get(key) ?? {
            keyword,
            mentions: 0,
            sourceIds: new Set<string>(),
            sourceNames: new Set<string>(),
          };
        current.mentions += 1;
        current.sourceIds.add(row.source_id);
        current.sourceNames.add(row.source_name);
        keywordStats.set(key, current);
      }
    }

    const keywordRowsOut = [...keywordStats.values()]
      .map((row) => ({
        keyword: row.keyword,
        mentions: row.mentions,
        distinctSources: row.sourceIds.size,
        sourceNames: [...row.sourceNames].sort((a, b) => a.localeCompare(b, "zh-CN")).slice(0, 5),
      }))
      .sort((a, b) => b.distinctSources - a.distinctSources || b.mentions - a.mentions || a.keyword.localeCompare(b.keyword))
      .slice(0, 20);
    const genericKeywordHits = keywordRowsOut.filter((row) => GENERIC_KEYWORDS.has(row.keyword.toLowerCase())).length;
    const multiSourceKeywordCount = [...keywordStats.values()].filter((row) => row.sourceIds.size >= 2).length;
    const singleSourceBurstCount = [...keywordStats.values()].filter((row) => row.sourceIds.size === 1 && row.mentions >= 3).length;
    const normalizeProbe = (value: string) => value.replace(/[\s._-]+/g, "").toLowerCase();
    const normalizedKeywordKeys = [...keywordStats.keys()].map(normalizeProbe);
    const entityProbe = ["deepseek-v4", "gpt-5.5", "claude code", "codex", "cursor"].map((needle) => ({
      keyword: needle,
      matched: normalizedKeywordKeys.some((key) => key.includes(normalizeProbe(needle))),
    }));

    console.log(
      JSON.stringify(
        {
          windowDays: days,
          clusterQuality: summary ?? null,
          splitRiskClusters: topSplitCandidates?.cnt ?? 0,
          splitRiskRate:
            summary && summary.clusters_total > 0
              ? Number((summary.split_risk_rate ?? 0).toFixed(4))
              : 0,
          taxonomyCoverage,
          keywordQuality: {
            sampledItems: keywordRows.length,
            extractedKeywords: keywordStats.size,
            topKeywords: keywordRowsOut,
            genericKeywordHits,
            multiSourceKeywordRatio:
              keywordStats.size > 0 ? Number((multiSourceKeywordCount / keywordStats.size).toFixed(4)) : 0,
            singleSourceBurstRatio:
              keywordStats.size > 0 ? Number((singleSourceBurstCount / keywordStats.size).toFixed(4)) : 0,
            entityProbe,
          },
          qualityGate: summary
            ? {
                multiSourceRate: Number((summary.multi_source_rate ?? 0).toFixed(4)),
                singleSourceRate: Number((summary.single_source_rate ?? 0).toFixed(4)),
                averageSourcesPerCluster: Number((summary.avg_sources_per_cluster ?? 0).toFixed(2)),
                averageItemsPerCluster: Number((summary.avg_items_per_cluster ?? 0).toFixed(2)),
              }
            : null,
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
