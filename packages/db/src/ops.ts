import { and, asc, desc, eq, ilike, inArray, lt, max, ne, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { computeDedupKey, type SourceKind } from "./dedup";
import { getDb, getSql } from "./client";
import type { Source } from "./schema";
import { displayAttentionKeyword, extractAttentionKeywords } from "@news/shared";
import {
  clusters,
  assistantActions,
  favorites,
  itemEnrichments,
  items,
  keywordRules,
  publishAttempts,
  publishTargets,
  reportRuns,
  reports,
  sources,
  userLinks,
  writingStyleProfiles,
  writingStyleSamples,
} from "./schema";

export type { SourceKind };

export type SourceInput = {
  id?: string;
  kind: SourceKind;
  name: string;
  config: unknown;
  scope?: SourceScope;
  enabled?: boolean;
  fetchIntervalSec?: number;
  initialFetchDays?: number | null;
  maxItemAgeDays?: number | null;
};

export type RecordItemInput = {
  externalId: string;
  url?: string;
  author?: string;
  title?: string;
  contentText?: string;
  media?: Array<{ type: "image" | "video"; url: string; thumb?: string }>;
  engagement?: unknown;
  publishedAt?: Date;
  raw: unknown;
};

export type MarkRunInput = {
  ok: boolean;
  at?: Date;
  error?: string;
};

export async function listSources() {
  const db = getDb();
  return db.select().from(sources).orderBy(asc(sources.createdAt));
}

export type SourceListFilter = {
  kind?: SourceKind;
  scope?: SourceScope;
  enabledOnly?: boolean;
};

export async function listSourcesWithFilter(filter?: SourceListFilter) {
  const db = getDb();
  const clauses: SQL[] = [];
  if (filter?.kind) clauses.push(eq(sources.kind, filter.kind));
  if (filter?.scope) clauses.push(eq(sources.scope, filter.scope));
  if (filter?.enabledOnly) clauses.push(eq(sources.enabled, true));
  return db
    .select()
    .from(sources)
    .where(clauses.length ? and(...clauses) : undefined)
    .orderBy(asc(sources.createdAt));
}

export async function listSourceHealth() {
  const db = getDb();
  const base = await db
    .select({
      id: sources.id,
      name: sources.name,
      kind: sources.kind,
      enabled: sources.enabled,
      fetchIntervalSec: sources.fetchIntervalSec,
      lastRunAt: sources.lastRunAt,
      lastOkAt: sources.lastOkAt,
      lastError: sources.lastError,
      failCount: sources.failCount,
      nextRunAfter: sources.nextRunAfter,
    })
    .from(sources)
    .orderBy(desc(sources.lastRunAt), asc(sources.createdAt));

  const sqlClient = getSql();
  const stats = await sqlClient<
    { source_id: string; total_24h: number; enriched_24h: number }[]
  >`
    SELECT i.source_id::text AS source_id,
      COUNT(*)::int AS total_24h,
      COUNT(*) FILTER (WHERE ie.item_id IS NOT NULL)::int AS enriched_24h
    FROM items i
    LEFT JOIN item_enrichments ie ON ie.item_id = i.id
    WHERE i.fetched_at > now() - interval '24 hours'
    GROUP BY i.source_id
  `;
  const bySource = new Map(stats.map((s) => [s.source_id, s]));
  return base.map((row) => {
    const s = bySource.get(row.id);
    const pipeline24hRate =
      s && s.total_24h > 0 ? s.enriched_24h / s.total_24h : null;
    return { ...row, pipeline24hRate };
  });
}

export async function listSourceInventory() {
  const db = getDb();
  const base = await db
    .select({
      id: sources.id,
      kind: sources.kind,
      scope: sources.scope,
      name: sources.name,
      config: sources.config,
      enabled: sources.enabled,
      fetchIntervalSec: sources.fetchIntervalSec,
      initialFetchDays: sources.initialFetchDays,
      maxItemAgeDays: sources.maxItemAgeDays,
      lastOkAt: sources.lastOkAt,
      lastError: sources.lastError,
      failCount: sources.failCount,
      pipeline24hRate: sql<number | null>`NULL::float`,
    })
    .from(sources)
    .orderBy(asc(sources.createdAt));

  const sqlClient = getSql();
  const itemStats = await sqlClient<
    {
      source_id: string;
      total_items_all_time: number;
      items_24h: number;
      items_7d: number;
      enriched_24h: number;
    }[]
  >`
    SELECT
      i.source_id::text AS source_id,
      COUNT(*)::int AS total_items_all_time,
      COUNT(*) FILTER (WHERE i.fetched_at >= now() - interval '24 hours')::int AS items_24h,
      COUNT(*) FILTER (WHERE i.fetched_at >= now() - interval '7 days')::int AS items_7d,
      COUNT(*) FILTER (WHERE i.fetched_at >= now() - interval '24 hours' AND ie.item_id IS NOT NULL)::int AS enriched_24h
    FROM items i
    LEFT JOIN item_enrichments ie ON ie.item_id = i.id
    GROUP BY i.source_id
  `;
  const clusterStats = await sqlClient<
    {
      source_id: string;
      clusters_7d: number;
      consensus_clusters_7d: number;
      single_source_clusters_7d: number;
      avg_sources_per_cluster_7d: number | null;
      avg_items_per_cluster_7d: number | null;
      max_sources_in_cluster_7d: number | null;
    }[]
  >`
    WITH cluster_members AS (
      SELECT
        i.source_id::text AS source_id,
        ie.cluster_id,
        COUNT(*)::int AS item_count,
        COUNT(DISTINCT i.source_id)::int AS distinct_sources
      FROM item_enrichments ie
      INNER JOIN items i ON i.id = ie.item_id
      WHERE ie.cluster_id IS NOT NULL
        AND i.fetched_at >= now() - interval '7 days'
      GROUP BY i.source_id, ie.cluster_id
    )
    SELECT
      source_id,
      COUNT(*)::int AS clusters_7d,
      COUNT(*) FILTER (WHERE distinct_sources >= 2)::int AS consensus_clusters_7d,
      COUNT(*) FILTER (WHERE distinct_sources = 1)::int AS single_source_clusters_7d,
      AVG(distinct_sources)::float AS avg_sources_per_cluster_7d,
      AVG(item_count)::float AS avg_items_per_cluster_7d,
      MAX(distinct_sources)::int AS max_sources_in_cluster_7d
    FROM cluster_members
    GROUP BY source_id
  `;
  const itemMap = new Map(itemStats.map((row) => [row.source_id, row]));
  const clusterMap = new Map(clusterStats.map((row) => [row.source_id, row]));

  return base.map((row) => {
    const itemRow = itemMap.get(row.id);
    const clusterRow = clusterMap.get(row.id);
    const clusters7d = clusterRow?.clusters_7d ?? 0;
    const consensusClusters7d = clusterRow?.consensus_clusters_7d ?? 0;
    const singleSourceClusters7d = clusterRow?.single_source_clusters_7d ?? 0;
    const consensusClusterRate7d = clusters7d > 0 ? consensusClusters7d / clusters7d : null;
    const noiseRatio7d = clusters7d > 0 ? singleSourceClusters7d / clusters7d : null;
    const pipeline24hRate =
      itemRow && itemRow.total_items_all_time > 0 ? itemRow.enriched_24h / itemRow.total_items_all_time : row.pipeline24hRate;
    const qualityScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          (pipeline24hRate ?? 0) * 35 +
            (consensusClusterRate7d ?? 0) * 35 +
            Math.min((clusterRow?.avg_sources_per_cluster_7d ?? 0) / 3, 1) * 20 +
            (1 - (noiseRatio7d ?? 0)) * 10,
        ),
      ),
    );
    const qualityTier: "high" | "medium" | "low" =
      qualityScore >= 70 ? "high" : qualityScore >= 45 ? "medium" : "low";
    return {
      ...row,
      pipeline24hRate,
      totalItemsAllTime: itemRow?.total_items_all_time ?? 0,
      items24h: itemRow?.items_24h ?? 0,
      items7d: itemRow?.items_7d ?? 0,
      enriched24h: itemRow?.enriched_24h ?? 0,
      clusters7d,
      consensusClusters7d,
      singleSourceClusters7d,
      avgSourcesPerCluster7d: clusterRow?.avg_sources_per_cluster_7d ?? 0,
      avgItemsPerCluster7d: clusterRow?.avg_items_per_cluster_7d ?? 0,
      maxSourcesInCluster7d: clusterRow?.max_sources_in_cluster_7d ?? 0,
      consensusClusterRate7d,
      noiseRatio7d,
      qualityScore,
      qualityTier,
    };
  });
}

export async function getSourceById(id: string) {
  const db = getDb();
  return db.query.sources.findFirst({
    where: eq(sources.id, id),
  });
}

export async function findSourceByDedup(kind: SourceKind, dedupKey: string) {
  const db = getDb();
  return db.query.sources.findFirst({
    where: and(eq(sources.kind, kind), eq(sources.dedupKey, dedupKey)),
  });
}

export type UpsertSourceResult =
  | Source
  | { conflict: true; existing: Source };

export async function upsertSource(input: SourceInput): Promise<UpsertSourceResult | null> {
  const db = getDb();
  const dedupKey = computeDedupKey(input.kind, input.config);
  const scope = normalizeSourceScope(input.scope);
  if (input.id) {
    const existing = await getSourceById(input.id);
    if (!existing) return null;

    const clash = await db.query.sources.findFirst({
      where: and(
        eq(sources.kind, input.kind),
        eq(sources.dedupKey, dedupKey),
        ne(sources.id, input.id),
      ),
    });
    if (clash) {
      return { conflict: true, existing: clash };
    }

    const prevDedupKey =
      existing.dedupKey ??
      computeDedupKey(existing.kind as SourceKind, existing.config);
    const identityChanged =
      existing.kind !== input.kind ||
      (dedupKey ?? "") !== (prevDedupKey ?? "");

    const updated = await db
      .update(sources)
      .set({
        kind: input.kind,
        name: input.name,
        config: input.config,
        scope,
        enabled: input.enabled ?? true,
        fetchIntervalSec: input.fetchIntervalSec ?? 300,
        dedupKey,
        initialFetchDays: input.initialFetchDays ?? null,
        maxItemAgeDays: input.maxItemAgeDays ?? null,
        ...(identityChanged
          ? {
              lastOkAt: null,
              lastRunAt: null,
              lastError: null,
              failCount: 0,
              nextRunAfter: null,
            }
          : {}),
      })
      .where(eq(sources.id, input.id))
      .returning();
    return updated[0] ?? null;
  }

  const existing = await findSourceByDedup(input.kind, dedupKey);
  if (existing) {
    return { conflict: true, existing };
  }

  const inserted = await db
    .insert(sources)
    .values({
      kind: input.kind,
      name: input.name,
      config: input.config,
      scope,
      enabled: input.enabled ?? true,
      fetchIntervalSec: input.fetchIntervalSec ?? 300,
      dedupKey,
      initialFetchDays: input.initialFetchDays ?? null,
      maxItemAgeDays: input.maxItemAgeDays ?? null,
    })
    .returning();
  return inserted[0] ?? null;
}

export async function backfillAllDedupKeys() {
  const db = getDb();
  const all = await db.select().from(sources);
  let updated = 0;
  for (const row of all) {
    const key = computeDedupKey(row.kind as SourceKind, row.config);
    if (row.dedupKey !== key) {
      await db.update(sources).set({ dedupKey: key }).where(eq(sources.id, row.id));
      updated += 1;
    }
  }
  return { scanned: all.length, updated };
}

export async function findDuplicateGroups() {
  const sqlClient = getSql();
  const rows = await sqlClient<
    { kind: string; dedup_key: string; ids: string[]; cnt: number }[]
  >`
    SELECT kind, dedup_key, count(*)::int AS cnt, array_agg(id::text ORDER BY created_at) AS ids
    FROM sources
    GROUP BY kind, dedup_key
    HAVING count(*) > 1
  `;
  const db = getDb();
  const groups: Array<{
    kind: string;
    dedupKey: string;
    sources: Source[];
  }> = [];
  for (const r of rows) {
    const srcRows = await db.query.sources.findMany({
      where: inArray(sources.id, r.ids),
    });
    groups.push({
      kind: r.kind,
      dedupKey: r.dedup_key,
      sources: srcRows.sort(
        (a, b) => r.ids.indexOf(a.id) - r.ids.indexOf(b.id),
      ),
    });
  }
  return groups;
}

export async function mergeSources(keepId: string, dropIds: string[]) {
  if (dropIds.length === 0) {
    return { deletedSources: 0 };
  }
  const sqlClient = getSql();
  await sqlClient.begin(async (tx) => {
    for (const dropId of dropIds) {
      await tx`
        DELETE FROM items AS i
        USING items AS k
        WHERE i.source_id = ${dropId}::uuid
          AND k.source_id = ${keepId}::uuid
          AND k.external_id = i.external_id
      `;
      await tx`
        UPDATE items SET source_id = ${keepId}::uuid WHERE source_id = ${dropId}::uuid
      `;
    }
    for (const dropId of dropIds) {
      await tx`DELETE FROM sources WHERE id = ${dropId}::uuid`;
    }
  });
  return { deletedSources: dropIds.length };
}

export async function updateSourceAvatarUrl(sourceId: string, avatarUrl: string) {
  const row = await getSourceById(sourceId);
  if (!row) return false;
  const cfg =
    row.config && typeof row.config === "object"
      ? { ...(row.config as Record<string, unknown>), avatarUrl }
      : { avatarUrl };
  if ((row.config as { avatarUrl?: string } | undefined)?.avatarUrl === avatarUrl) {
    return true;
  }
  const db = getDb();
  await db.update(sources).set({ config: cfg }).where(eq(sources.id, sourceId));
  return true;
}

export async function resetSourceFirstFetch(sourceId: string) {
  const db = getDb();
  const updated = await db
    .update(sources)
    .set({ lastOkAt: null })
    .where(eq(sources.id, sourceId))
    .returning({ id: sources.id });
  return updated.length > 0;
}

/** Latest `items.published_at` for this source (null if no rows or all null pub dates). */
export async function getMaxPublishedAtForSource(sourceId: string): Promise<Date | null> {
  const db = getDb();
  const rows = await db
    .select({ mx: max(items.publishedAt) })
    .from(items)
    .where(eq(items.sourceId, sourceId));
  const v = rows[0]?.mx;
  return v ?? null;
}

export async function listRecentItemsBySource(sourceId: string, limit = 10) {
  const db = getDb();
  return db
    .select({
      id: items.id,
      title: items.title,
      publishedAt: items.publishedAt,
      fetchedAt: items.fetchedAt,
    })
    .from(items)
    .where(eq(items.sourceId, sourceId))
    .orderBy(desc(items.fetchedAt))
    .limit(Math.min(Math.max(limit, 1), 50));
}

export async function deleteSource(id: string) {
  const db = getDb();
  const deleted = await db
    .delete(sources)
    .where(eq(sources.id, id))
    .returning({ id: sources.id });
  return deleted.length > 0;
}

export async function deleteAllSources() {
  const sqlClient = getSql();
  return sqlClient.begin(async (tx) => {
    const deletedSources = await tx<{ id: string }[]>`
      DELETE FROM sources
      RETURNING id
    `;
    const deletedClusters = await tx<{ id: string }[]>`
      DELETE FROM clusters c
      WHERE NOT EXISTS (
        SELECT 1 FROM item_enrichments ie WHERE ie.cluster_id = c.id
      )
      RETURNING id
    `;
    return {
      deletedSources: deletedSources.length,
      deletedClusters: deletedClusters.length,
    };
  });
}

export type MarkSourceRunFailureMeta = {
  enabled: boolean;
  failCount: number;
  autoDisabled: boolean;
  nextRunAfter: Date | null;
};

export async function markSourceRun(
  sourceId: string,
  input: MarkRunInput,
): Promise<MarkSourceRunFailureMeta | undefined> {
  const db = getDb();
  const at = input.at ?? new Date();
  if (input.ok) {
    await db
      .update(sources)
      .set({
        lastRunAt: at,
        lastOkAt: at,
        failCount: 0,
        lastError: null,
        nextRunAfter: null,
      })
      .where(eq(sources.id, sourceId));
    return undefined;
  }

  const sqlClient = getSql();
  const err = input.error ?? "Unknown error";
  const rows = await sqlClient<
    { fail_count: number; enabled: boolean; next_run_after: Date | null }[]
  >`
    UPDATE sources SET
      last_run_at = ${at},
      last_error = ${err},
      fail_count = fail_count + 1,
      next_run_after = now() + (
        interval '1 second'
        * LEAST((POWER(2, LEAST(fail_count + 1, 12)))::int * 60, 7200)
      ),
      enabled = CASE WHEN fail_count + 1 >= 10 THEN false ELSE enabled END
    WHERE id = ${sourceId}::uuid
    RETURNING fail_count, enabled, next_run_after
  `;
  const row = rows[0];
  if (!row) return undefined;
  return {
    enabled: row.enabled,
    failCount: row.fail_count,
    autoDisabled: !row.enabled && row.fail_count >= 10,
    nextRunAfter: row.next_run_after,
  };
}

export async function getClusterById(clusterId: string) {
  const db = getDb();
  return db.query.clusters.findFirst({
    where: eq(clusters.id, clusterId),
  });
}

export async function getClusterDistinctSourceCount(clusterId: string) {
  const sqlClient = getSql();
  const [row] = await sqlClient<{ count: number }[]>`
    SELECT COUNT(DISTINCT i.source_id)::int AS count
    FROM item_enrichments ie
    INNER JOIN items i ON i.id = ie.item_id
    WHERE ie.cluster_id = ${clusterId}::uuid
  `;
  return row?.count ?? 0;
}

export async function getClusterDistinctSourceCountByAudience(
  clusterId: string,
  audience?: "public" | "personal",
) {
  const sqlClient = getSql();
  const scope = audienceToSourceScope(audience);
  const scopeFrag = scope ? sqlClient`AND s.scope = ${scope}` : sqlClient``;
  const [row] = await sqlClient<{ count: number }[]>`
    SELECT COUNT(DISTINCT i.source_id)::int AS count
    FROM item_enrichments ie
    INNER JOIN items i ON i.id = ie.item_id
    INNER JOIN sources s ON s.id = i.source_id
    WHERE ie.cluster_id = ${clusterId}::uuid
      ${scopeFrag}
  `;
  return row?.count ?? 0;
}

export type ReEnrichScope = "source" | "window" | "item";

export async function listItemIdsForReEnrich(params: {
  scope: ReEnrichScope;
  sourceId?: string;
  since?: Date;
  until?: Date;
  itemId?: string;
  limit: number;
}): Promise<string[]> {
  const lim = Math.min(Math.max(params.limit, 1), 500);
  const db = getDb();
  if (params.scope === "item") {
    if (!params.itemId) return [];
    const row = await getItemById(params.itemId);
    return row ? [row.id] : [];
  }

  const clauses: SQL[] = [];
  if (params.scope === "source") {
    if (!params.sourceId) return [];
    clauses.push(eq(items.sourceId, params.sourceId));
  }
  if (params.since) {
    clauses.push(
      sql`COALESCE(${items.publishedAt}, ${items.fetchedAt}) >= ${params.since.toISOString()}::timestamptz`,
    );
  }
  if (params.until) {
    clauses.push(
      sql`COALESCE(${items.publishedAt}, ${items.fetchedAt}) <= ${params.until.toISOString()}::timestamptz`,
    );
  }

  const rows = await db
    .select({ id: items.id })
    .from(items)
    .where(clauses.length ? and(...clauses) : undefined)
    .orderBy(desc(items.fetchedAt))
    .limit(lim);
  return rows.map((r) => r.id);
}

export async function listUserLinks(limit = 200) {
  const db = getDb();
  return db
    .select()
    .from(userLinks)
    .orderBy(desc(userLinks.createdAt))
    .limit(Math.min(Math.max(limit, 1), 500));
}

export async function addUserLink(url: string, note?: string | null) {
  const db = getDb();
  const rows = await db
    .insert(userLinks)
    .values({ url, note: note ?? null })
    .returning();
  return rows[0] ?? null;
}

export async function deleteUserLink(id: string) {
  const db = getDb();
  const deleted = await db
    .delete(userLinks)
    .where(eq(userLinks.id, id))
    .returning({ id: userLinks.id });
  return deleted.length > 0;
}

export async function recordItems(sourceId: string, payload: RecordItemInput[]) {
  if (payload.length === 0) return [] as Array<{ id: string; title: string | null }>;
  const db = getDb();
  const rows = payload.map((item) => ({
    sourceId,
    externalId: item.externalId,
    url: item.url ?? null,
    author: item.author ?? null,
    title: item.title ?? null,
    contentText: item.contentText ?? null,
    media: item.media ?? [],
    publishedAt: item.publishedAt ?? null,
    raw:
      item.engagement && item.raw && typeof item.raw === "object" && !Array.isArray(item.raw)
        ? { ...(item.raw as Record<string, unknown>), _normalizedEngagement: item.engagement }
        : item.engagement
          ? { raw: item.raw, _normalizedEngagement: item.engagement }
          : item.raw,
  }));
  return db
    .insert(items)
    .values(rows)
    .onConflictDoNothing({
      target: [items.sourceId, items.externalId],
    })
    .returning({
      id: items.id,
      title: items.title,
      contentText: items.contentText,
      sourceId: items.sourceId,
    });
}

export async function getItemById(itemId: string) {
  const db = getDb();
  return db.query.items.findFirst({
    where: eq(items.id, itemId),
  });
}

export async function upsertItemEnrichment(input: {
  itemId: string;
  lang: "zh" | "en";
  titleZh?: string;
  contentZh?: string;
  tags: string[];
  categoryDomain?: string[];
  categoryTopic?: string[];
  categoryEntity?: string[];
  embedding?: number[];
  clusterId?: string | null;
  enrichmentSource?: "llm" | "rules";
  enrichmentVersion?: string;
  platformMetrics?: Record<string, unknown>;
  fullContentText?: string;
  contentSummaryZh?: string;
  contentExtractSource?: "url" | "feed" | "none";
  contentQualityScore?: number;
  summaryVersion?: string;
  llmKeywords?: string[];
  eventSummary?: string;
}) {
  const db = getDb();
  const enrichmentSource = input.enrichmentSource ?? "rules";
  const enrichmentVersion = input.enrichmentVersion ?? (enrichmentSource === "llm" ? "llm-v1" : "rules-v1");
  const platformMetrics = input.platformMetrics ?? {};
  const contentExtractSource = input.contentExtractSource ?? "feed";
  const contentQualityScore = Math.min(Math.max(input.contentQualityScore ?? 0, 0), 100);
  const summaryVersion = input.summaryVersion ?? "none";
  const llmKeywords = input.llmKeywords ?? [];
  await db
    .insert(itemEnrichments)
    .values({
      itemId: input.itemId,
      lang: input.lang,
      titleZh: input.titleZh ?? null,
      contentZh: input.contentZh ?? null,
      tags: input.tags,
      categoryDomain: input.categoryDomain ?? [],
      categoryTopic: input.categoryTopic ?? [],
      categoryEntity: input.categoryEntity ?? [],
      embedding: input.embedding,
      enrichmentSource,
      enrichmentVersion,
      platformMetrics,
      fullContentText: input.fullContentText ?? null,
      contentSummaryZh: input.contentSummaryZh ?? null,
      contentExtractSource,
      contentQualityScore,
      summaryVersion,
      llmKeywords,
      eventSummary: input.eventSummary ?? null,
      clusterId: input.clusterId ?? null,
      enrichedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: itemEnrichments.itemId,
      set: {
        lang: input.lang,
        titleZh: input.titleZh ?? null,
        contentZh: input.contentZh ?? null,
        tags: input.tags,
        categoryDomain: input.categoryDomain ?? [],
        categoryTopic: input.categoryTopic ?? [],
        categoryEntity: input.categoryEntity ?? [],
        embedding: input.embedding,
        enrichmentSource,
        enrichmentVersion,
        platformMetrics,
        fullContentText: input.fullContentText ?? null,
        contentSummaryZh: input.contentSummaryZh ?? null,
        contentExtractSource,
        contentQualityScore,
        summaryVersion,
        llmKeywords,
        eventSummary: input.eventSummary ?? null,
        clusterId: input.clusterId ?? null,
        enrichedAt: new Date(),
      },
    });
}

export type ClusterEmbeddingSearchHit = {
  clusterId: string;
  sim: number;
};

export type ClusterMemberSearchOptions = {
  /** Lookback window on `item_enrichments.enriched_at` for member-based search. Default 72. */
  neighborHours?: number;
  /** Max distinct clusters (best-matching member per cluster). Default 8. */
  topK?: number;
};

export type ClusterCentroidSearchOptions = {
  topK?: number;
};

/**
 * Nearest clusters by stored centroid embedding (if backfilled / maintained by worker).
 */
export async function findTopClusterCandidatesByCentroid(
  embedding: number[],
  options?: ClusterCentroidSearchOptions,
): Promise<ClusterEmbeddingSearchHit[]> {
  const sqlClient = getSql();
  const topK = Math.min(Math.max(options?.topK ?? 5, 1), 50);
  const vec = `[${embedding.join(",")}]`;
  const rows = await sqlClient<{ cluster_id: string; sim: number }[]>`
    SELECT c.id AS cluster_id, 1 - (c.centroid_embedding <=> ${vec}::vector) AS sim
    FROM clusters c
    WHERE c.centroid_embedding IS NOT NULL
    ORDER BY c.centroid_embedding <=> ${vec}::vector ASC
    LIMIT ${topK}
  `;
  return rows.map((r) => ({ clusterId: r.cluster_id, sim: r.sim }));
}

/**
 * Top clusters by best member embedding similarity within a recent enrichment window.
 */
export async function findTopClusterCandidatesByMemberEmbedding(
  embedding: number[],
  options?: ClusterMemberSearchOptions,
): Promise<ClusterEmbeddingSearchHit[]> {
  const sqlClient = getSql();
  const neighborHours = Math.min(Math.max(options?.neighborHours ?? 72, 1), 24 * 60);
  const topK = Math.min(Math.max(options?.topK ?? 8, 1), 50);
  const vec = `[${embedding.join(",")}]`;
  const rows = await sqlClient<{ cluster_id: string; sim: number }[]>`
    SELECT sub.cluster_id, sub.sim
    FROM (
      SELECT
        ie.cluster_id AS cluster_id,
        1 - (ie.embedding <=> ${vec}::vector) AS sim,
        ROW_NUMBER() OVER (
          PARTITION BY ie.cluster_id
          ORDER BY ie.embedding <=> ${vec}::vector ASC
        ) AS rn
      FROM item_enrichments ie
      WHERE ie.cluster_id IS NOT NULL
        AND ie.embedding IS NOT NULL
        AND ie.enriched_at > now() - (${neighborHours} * interval '1 hour')
    ) sub
    WHERE sub.rn = 1
    ORDER BY sub.sim DESC
    LIMIT ${topK}
  `;
  return rows.map((r) => ({ clusterId: r.cluster_id, sim: r.sim }));
}

/** @deprecated Use centroid + member candidate helpers from the worker pipeline. */
export async function findNearestClusterByEmbedding(embedding: number[]) {
  const hits = await findTopClusterCandidatesByMemberEmbedding(embedding, {
    neighborHours: 72,
    topK: 1,
  });
  const top = hits[0];
  return top ? { cluster_id: top.clusterId, sim: top.sim } : null;
}

export async function updateClusterCentroidAfterItemEnriched(
  clusterId: string,
  embedding: number[],
): Promise<void> {
  const db = getDb();
  const row = await db
    .select({
      itemCount: clusters.itemCount,
      centroid: clusters.centroidEmbedding,
    })
    .from(clusters)
    .where(eq(clusters.id, clusterId))
    .limit(1);
  const cur = row[0];
  if (!cur) return;
  const n = Math.max(1, cur.itemCount);
  const prev = cur.centroid;
  let next: number[];
  if (!prev || prev.length === 0) {
    next = embedding;
  } else {
    const dim = Math.max(prev.length, embedding.length);
    next = new Array(dim);
    for (let i = 0; i < dim; i++) {
      const a = prev[i] ?? 0;
      const b = embedding[i] ?? 0;
      next[i] = (a * (n - 1) + b) / n;
    }
  }
  await db.update(clusters).set({ centroidEmbedding: next }).where(eq(clusters.id, clusterId));
}

export type ClusterSiblingRow = {
  itemId: string;
  title: string | null;
  titleZh: string | null;
  url: string | null;
  sourceId: string;
  sourceName: string;
  platform: string;
  sourceConfig: unknown;
};

/** Recent items in a cluster for the "other sources" UI. */
export async function listClusterSiblingItems(params: {
  clusterId: string;
  excludeItemId?: string;
  excludeSourceId?: string;
  limit?: number;
  audience?: "public" | "personal";
}): Promise<ClusterSiblingRow[]> {
  const pg = getSql();
  const limit = Math.min(Math.max(params.limit ?? 30, 1), 100);
  const excludeItemFrag = params.excludeItemId ? pg`AND i.id <> ${params.excludeItemId}::uuid` : pg``;
  const excludeSourceFrag = params.excludeSourceId
    ? pg`AND i.source_id <> ${params.excludeSourceId}::uuid`
    : pg``;
  const scope = audienceToSourceScope(params.audience);
  const scopeFrag = scope ? pg`AND s.scope = ${scope}` : pg``;
  const rows = await pg<
    {
      item_id: string;
      title: string | null;
      title_zh: string | null;
      url: string | null;
      source_id: string;
      source_name: string;
      platform: string;
      source_config: unknown;
    }[]
  >`
    WITH ranked AS (
      SELECT
        i.id AS item_id,
        i.title,
        ie.title_zh,
        i.url,
        i.source_id,
        s.name AS source_name,
        s.kind AS platform,
        s.config AS source_config,
        ROW_NUMBER() OVER (
          PARTITION BY i.source_id
          ORDER BY COALESCE(i.published_at, i.fetched_at) DESC, i.fetched_at DESC, i.id DESC
        ) AS rn
      FROM items i
      INNER JOIN item_enrichments ie ON ie.item_id = i.id
      INNER JOIN sources s ON s.id = i.source_id
      WHERE ie.cluster_id = ${params.clusterId}::uuid
        ${excludeItemFrag}
        ${excludeSourceFrag}
        ${scopeFrag}
    )
    SELECT item_id, title, title_zh, url, source_id, source_name, platform, source_config
    FROM ranked
    WHERE rn = 1
    ORDER BY source_name ASC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    itemId: r.item_id,
    title: r.title,
    titleZh: r.title_zh,
    url: r.url,
    sourceId: r.source_id,
    sourceName: r.source_name,
    platform: r.platform,
    sourceConfig: r.source_config,
  }));
}

export async function createCluster() {
  const db = getDb();
  const inserted = await db
    .insert(clusters)
    .values({
      topic: null,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      itemCount: 0,
    })
    .returning({ id: clusters.id });
  return inserted[0]?.id ?? null;
}

export async function bumpCluster(clusterId: string) {
  const db = getDb();
  await db
    .update(clusters)
    .set({
      itemCount: sql`${clusters.itemCount} + 1`,
      lastSeenAt: new Date(),
    })
    .where(eq(clusters.id, clusterId));
}

export async function setClusterTopic(
  clusterId: string,
  topic: string,
  topicSource: "rules" | "llm" = "rules",
) {
  const db = getDb();
  await db.update(clusters).set({ topic, topicSource }).where(eq(clusters.id, clusterId));
}

export async function getClusterRecentTitles(clusterId: string, limit = 5) {
  const db = getDb();
  const rows = await db
    .select({
      title: items.title,
      titleZh: itemEnrichments.titleZh,
    })
    .from(itemEnrichments)
    .innerJoin(items, eq(items.id, itemEnrichments.itemId))
    .where(eq(itemEnrichments.clusterId, clusterId))
    .orderBy(desc(itemEnrichments.enrichedAt))
    .limit(limit);
  return rows.map((row) => row.titleZh ?? row.title ?? "").filter(Boolean);
}

export async function getClusterNamingContext(clusterId: string, limit = 8) {
  const sqlClient = getSql();
  const rows = await sqlClient<
    { title: string | null; title_zh: string | null; tags: string[] | null; entities: string[] | null }[]
  >`
    SELECT
      i.title,
      ie.title_zh,
      ie.tags,
      ie.category_entity AS entities
    FROM item_enrichments ie
    INNER JOIN items i ON i.id = ie.item_id
    WHERE ie.cluster_id = ${clusterId}::uuid
    ORDER BY ie.enriched_at DESC
    LIMIT ${Math.min(Math.max(limit, 3), 20)}
  `;
  const titles = rows
    .map((r) => (r.title_zh ?? r.title ?? "").trim())
    .filter(Boolean)
    .slice(0, limit);
  const tags = [...new Set(rows.flatMap((r) => r.tags ?? []).map((x) => x.trim()).filter(Boolean))].slice(0, 8);
  const entities = [
    ...new Set(rows.flatMap((r) => r.entities ?? []).map((x) => x.trim()).filter(Boolean)),
  ].slice(0, 8);
  return { titles, tags, entities };
}

export async function getDataHealthSnapshot() {
  const sqlClient = getSql();
  const [row] = await sqlClient<{
    sources: number;
    enabled_sources: number;
    items: number;
    enrichments: number;
    clusters: number;
    orphan_clusters: number;
  }[]>`
    SELECT
      (SELECT count(*)::int FROM sources) AS sources,
      (SELECT count(*)::int FROM sources WHERE enabled) AS enabled_sources,
      (SELECT count(*)::int FROM items) AS items,
      (SELECT count(*)::int FROM item_enrichments) AS enrichments,
      (SELECT count(*)::int FROM clusters) AS clusters,
      (SELECT count(*)::int
        FROM clusters c
        WHERE NOT EXISTS (
          SELECT 1 FROM item_enrichments ie WHERE ie.cluster_id = c.id
        )
      ) AS orphan_clusters
  `;
  return {
    sources: row?.sources ?? 0,
    enabledSources: row?.enabled_sources ?? 0,
    items: row?.items ?? 0,
    enrichments: row?.enrichments ?? 0,
    clusters: row?.clusters ?? 0,
    orphanClusters: row?.orphan_clusters ?? 0,
  };
}

export async function logAssistantAction(input: {
  requestId: string;
  actor: string;
  role: string;
  tool: string;
  status: string;
  inputSummary?: string;
  outputSummary?: string;
  errorMessage?: string;
  latencyMs?: number;
}) {
  const db = getDb();
  const rows = await db
    .insert(assistantActions)
    .values({
      requestId: input.requestId,
      actor: input.actor,
      role: input.role,
      tool: input.tool,
      status: input.status,
      inputSummary: input.inputSummary ?? null,
      outputSummary: input.outputSummary ?? null,
      errorMessage: input.errorMessage ?? null,
      latencyMs: input.latencyMs ?? null,
    })
    .returning();
  return rows[0] ?? null;
}

export type ReportStatus = "draft" | "published" | "partial" | "failed";
export type PublishTargetKind = "wechat" | "feishu" | "obsidian";
export type PublishAttemptStatus = "running" | "ok" | "error" | "skipped";

export type ReportPayloadInput = {
  reportDate: string;
  title: string;
  audience: "public" | "personal";
  range: "24h" | "72h" | "7d" | "30d" | "90d";
  topN: number;
  minSources: number;
  draft: unknown;
  markdown: string;
  wechatHtml: string;
  feishuPayload: unknown;
  obsidianMarkdown: string;
  status?: ReportStatus;
};

export async function upsertReport(input: ReportPayloadInput) {
  const db = getDb();
  const now = new Date();
  const rows = await db
    .insert(reports)
    .values({
      reportDate: input.reportDate,
      title: input.title,
      audience: input.audience,
      range: input.range,
      topN: input.topN,
      minSources: input.minSources,
      status: input.status ?? "draft",
      draft: input.draft,
      markdown: input.markdown,
      wechatHtml: input.wechatHtml,
      feishuPayload: input.feishuPayload,
      obsidianMarkdown: input.obsidianMarkdown,
      edited: false,
      generatedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [reports.reportDate, reports.audience, reports.range],
      set: {
        title: input.title,
        topN: input.topN,
        minSources: input.minSources,
        status: input.status ?? "draft",
        draft: input.draft,
        markdown: input.markdown,
        wechatHtml: input.wechatHtml,
        feishuPayload: input.feishuPayload,
        obsidianMarkdown: input.obsidianMarkdown,
        edited: false,
        generatedAt: now,
        updatedAt: now,
      },
    })
    .returning();
  return rows[0] ?? null;
}

export async function listReports(limit = 30) {
  const db = getDb();
  const reportRows = await db
    .select()
    .from(reports)
    .orderBy(desc(reports.reportDate), desc(reports.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));
  if (reportRows.length === 0) return [];
  const ids = reportRows.map((row) => row.id);
  const attempts = await db
    .select()
    .from(publishAttempts)
    .where(inArray(publishAttempts.reportId, ids))
    .orderBy(desc(publishAttempts.createdAt));
  const byReport = new Map<string, typeof attempts>();
  for (const attempt of attempts) {
    const bucket = byReport.get(attempt.reportId) ?? [];
    bucket.push(attempt);
    byReport.set(attempt.reportId, bucket);
  }
  return reportRows.map((report) => ({
    ...report,
    attempts: byReport.get(report.id) ?? [],
  }));
}

export async function getReportWithAttempts(id: string) {
  const db = getDb();
  const report = await db.query.reports.findFirst({
    where: eq(reports.id, id),
  });
  if (!report) return null;
  const attempts = await db
    .select()
    .from(publishAttempts)
    .where(eq(publishAttempts.reportId, id))
    .orderBy(desc(publishAttempts.createdAt));
  return { ...report, attempts };
}

export async function updateReportContent(input: {
  id: string;
  title?: string;
  markdown?: string;
  wechatHtml?: string;
  obsidianMarkdown?: string;
  feishuPayload?: unknown;
  styledTitle?: string | null;
  styledMarkdown?: string | null;
  styledWechatHtml?: string | null;
  styleImageBriefs?: unknown;
  status?: ReportStatus;
}) {
  const db = getDb();
  const rows = await db
    .update(reports)
    .set({
      ...(input.title != null ? { title: input.title } : {}),
      ...(input.markdown != null ? { markdown: input.markdown } : {}),
      ...(input.wechatHtml != null ? { wechatHtml: input.wechatHtml } : {}),
      ...(input.obsidianMarkdown != null ? { obsidianMarkdown: input.obsidianMarkdown } : {}),
      ...(input.feishuPayload != null ? { feishuPayload: input.feishuPayload } : {}),
      ...(input.styledTitle !== undefined ? { styledTitle: input.styledTitle } : {}),
      ...(input.styledMarkdown !== undefined ? { styledMarkdown: input.styledMarkdown } : {}),
      ...(input.styledWechatHtml !== undefined ? { styledWechatHtml: input.styledWechatHtml } : {}),
      ...(input.styleImageBriefs !== undefined ? { styleImageBriefs: input.styleImageBriefs } : {}),
      ...(input.status != null ? { status: input.status } : {}),
      edited: true,
      updatedAt: new Date(),
    })
    .where(eq(reports.id, input.id))
    .returning();
  return rows[0] ?? null;
}

export type ReportStyledContentInput = {
  id: string;
  styleProfileId?: string | null;
  styledTitle: string;
  styledMarkdown: string;
  styledWechatHtml: string;
  styleImageBriefs?: unknown;
};

export async function setReportStyledContent(input: ReportStyledContentInput) {
  const db = getDb();
  const now = new Date();
  const rows = await db
    .update(reports)
    .set({
      styleProfileId: input.styleProfileId ?? null,
      styledTitle: input.styledTitle,
      styledMarkdown: input.styledMarkdown,
      styledWechatHtml: input.styledWechatHtml,
      styleImageBriefs: input.styleImageBriefs ?? [],
      styledAt: now,
      updatedAt: now,
    })
    .where(eq(reports.id, input.id))
    .returning();
  return rows[0] ?? null;
}

export async function setReportStatus(id: string, status: ReportStatus) {
  const db = getDb();
  const rows = await db
    .update(reports)
    .set({ status, updatedAt: new Date() })
    .where(eq(reports.id, id))
    .returning();
  return rows[0] ?? null;
}

export type WritingStyleProfileUpdateInput = {
  id?: string;
  name?: string;
  description?: string | null;
  rules?: unknown;
  status?: "active" | "archived";
};

export type WritingStyleSampleCreateInput = {
  profileId?: string | null;
  title: string;
  sourceUrl?: string | null;
  contentMarkdown: string;
  wechatHtml?: string | null;
  coverImageUrl?: string | null;
  inlineImages?: unknown;
  imageNotes?: string | null;
  extracted?: unknown;
};

export async function ensureDefaultWritingStyleProfile() {
  const db = getDb();
  const existing = await db.query.writingStyleProfiles.findFirst({
    where: eq(writingStyleProfiles.status, "active"),
    orderBy: [desc(writingStyleProfiles.updatedAt)],
  });
  if (existing) return existing;
  const rows = await db
    .insert(writingStyleProfiles)
    .values({
      name: "Default WeChat Style",
      description: "Imported WeChat article style profile",
      status: "active",
      rules: {},
      sampleCount: 0,
    })
    .returning();
  return rows[0] ?? null;
}

export async function getActiveWritingStyleProfile(profileId?: string | null) {
  const db = getDb();
  if (profileId) {
    return db.query.writingStyleProfiles.findFirst({
      where: eq(writingStyleProfiles.id, profileId),
    });
  }
  const existing = await db.query.writingStyleProfiles.findFirst({
    where: eq(writingStyleProfiles.status, "active"),
    orderBy: [desc(writingStyleProfiles.updatedAt)],
  });
  return existing ?? ensureDefaultWritingStyleProfile();
}

export async function updateWritingStyleProfile(input: WritingStyleProfileUpdateInput) {
  const profile = input.id
    ? await getActiveWritingStyleProfile(input.id)
    : await ensureDefaultWritingStyleProfile();
  if (!profile) return null;
  const db = getDb();
  const rows = await db
    .update(writingStyleProfiles)
    .set({
      ...(input.name != null ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.rules !== undefined ? { rules: input.rules } : {}),
      ...(input.status != null ? { status: input.status } : {}),
      updatedAt: new Date(),
    })
    .where(eq(writingStyleProfiles.id, profile.id))
    .returning();
  return rows[0] ?? null;
}

export async function refreshWritingStyleProfileFromSamples(
  profileId: string,
  rules: unknown,
  sampleCount: number,
) {
  const db = getDb();
  const rows = await db
    .update(writingStyleProfiles)
    .set({
      rules,
      sampleCount,
      updatedAt: new Date(),
    })
    .where(eq(writingStyleProfiles.id, profileId))
    .returning();
  return rows[0] ?? null;
}

export async function createWritingStyleSample(input: WritingStyleSampleCreateInput) {
  const profile = input.profileId
    ? await getActiveWritingStyleProfile(input.profileId)
    : await ensureDefaultWritingStyleProfile();
  if (!profile) return null;
  const db = getDb();
  const rows = await db
    .insert(writingStyleSamples)
    .values({
      profileId: profile.id,
      title: input.title,
      sourceUrl: input.sourceUrl ?? null,
      contentMarkdown: input.contentMarkdown,
      wechatHtml: input.wechatHtml ?? null,
      coverImageUrl: input.coverImageUrl ?? null,
      inlineImages: input.inlineImages ?? [],
      imageNotes: input.imageNotes ?? null,
      extracted: input.extracted ?? {},
    })
    .returning();
  return rows[0] ?? null;
}

export async function listWritingStyleSamples(limit = 30, profileId?: string | null) {
  const db = getDb();
  const lim = Math.min(Math.max(limit, 1), 200);
  return db
    .select()
    .from(writingStyleSamples)
    .where(profileId ? eq(writingStyleSamples.profileId, profileId) : undefined)
    .orderBy(desc(writingStyleSamples.createdAt))
    .limit(lim);
}

export async function createReportRun(input: {
  trigger: string;
  params: unknown;
}) {
  const db = getDb();
  const rows = await db
    .insert(reportRuns)
    .values({
      trigger: input.trigger,
      params: input.params,
      status: "running",
    })
    .returning();
  return rows[0] ?? null;
}

export async function finishReportRun(input: {
  id: string;
  reportId?: string | null;
  status: "ok" | "error";
  errorMessage?: string | null;
}) {
  const db = getDb();
  const rows = await db
    .update(reportRuns)
    .set({
      reportId: input.reportId ?? null,
      status: input.status,
      errorMessage: input.errorMessage ?? null,
      finishedAt: new Date(),
    })
    .where(eq(reportRuns.id, input.id))
    .returning();
  return rows[0] ?? null;
}

export async function ensurePublishTargets() {
  const db = getDb();
  const kinds: PublishTargetKind[] = ["wechat", "feishu", "obsidian"];
  await Promise.all(
    kinds.map((kind) =>
      db
        .insert(publishTargets)
        .values({ kind, enabled: true, config: {} })
        .onConflictDoNothing({ target: publishTargets.kind }),
    ),
  );
  return listPublishTargets();
}

export async function listPublishTargets(enabledOnly = false) {
  const db = getDb();
  return db
    .select()
    .from(publishTargets)
    .where(enabledOnly ? eq(publishTargets.enabled, true) : undefined)
    .orderBy(asc(publishTargets.kind));
}

export async function getPublishAttempt(id: string) {
  const db = getDb();
  return db.query.publishAttempts.findFirst({
    where: eq(publishAttempts.id, id),
  });
}

export async function createPublishAttempt(input: {
  reportId: string;
  targetId?: string | null;
  targetKind: PublishTargetKind;
  trigger: string;
}) {
  const db = getDb();
  const rows = await db
    .insert(publishAttempts)
    .values({
      reportId: input.reportId,
      targetId: input.targetId ?? null,
      targetKind: input.targetKind,
      trigger: input.trigger,
      status: "running",
    })
    .returning();
  return rows[0] ?? null;
}

export async function finishPublishAttempt(input: {
  id: string;
  status: PublishAttemptStatus;
  externalId?: string | null;
  externalUrl?: string | null;
  output?: unknown;
  errorMessage?: string | null;
}) {
  const db = getDb();
  const rows = await db
    .update(publishAttempts)
    .set({
      status: input.status,
      externalId: input.externalId ?? null,
      externalUrl: input.externalUrl ?? null,
      output: input.output ?? {},
      errorMessage: input.errorMessage ?? null,
      finishedAt: new Date(),
    })
    .where(eq(publishAttempts.id, input.id))
    .returning();
  return rows[0] ?? null;
}

export async function listAssistantActions(limit = 100) {
  const db = getDb();
  return db
    .select()
    .from(assistantActions)
    .orderBy(desc(assistantActions.createdAt))
    .limit(Math.min(Math.max(limit, 1), 500));
}

export type ItemListRow = {
  id: string;
  sourceId: string;
  platform: string;
  sourceName: string;
  sourceConfig: unknown;
  title: string | null;
  url: string | null;
  author: string | null;
  contentText: string | null;
  titleZh: string | null;
  contentZh: string | null;
  contentSummaryZh: string | null;
  eventSummary: string | null;
  tags: string[] | null;
  categoryDomain: string[] | null;
  categoryTopic: string[] | null;
  categoryEntity: string[] | null;
  clusterId: string | null;
  clusterTopic: string | null;
  relatedCount: number | null;
  relatedSourceCount: number | null;
  clusterItemCount: number | null;
  publishedAt: Date | null;
  fetchedAt: Date;
  favoritedAt: Date | null;
};

async function listCuratedItems(params: {
  limit?: number;
  before?: Date;
  /** Lower bound on COALESCE(published_at, fetched_at) for time-range filters. */
  publishedSince?: Date;
  audience?: "public" | "personal";
  platform?: string;
  q?: string;
  tags?: string[];
  favoritedOnly?: boolean;
  sortBy?: "published" | "fetched";
}): Promise<ItemListRow[]> {
  const pg = getSql();
  const curatedMinClusterSize = Math.max(
    1,
    Number.parseInt(process.env.CURATED_MIN_CLUSTER_SIZE ?? "2", 10) || 2,
  );
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const publishedSinceIso = params.publishedSince?.toISOString();
  const scope = audienceToSourceScope(params.audience);
  const qLike = params.q ? `%${params.q}%` : null;
  const tagsLiteral =
    params.tags && params.tags.length > 0
      ? `{${params.tags.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(",")}}`
      : null;

  const scopeFrag = scope ? pg`AND sources.scope = ${scope}` : pg``;
  const platformFrag = params.platform ? pg`AND sources.kind = ${params.platform}` : pg``;
  const qFrag =
    params.q && qLike
      ? pg`AND (
          items.title ILIKE ${qLike}
          OR items.content_text ILIKE ${qLike}
          OR ie.title_zh ILIKE ${qLike}
          OR ie.content_zh ILIKE ${qLike}
        )`
      : pg``;
  const tagsFrag =
    tagsLiteral !== null ? pg`AND ie.tags @> ${tagsLiteral}::text[]` : pg``;
  const favFrag = params.favoritedOnly
    ? pg`AND EXISTS (SELECT 1 FROM favorites f WHERE f.item_id = items.id)`
    : pg``;
  const sortBy = params.sortBy ?? "published";
  const beforeFrag =
    params.before && sortBy === "published"
      ? pg`AND COALESCE(items.published_at, picked.fetched_at) < ${params.before}`
      : params.before
        ? pg`AND picked.fetched_at < ${params.before}`
        : pg``;
  const sinceFrag = publishedSinceIso
    ? pg`AND COALESCE(items.published_at, items.fetched_at) >= ${publishedSinceIso}::timestamptz`
    : pg``;

  type SqlRow = {
    id: string;
    source_id: string;
    platform: string;
    source_name: string;
    source_config: unknown;
    title: string | null;
    url: string | null;
    author: string | null;
    content_text: string | null;
    title_zh: string | null;
    content_zh: string | null;
    content_summary_zh: string | null;
    event_summary: string | null;
    tags: string[] | null;
    category_domain: string[] | null;
    category_topic: string[] | null;
    category_entity: string[] | null;
    cluster_id: string;
    cluster_topic: string | null;
    related_count: number;
    cluster_item_count: number;
    published_at: Date | null;
    fetched_at: Date;
    favorited_at: Date | null;
  };

  const rows = await pg<SqlRow[]>`
    WITH base AS (
      SELECT
        items.id AS id,
        items.source_id AS source_id,
        items.fetched_at AS fetched_at,
        ie.cluster_id AS cluster_id,
        c.item_count AS item_count,
        c.topic AS topic,
        c.last_seen_at AS last_seen_at
      FROM items
      INNER JOIN sources ON sources.id = items.source_id
      INNER JOIN item_enrichments ie ON ie.item_id = items.id AND ie.cluster_id IS NOT NULL
      INNER JOIN clusters c ON c.id = ie.cluster_id AND c.item_count >= ${curatedMinClusterSize}
      WHERE true
        ${scopeFrag}
        ${platformFrag}
        ${qFrag}
        ${tagsFrag}
        ${favFrag}
        ${sinceFrag}
    ),
    picked AS (
      SELECT DISTINCT ON (cluster_id)
        id,
        source_id,
        fetched_at,
        cluster_id,
        item_count,
        topic,
        last_seen_at
      FROM base
      ORDER BY cluster_id, fetched_at DESC NULLS LAST, id DESC
    )
    SELECT
      picked.id AS id,
      picked.source_id,
      sources.kind AS platform,
      sources.name AS source_name,
      sources.config AS source_config,
      items.title,
      items.url,
      items.author,
      items.content_text,
      ie.title_zh,
      ie.content_zh,
      ie.content_summary_zh,
      ie.event_summary,
      ie.tags,
      ie.category_domain,
      ie.category_topic,
      ie.category_entity,
      picked.cluster_id,
      c.topic AS cluster_topic,
      (
        SELECT COUNT(DISTINCT i2.source_id)::int
        FROM item_enrichments ie2
        INNER JOIN items i2 ON i2.id = ie2.item_id
        WHERE ie2.cluster_id = picked.cluster_id
      ) AS related_count,
      c.item_count AS cluster_item_count,
      items.published_at,
      picked.fetched_at,
      f.created_at AS favorited_at
    FROM picked
    INNER JOIN items ON items.id = picked.id
    INNER JOIN sources ON sources.id = items.source_id
    INNER JOIN item_enrichments ie ON ie.item_id = items.id AND ie.cluster_id = picked.cluster_id
    INNER JOIN clusters c ON c.id = picked.cluster_id
    LEFT JOIN favorites f ON f.item_id = items.id
    WHERE true
      ${beforeFrag}
    ORDER BY
      ${sortBy === "published"
        ? pg`COALESCE(items.published_at, picked.fetched_at) DESC NULLS LAST`
        : pg`picked.fetched_at DESC NULLS LAST`},
      picked.last_seen_at DESC NULLS LAST,
      picked.id DESC
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    platform: r.platform,
    sourceName: r.source_name,
    sourceConfig: r.source_config,
    title: r.title,
    url: r.url,
    author: r.author,
    contentText: r.content_text,
    titleZh: r.title_zh,
    contentZh: r.content_zh,
    contentSummaryZh: r.content_summary_zh,
    eventSummary: r.event_summary,
    tags: r.tags,
    categoryDomain: r.category_domain,
    categoryTopic: r.category_topic,
    categoryEntity: r.category_entity,
    clusterId: r.cluster_id,
    clusterTopic: r.cluster_topic,
    relatedCount: r.related_count,
    relatedSourceCount: r.related_count,
    clusterItemCount: r.cluster_item_count,
    publishedAt: r.published_at,
    fetchedAt: r.fetched_at,
    favoritedAt: r.favorited_at,
  }));
}

export async function listItems(params: {
  feed?: "all" | "curated";
  limit?: number;
  before?: Date;
  /** Lower bound on COALESCE(published_at, fetched_at) for time-range filters. */
  publishedSince?: Date;
  audience?: "public" | "personal";
  platform?: string;
  q?: string;
  tags?: string[];
  favoritedOnly?: boolean;
  sortBy?: "published" | "fetched";
  taxonomyOnly?: boolean;
}) {
  if (params.feed === "curated") {
    return listCuratedItems(params);
  }

  const db = getDb();
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const publishedSinceIso = params.publishedSince?.toISOString();
  const scope = audienceToSourceScope(params.audience);
  const clauses: SQL[] = [];
  const sortBy = params.sortBy ?? "published";
  if (scope) {
    clauses.push(eq(sources.scope, scope));
  }
  if (params.before) {
    if (sortBy === "published") {
      clauses.push(sql`COALESCE(${items.publishedAt}, ${items.fetchedAt}) < ${params.before.toISOString()}::timestamptz`);
    } else {
      clauses.push(lt(items.fetchedAt, params.before));
    }
  }
  if (publishedSinceIso) {
    clauses.push(
      sql`COALESCE(${items.publishedAt}, ${items.fetchedAt}) >= ${publishedSinceIso}::timestamptz`,
    );
  }
  if (params.platform) clauses.push(eq(sources.kind, params.platform));
  if (params.q) {
    clauses.push(
      or(
        ilike(items.title, `%${params.q}%`),
        ilike(items.contentText, `%${params.q}%`),
        ilike(itemEnrichments.titleZh, `%${params.q}%`),
        ilike(itemEnrichments.contentZh, `%${params.q}%`),
        ilike(itemEnrichments.fullContentText, `%${params.q}%`),
        ilike(itemEnrichments.contentSummaryZh, `%${params.q}%`),
        ilike(itemEnrichments.eventSummary, `%${params.q}%`),
      )!,
    );
  }
  if (params.tags && params.tags.length > 0) {
    const literal = `{${params.tags.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(",")}}`;
    clauses.push(sql`${itemEnrichments.tags} @> ${literal}::text[]`);
  }
  if (params.favoritedOnly) {
    clauses.push(sql`EXISTS (SELECT 1 FROM favorites f WHERE f.item_id = ${items.id})`);
  }
  if (params.taxonomyOnly) {
    clauses.push(sql`${itemEnrichments.itemId} IS NOT NULL`);
    clauses.push(
      sql`(
        array_length(${itemEnrichments.categoryDomain}, 1) > 0
        OR array_length(${itemEnrichments.categoryTopic}, 1) > 0
        OR array_length(${itemEnrichments.categoryEntity}, 1) > 0
      )`,
    );
  }

  return db
    .select({
      id: items.id,
      sourceId: items.sourceId,
      platform: sources.kind,
      sourceName: sources.name,
      sourceConfig: sources.config,
      title: items.title,
      url: items.url,
      author: items.author,
      contentText: items.contentText,
      titleZh: itemEnrichments.titleZh,
      contentZh: itemEnrichments.contentZh,
      contentSummaryZh: itemEnrichments.contentSummaryZh,
      eventSummary: itemEnrichments.eventSummary,
      tags: itemEnrichments.tags,
      categoryDomain: itemEnrichments.categoryDomain,
      categoryTopic: itemEnrichments.categoryTopic,
      categoryEntity: itemEnrichments.categoryEntity,
      clusterId: itemEnrichments.clusterId,
      clusterTopic: clusters.topic,
      relatedCount: sql<number | null>`CASE
        WHEN ${itemEnrichments.clusterId} IS NULL THEN NULL
        ELSE (
          SELECT COUNT(DISTINCT i2.source_id)::int
          FROM item_enrichments ie2
          INNER JOIN items i2 ON i2.id = ie2.item_id
          WHERE ie2.cluster_id = ${itemEnrichments.clusterId}
        )
      END`,
      relatedSourceCount: sql<number | null>`CASE
        WHEN ${itemEnrichments.clusterId} IS NULL THEN NULL
        ELSE (
          SELECT COUNT(DISTINCT i2.source_id)::int
          FROM item_enrichments ie2
          INNER JOIN items i2 ON i2.id = ie2.item_id
          WHERE ie2.cluster_id = ${itemEnrichments.clusterId}
        )
      END`,
      clusterItemCount: clusters.itemCount,
      publishedAt: items.publishedAt,
      fetchedAt: items.fetchedAt,
      favoritedAt: favorites.createdAt,
    })
    .from(items)
    .innerJoin(sources, eq(items.sourceId, sources.id))
    .leftJoin(itemEnrichments, eq(itemEnrichments.itemId, items.id))
    .leftJoin(clusters, eq(clusters.id, itemEnrichments.clusterId))
    .leftJoin(favorites, eq(favorites.itemId, items.id))
    .where(clauses.length ? and(...clauses) : undefined)
    .orderBy(
      sortBy === "published"
        ? sql`COALESCE(${items.publishedAt}, ${items.fetchedAt}) DESC`
        : desc(items.fetchedAt),
      desc(items.fetchedAt),
    )
    .limit(limit);
}

export async function listItemCountsBySource() {
  const sqlClient = getSql();
  const rows = await sqlClient<{ source_id: string; count: number }[]>`
    SELECT source_id, count(*)::int AS count
    FROM items
    GROUP BY source_id
  `;
  return rows.map((r) => ({ sourceId: r.source_id, count: r.count }));
}

export async function listTagCounts(sinceDays = 30) {
  const sqlClient = getSql();
  const rows = await sqlClient<{ tag: string; count: number }[]>`
    SELECT unnest(tags) AS tag, count(*)::int AS count
    FROM item_enrichments
    WHERE enriched_at > now() - (${sinceDays} || ' days')::interval
    GROUP BY tag
    ORDER BY count DESC, tag ASC
  `;
  return rows;
}

export async function addFavorite(itemId: string, note?: string) {
  const db = getDb();
  await db
    .insert(favorites)
    .values({ itemId, note: note ?? null })
    .onConflictDoUpdate({
      target: favorites.itemId,
      set: { note: note ?? null },
    });
}

export async function removeFavorite(itemId: string) {
  const db = getDb();
  const deleted = await db
    .delete(favorites)
    .where(eq(favorites.itemId, itemId))
    .returning({ id: favorites.itemId });
  return deleted.length > 0;
}

export async function listFavorites(limit = 100) {
  const db = getDb();
  return db
    .select({
      id: items.id,
      sourceId: items.sourceId,
      platform: sources.kind,
      sourceName: sources.name,
      sourceConfig: sources.config,
      title: items.title,
      url: items.url,
      author: items.author,
      contentText: items.contentText,
      titleZh: itemEnrichments.titleZh,
      contentZh: itemEnrichments.contentZh,
      tags: itemEnrichments.tags,
      clusterId: itemEnrichments.clusterId,
      clusterTopic: clusters.topic,
      relatedCount: clusters.itemCount,
      publishedAt: items.publishedAt,
      fetchedAt: items.fetchedAt,
      favoritedAt: favorites.createdAt,
      note: favorites.note,
    })
    .from(favorites)
    .innerJoin(items, eq(favorites.itemId, items.id))
    .innerJoin(sources, eq(items.sourceId, sources.id))
    .leftJoin(itemEnrichments, eq(itemEnrichments.itemId, items.id))
    .leftJoin(clusters, eq(clusters.id, itemEnrichments.clusterId))
    .orderBy(desc(favorites.createdAt))
    .limit(Math.min(Math.max(limit, 1), 500));
}

export async function listKeywordRules() {
  const db = getDb();
  return db
    .select()
    .from(keywordRules)
    .orderBy(desc(keywordRules.createdAt));
}

export async function createKeywordRule(input: {
  pattern: string;
  isRegex?: boolean;
  notify?: boolean;
}) {
  const db = getDb();
  const rows = await db
    .insert(keywordRules)
    .values({
      pattern: input.pattern,
      isRegex: input.isRegex ?? false,
      notify: input.notify ?? true,
      createdAt: new Date(),
    })
    .returning();
  return rows[0] ?? null;
}

export async function updateKeywordRule(
  id: string,
  input: { pattern: string; isRegex?: boolean; notify?: boolean },
) {
  const db = getDb();
  const rows = await db
    .update(keywordRules)
    .set({
      pattern: input.pattern,
      isRegex: input.isRegex ?? false,
      notify: input.notify ?? true,
    })
    .where(eq(keywordRules.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function deleteKeywordRule(id: string) {
  const db = getDb();
  const rows = await db
    .delete(keywordRules)
    .where(eq(keywordRules.id, id))
    .returning({ id: keywordRules.id });
  return rows.length > 0;
}

export type StatsRange = "24h" | "72h" | "7d" | "30d" | "90d" | "custom";
export type StatsClusterSort = "hybrid" | "sources" | "items" | "recency" | "cohesion";
type SourceScope = "public_seed" | "personal";

export function audienceToSourceScope(audience?: "public" | "personal"): SourceScope | null {
  if (audience === "public") return null;
  if (audience === "personal") return "personal";
  return null;
}

function normalizeSourceScope(scope?: string | null): SourceScope {
  return scope === "public_seed" ? "public_seed" : "personal";
}

export type HotspotTopicState = "named" | "generated" | "provisional" | "fallback";

type HotspotWindowPolicy = {
  consensusMinSources: number;
  breakingMinSources: number;
  breakingMaxAgeHours: number;
  consensusTitleConfidence: number;
  breakingTitleConfidence: number;
};

type HotspotTitleMeta = {
  displayTitle: string;
  topicState: HotspotTopicState;
  nameConfidence: number;
  selectionWindow: string;
};

function safeEnvWeight(name: string, fallback: number) {
  const parsed = Number.parseFloat(process.env[name] ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeWeights(raw: {
  sources: number;
  items: number;
  recency: number;
  cohesion: number;
}) {
  const clamped = {
    sources: Math.max(0, raw.sources),
    items: Math.max(0, raw.items),
    recency: Math.max(0, raw.recency),
    cohesion: Math.max(0, raw.cohesion),
  };
  const sum = clamped.sources + clamped.items + clamped.recency + clamped.cohesion;
  if (sum <= 0) return { sources: 0.4, items: 0.3, recency: 0.2, cohesion: 0.1 };
  return {
    sources: clamped.sources / sum,
    items: clamped.items / sum,
    recency: clamped.recency / sum,
    cohesion: clamped.cohesion / sum,
  };
}

function getHotspotWindowPolicy(range: StatsRange): HotspotWindowPolicy {
  switch (range) {
    case "24h":
      return {
        consensusMinSources: 2,
        breakingMinSources: 1,
        breakingMaxAgeHours: 24,
        consensusTitleConfidence: 0.55,
        breakingTitleConfidence: 0.45,
      };
    case "72h":
      return {
        consensusMinSources: 2,
        breakingMinSources: 1,
        breakingMaxAgeHours: 48,
        consensusTitleConfidence: 0.6,
        breakingTitleConfidence: 0.5,
      };
    case "7d":
      return {
        consensusMinSources: 3,
        breakingMinSources: 2,
        breakingMaxAgeHours: 72,
        consensusTitleConfidence: 0.7,
        breakingTitleConfidence: 0.6,
      };
    case "30d":
      return {
        consensusMinSources: 3,
        breakingMinSources: 2,
        breakingMaxAgeHours: 96,
        consensusTitleConfidence: 0.8,
        breakingTitleConfidence: 0.68,
      };
    case "90d":
      return {
        consensusMinSources: 4,
        breakingMinSources: 2,
        breakingMaxAgeHours: 120,
        consensusTitleConfidence: 0.82,
        breakingTitleConfidence: 0.7,
      };
    default:
      return {
        consensusMinSources: 3,
        breakingMinSources: 2,
        breakingMaxAgeHours: 96,
        consensusTitleConfidence: 0.75,
        breakingTitleConfidence: 0.65,
      };
  }
}

function normalizeDisplayText(text: string | null | undefined) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function normalizeKeywordText(text: string | null | undefined) {
  return normalizeDisplayText(text).toLowerCase();
}

function isGenericHotspotTitle(text: string) {
  const key = normalizeDisplayText(text).toLowerCase();
  if (!key || key.length < 4) return true;
  return new Set([
    "event",
    "hotspot",
    "news",
    "clustered event",
    "related",
    "update",
    "topic",
  ]).has(key);
}
function pickRepresentativeTitle(titles: string[]) {
  for (const title of titles) {
    const normalized = normalizeDisplayText(title);
    if (!normalized) continue;
    if (isGenericHotspotTitle(normalized)) continue;
    return normalized.slice(0, 80);
  }
  return null;
}

function normalizeSourceLead(sourceNames: string | null) {
  const normalized = normalizeDisplayText(sourceNames);
  if (!normalized) return null;
  return normalized
    .split(/\s*(?:\||\/|,|;|、|，|；)\s*/)
    .map((part) => part.trim())
    .find(Boolean) ?? null;
}

function buildHotspotTitleMeta(input: {
  topic: string | null;
  topicSource?: string | null;
  titles: string[];
  sourceNames: string | null;
  distinctSources: number;
  weightedDistinctSources: number;
  selectionWindow: string;
}): HotspotTitleMeta {
  const stableTopic = normalizeDisplayText(input.topic);
  if (stableTopic && !isGenericHotspotTitle(stableTopic)) {
    const named = input.topicSource === "llm" || input.topicSource === "agent";
    return {
      displayTitle: stableTopic.slice(0, 80),
      topicState: named ? "named" : "generated",
      nameConfidence: named ? 0.95 : 0.82,
      selectionWindow: input.selectionWindow,
    };
  }

  const sampleTitle = pickRepresentativeTitle(input.titles);
  if (sampleTitle) {
    const confidence =
      Math.min(
        0.88,
        0.42 + Math.min(input.distinctSources, 4) * 0.1 + Math.min(input.weightedDistinctSources, 6) * 0.03,
      ) || 0.55;
    return {
      displayTitle: sampleTitle,
      topicState: "provisional",
      nameConfidence: confidence,
      selectionWindow: input.selectionWindow,
    };
  }

  const sourceLead = normalizeSourceLead(input.sourceNames);
  if (sourceLead) {
    return {
      displayTitle: `${sourceLead} 相关事件`,
      topicState: "fallback",
      nameConfidence: 0.25,
      selectionWindow: input.selectionWindow,
    };
  }

  return {
    displayTitle: `待命名事件 · ${input.selectionWindow}`,
    topicState: "fallback",
    nameConfidence: 0.12,
    selectionWindow: input.selectionWindow,
  };
}

function sourceTierWeights() {
  return {
    tier1: safeEnvWeight("SOURCE_QUALITY_TIER1_WEIGHT", 1),
    tier2: safeEnvWeight("SOURCE_QUALITY_TIER2_WEIGHT", 0.65),
    tier3: safeEnvWeight("SOURCE_QUALITY_TIER3_WEIGHT", 0.35),
  };
}

function sourceQualityWeight(name: string, kind: string) {
  const weights = sourceTierWeights();
  const lower = name.toLowerCase();
  if (
    /openai|anthropic|deepmind|google ai|google deepmind|hugging face|meta ai|microsoft ai|nvidia|deepseek|qwen|moonshot|kimi|simon willison|dwarkesh|interconnects|gary marcus|where.?s your ed at|max woolf/.test(
      lower,
    )
  ) {
    return weights.tier1;
  }
  if (kind === "hn" || kind === "x-rsshub") return 0.85;
  if (/techcrunch|the verge|wired|venturebeat|infoq|36kr|datawhale|founder park/.test(lower)) {
    return weights.tier2;
  }
  return weights.tier3;
}

function logScaled(value: number) {
  return Math.log1p(Math.max(0, value));
}

function normalizeScore(value: number, maxValue: number) {
  if (maxValue <= 0) return 0;
  return value / maxValue;
}

export function toDateValue(value: Date | string | number | null | undefined) {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function dateTimeValue(value: Date | string | number | null | undefined) {
  return toDateValue(value)?.getTime() ?? 0;
}

function burstVelocityRaw(items1h: number, itemsPrev3h: number, items12h: number) {
  const baseline = itemsPrev3h / 3;
  return Math.max(0, items1h * 2 - baseline) + items1h / (baseline + 1) + logScaled(items12h);
}
function recencyScoreForDate(date: Date | string | number | null | undefined, halfLifeHours = 48) {
  const value = dateTimeValue(date);
  if (!value) return 0;
  const ageHours = Math.max(0, (Date.now() - value) / 3600000);
  return Math.exp(-ageHours / Math.max(1, halfLifeHours));
}

function metricNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function summarizePlatformMetrics(metrics: unknown) {
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) {
    return { x: 0, hn: 0 };
  }
  const record = metrics as Record<string, unknown>;
  const x = record.x && typeof record.x === "object" && !Array.isArray(record.x)
    ? (record.x as Record<string, unknown>)
    : {};
  const hn = record.hn && typeof record.hn === "object" && !Array.isArray(record.hn)
    ? (record.hn as Record<string, unknown>)
    : {};
  const xScore = metricNumber(x.posts)
    + metricNumber(x.replies)
    + metricNumber(x.reposts)
    + metricNumber(x.likes)
    + metricNumber(x.quotes)
    + metricNumber(x.views);
  const hnScore = metricNumber(hn.posts) + metricNumber(hn.points) + metricNumber(hn.comments);
  return { x: xScore, hn: hnScore };
}

export async function updateClusterHotspotStats(clusterId: string): Promise<void> {
  const sqlClient = getSql();
  const db = getDb();
  const rows = await sqlClient<
    {
      id: string;
      last_seen_at: Date;
      item_count: number;
      distinct_sources: number;
      distinct_platforms: number;
      source_entries: unknown;
      platform_metrics_entries: unknown;
      latest_item_at: Date | null;
      cohesion_score: number | null;
      items_1h: number;
      items_prev_3h: number;
      items_12h: number;
    }[]
  >`
    SELECT
      c.id,
      c.last_seen_at,
      COUNT(*)::int AS item_count,
      COUNT(DISTINCT i.source_id)::int AS distinct_sources,
      COUNT(DISTINCT s.kind)::int AS distinct_platforms,
      JSONB_AGG(DISTINCT JSONB_BUILD_OBJECT('id', i.source_id::text, 'name', s.name, 'kind', s.kind)) AS source_entries,
      JSONB_AGG(ie.platform_metrics) AS platform_metrics_entries,
      MAX(i.fetched_at) AS latest_item_at,
      AVG(
        CASE
          WHEN c.centroid_embedding IS NULL OR ie.embedding IS NULL THEN NULL
          ELSE (1 - (ie.embedding <=> c.centroid_embedding))
        END
      )::float AS cohesion_score,
      SUM(CASE WHEN i.fetched_at >= now() - interval '1 hour' THEN 1 ELSE 0 END)::int AS items_1h,
      SUM(
        CASE
          WHEN i.fetched_at >= now() - interval '4 hours'
           AND i.fetched_at < now() - interval '1 hour'
          THEN 1 ELSE 0 END
      )::int AS items_prev_3h,
      SUM(CASE WHEN i.fetched_at >= now() - interval '12 hours' THEN 1 ELSE 0 END)::int AS items_12h
    FROM clusters c
    INNER JOIN item_enrichments ie ON ie.cluster_id = c.id
    INNER JOIN items i ON i.id = ie.item_id
    INNER JOIN sources s ON s.id = i.source_id
    WHERE c.id = ${clusterId}::uuid
    GROUP BY c.id, c.last_seen_at
  `;
  const row = rows[0];
  if (!row) return;

  const sourceEntriesRaw = Array.isArray(row.source_entries) ? row.source_entries : [];
  const sourceMap = new Map<string, { id: string; name: string; kind: string }>();
  for (const entry of sourceEntriesRaw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    const name = typeof record.name === "string" ? record.name : "";
    const kind = typeof record.kind === "string" ? record.kind : "rss";
    if (!id || sourceMap.has(id)) continue;
    sourceMap.set(id, { id, name, kind });
  }
  const sourceEntries = [...sourceMap.values()];
  const sourceWeights = sourceEntries.map((entry) => sourceQualityWeight(entry.name, entry.kind));
  const weightedDistinctSources = sourceWeights.reduce((acc, value) => acc + value, 0);
  const sourceQualityScore = sourceWeights.length > 0 ? weightedDistinctSources / sourceWeights.length : 0;
  const platformTotals = (Array.isArray(row.platform_metrics_entries) ? row.platform_metrics_entries : [])
    .reduce(
      (acc: { x: number; hn: number }, metrics) => {
        const scored = summarizePlatformMetrics(metrics);
        acc.x += scored.x;
        acc.hn += scored.hn;
        return acc;
      },
      { x: 0, hn: 0 },
    );
  const xSignalScore = logScaled(platformTotals.x);
  const hnSignalScore = logScaled(platformTotals.hn);
  const burstVelocity = burstVelocityRaw(row.items_1h, row.items_prev_3h, row.items_12h);
  const recencyScore = recencyScoreForDate(row.latest_item_at ?? row.last_seen_at, 48);
  const breakingRecencyScore = recencyScoreForDate(row.latest_item_at ?? row.last_seen_at, 24);
  const crossPlatformScore = normalizeScore(row.distinct_platforms, 4);
  const consensusScore =
    safeEnvWeight("HOTSPOT_CONSENSUS_W_SOURCES", 0.42) * normalizeScore(weightedDistinctSources, 6) +
    safeEnvWeight("HOTSPOT_CONSENSUS_W_ITEMS", 0.18) * normalizeScore(row.item_count, 20) +
    safeEnvWeight("HOTSPOT_CONSENSUS_W_RECENCY", 0.16) * recencyScore +
    safeEnvWeight("HOTSPOT_CONSENSUS_W_COHESION", 0.08) * (row.cohesion_score ?? 0.5) +
    safeEnvWeight("HOTSPOT_CONSENSUS_W_CROSS_PLATFORM", 0.16) * crossPlatformScore;
  const breakingScore =
    safeEnvWeight("HOTSPOT_BREAKING_W_VELOCITY", 0.34) * normalizeScore(burstVelocity, 10) +
    safeEnvWeight("HOTSPOT_BREAKING_W_SOURCE_QUALITY", 0.18) * sourceQualityScore +
    safeEnvWeight("HOTSPOT_BREAKING_W_X", 0.2) * normalizeScore(xSignalScore, 20) +
    safeEnvWeight("HOTSPOT_BREAKING_W_HN", 0.1) * normalizeScore(hnSignalScore, 20) +
    safeEnvWeight("HOTSPOT_BREAKING_W_RECENCY", 0.1) * breakingRecencyScore +
    safeEnvWeight("HOTSPOT_BREAKING_W_CROSS_PLATFORM", 0.08) * crossPlatformScore;

  await db
    .update(clusters)
    .set({
      itemCount: row.item_count,
      distinctSources: row.distinct_sources,
      weightedDistinctSources: Math.round(weightedDistinctSources * 100),
      crossPlatformScore: Math.round(crossPlatformScore * 1000),
      breakingScore: Math.round(breakingScore * 1000),
      consensusScore: Math.round(consensusScore * 1000),
      burstVelocity: Math.round(burstVelocity * 1000),
      xSignalScore: Math.round(xSignalScore * 1000),
      hnSignalScore: Math.round(hnSignalScore * 1000),
      hotspotScore: Math.round(Math.max(consensusScore, breakingScore) * 1000),
      lastSeenAt: row.latest_item_at ?? row.last_seen_at ?? new Date(),
    })
    .where(eq(clusters.id, clusterId));
}

export async function getStatsOverview(params?: {
  range?: StatsRange;
  audience?: "public" | "personal";
  platform?: string;
  tag?: string;
  compare?: boolean;
  topN?: number;
  minSources?: number;
  clusterSort?: StatsClusterSort;
  from?: Date;
  to?: Date;
}) {
  const sqlClient = getSql();
  const range = params?.range ?? "7d";
  const windowPolicy = getHotspotWindowPolicy(range);
  const fallbackDays =
    range === "24h" ? 1 : range === "72h" ? 3 : range === "30d" ? 30 : range === "90d" ? 90 : 7;
  const endAt = params?.to ?? new Date();
  const startAt =
    params?.from ??
    new Date(endAt.getTime() - fallbackDays * 24 * 3600 * 1000);
  const compareDurationMs = Math.max(
    1,
    endAt.getTime() - startAt.getTime(),
  );
  const prevEndAt = new Date(startAt.getTime());
  const prevStartAt = new Date(startAt.getTime() - compareDurationMs);
  const compare = params?.compare ?? false;
  const topN = Math.min(Math.max(params?.topN ?? 10, 3), 30);
  const minSources = Math.min(Math.max(params?.minSources ?? 2, 1), 20);
  const consensusMinSources = Math.max(minSources, windowPolicy.consensusMinSources);
  const clusterSort = params?.clusterSort ?? "hybrid";
  const audienceScope = audienceToSourceScope(params?.audience);
  const scopeFrag = audienceScope ? sqlClient`AND s.scope = ${audienceScope}` : sqlClient``;
  const scopeWhereFrag = audienceScope ? sqlClient`s.scope = ${audienceScope}` : sqlClient`true`;
  const weights = normalizeWeights({
    sources: safeEnvWeight("CLUSTER_SCORE_W_SOURCES", 0.4),
    items: safeEnvWeight("CLUSTER_SCORE_W_ITEMS", 0.3),
    recency: safeEnvWeight("CLUSTER_SCORE_W_RECENCY", 0.2),
    cohesion: safeEnvWeight("CLUSTER_SCORE_W_COHESION", 0.1),
  });

  const platformFrag = params?.platform
    ? sqlClient`AND s.kind = ${params.platform}`
    : sqlClient``;
  const tagFrag = params?.tag
    ? sqlClient`AND ie.tags @> ${`{"${params.tag.replace(/"/g, '\\"')}"}`}::text[]`
    : sqlClient``;
  const compareFrag = compare
    ? sqlClient`
      (SELECT count(*)::int
        FROM items i
        INNER JOIN sources s ON s.id = i.source_id
        WHERE i.fetched_at >= ${prevStartAt.toISOString()}::timestamptz
          AND i.fetched_at < ${prevEndAt.toISOString()}::timestamptz
          ${scopeFrag}
      ) AS items_prev_window,
      (SELECT count(*)::int
        FROM sources s
        WHERE s.last_ok_at >= ${prevStartAt.toISOString()}::timestamptz
          AND s.last_ok_at < ${prevEndAt.toISOString()}::timestamptz
          ${scopeFrag}
      ) AS active_sources_prev_window,
      (
        SELECT count(*)::int
        FROM (
          SELECT ie.cluster_id
          FROM items i
          INNER JOIN item_enrichments ie ON ie.item_id = i.id
          INNER JOIN sources s ON s.id = i.source_id
          WHERE i.fetched_at >= ${prevStartAt.toISOString()}::timestamptz
            AND i.fetched_at < ${prevEndAt.toISOString()}::timestamptz
            ${scopeFrag}
            AND ie.cluster_id IS NOT NULL
            ${platformFrag}
            ${tagFrag}
          GROUP BY ie.cluster_id
          HAVING COUNT(DISTINCT i.source_id) >= ${consensusMinSources}
        ) prev_clusters
      ) AS clusters_prev_window
    `
    : sqlClient`
      0::int AS items_prev_window,
      0::int AS active_sources_prev_window,
      0::int AS clusters_prev_window
    `;

  const [totals] = await sqlClient<
    {
      total_items: number;
      items_24h: number;
      total_sources: number;
      active_sources: number;
      total_clusters: number;
      items_window: number;
      active_sources_window: number;
      clusters_window: number;
      items_prev_window: number;
      active_sources_prev_window: number;
      clusters_prev_window: number;
    }[]
  >`
    SELECT
      (SELECT count(*)::int
        FROM items i
        INNER JOIN sources s ON s.id = i.source_id
        WHERE ${scopeWhereFrag}
      ) AS total_items,
      (SELECT count(*)::int
        FROM items i
        INNER JOIN sources s ON s.id = i.source_id
        WHERE i.fetched_at > now() - interval '24 hours'
          ${scopeFrag}
      ) AS items_24h,
      (SELECT count(*)::int
        FROM sources s
        WHERE ${scopeWhereFrag}
      ) AS total_sources,
      (SELECT count(*)::int
        FROM sources s
        WHERE s.last_ok_at > now() - interval '7 days'
          ${scopeFrag}
      ) AS active_sources,
      (SELECT count(*)::int
        FROM clusters c
        WHERE EXISTS (
          SELECT 1
          FROM item_enrichments ie
          INNER JOIN items i ON i.id = ie.item_id
          INNER JOIN sources s ON s.id = i.source_id
          WHERE ie.cluster_id = c.id
            ${scopeFrag}
        )
      ) AS total_clusters,
      (SELECT count(*)::int
        FROM items i
        INNER JOIN sources s ON s.id = i.source_id
        WHERE i.fetched_at >= ${startAt.toISOString()}::timestamptz
          AND i.fetched_at < ${endAt.toISOString()}::timestamptz
          ${scopeFrag}
      ) AS items_window,
      (SELECT count(*)::int
        FROM sources s
        WHERE s.last_ok_at >= ${startAt.toISOString()}::timestamptz
          AND s.last_ok_at < ${endAt.toISOString()}::timestamptz
          ${scopeFrag}
      ) AS active_sources_window,
      (
        SELECT count(*)::int
        FROM (
          SELECT ie.cluster_id
          FROM items i
          INNER JOIN item_enrichments ie ON ie.item_id = i.id
          INNER JOIN sources s ON s.id = i.source_id
          WHERE i.fetched_at >= ${startAt.toISOString()}::timestamptz
            AND i.fetched_at < ${endAt.toISOString()}::timestamptz
            AND ie.cluster_id IS NOT NULL
            ${platformFrag}
            ${tagFrag}
          GROUP BY ie.cluster_id
          HAVING COUNT(DISTINCT i.source_id) >= ${consensusMinSources}
        ) clusters_filtered
      ) AS clusters_window,
      ${compareFrag}
  `;

  const byPlatform = await sqlClient<{ kind: string; count: number }[]>`
    SELECT s.kind, count(*)::int AS count
    FROM items i
    JOIN sources s ON s.id = i.source_id
    LEFT JOIN item_enrichments ie ON ie.item_id = i.id
    WHERE i.fetched_at >= ${startAt.toISOString()}::timestamptz
      AND i.fetched_at < ${endAt.toISOString()}::timestamptz
      ${platformFrag}
      ${tagFrag}
    GROUP BY s.kind
    ORDER BY count DESC
  `;

  const keywordRows = await sqlClient<
    {
      source_id: string;
      source_name: string;
      source_kind: string;
      item_id: string;
      item_url: string | null;
      latest_item_at: Date | string;
      title: string | null;
      content_text: string | null;
      title_zh: string | null;
      content_zh: string | null;
      full_content_text: string | null;
      content_summary_zh: string | null;
      event_summary: string | null;
      llm_keywords: string[] | null;
      cluster_id: string | null;
      cluster_topic: string | null;
      cluster_topic_source: string | null;
    }[]
  >`
    SELECT
      i.source_id::text AS source_id,
      s.name AS source_name,
      s.kind AS source_kind,
      i.id::text AS item_id,
      i.url AS item_url,
      i.fetched_at AS latest_item_at,
      i.title,
      i.content_text,
      ie.title_zh,
      ie.content_zh,
      ie.full_content_text,
      ie.content_summary_zh,
      ie.event_summary,
      ie.llm_keywords,
      ie.cluster_id::text AS cluster_id,
      c.topic AS cluster_topic,
      c.topic_source AS cluster_topic_source
    FROM items i
    INNER JOIN sources s ON s.id = i.source_id
    LEFT JOIN item_enrichments ie ON ie.item_id = i.id
    LEFT JOIN clusters c ON c.id = ie.cluster_id
    WHERE i.fetched_at >= ${startAt.toISOString()}::timestamptz
      AND i.fetched_at < ${endAt.toISOString()}::timestamptz
      ${platformFrag}
      ${tagFrag}
    ORDER BY i.fetched_at DESC
  `;

  const keywordStats = new Map<
    string,
    {
      keyword: string;
      mentions: number;
      distinct_sources: number;
      source_names: string | null;
      source_entries: Map<string, { id: string; name: string; kind: string }>;
      related_events: Map<
        string,
        {
          id: string;
          topic: string | null;
          topic_source: string | null;
          mentions: number;
          latest_item_at: Date | null;
          source_entries: Map<string, { id: string; name: string; kind: string }>;
          representative_items: Map<
            string,
            {
              itemId: string;
              title: string | null;
              titleZh: string | null;
              url: string | null;
              sourceName: string;
              platform: string;
              fetchedAt: Date | null;
            }
          >;
        }
      >;
      representative_items: Map<
        string,
        {
          itemId: string;
          title: string | null;
          titleZh: string | null;
          url: string | null;
          sourceName: string;
          platform: string;
          fetchedAt: Date | null;
        }
      >;
      latest_item_at: Date | null;
      document_count: number;
    }
  >();
  const totalKeywordDocuments = keywordRows.length;

  for (const row of keywordRows) {
    const text = [
      row.title_zh,
      row.title,
      row.event_summary,
      row.content_summary_zh,
      row.content_zh,
      row.full_content_text,
      row.content_text,
      row.cluster_topic,
      ...(row.llm_keywords ?? []),
    ]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" ");
    const keywords = [
      ...(row.llm_keywords ?? []).map((keyword) => displayAttentionKeyword(keyword)),
      ...extractAttentionKeywords(text),
    ];
    if (keywords.length === 0) continue;
    const uniqueKeywords = [...new Set(keywords)];
    for (const keyword of uniqueKeywords) {
      const key = keyword.trim().toLowerCase();
      if (!key) continue;
      const latestItemAt = toDateValue(row.latest_item_at);
      const current =
        keywordStats.get(key) ??
        {
          keyword: key,
          mentions: 0,
          distinct_sources: 0,
          source_names: null,
          source_entries: new Map<string, { id: string; name: string; kind: string }>(),
          related_events: new Map(),
          representative_items: new Map(),
          latest_item_at: null,
          document_count: 0,
        };
      current.mentions += 1;
      current.document_count += 1;
      if (!current.source_entries.has(row.source_id)) {
        current.source_entries.set(row.source_id, {
          id: row.source_id,
          name: row.source_name,
          kind: row.source_kind,
        });
      }
      current.distinct_sources = current.source_entries.size;
      current.representative_items.set(row.item_id, {
        itemId: row.item_id,
        title: row.title,
        titleZh: row.title_zh,
        url: row.item_url,
        sourceName: row.source_name,
        platform: row.source_kind,
        fetchedAt: latestItemAt,
      });
      if (row.cluster_id) {
        const event =
          current.related_events.get(row.cluster_id) ??
          {
            id: row.cluster_id,
            topic: row.cluster_topic,
            topic_source: row.cluster_topic_source,
            mentions: 0,
            latest_item_at: null,
            source_entries: new Map<string, { id: string; name: string; kind: string }>(),
            representative_items: new Map(),
          };
        event.mentions += 1;
        event.latest_item_at =
          event.latest_item_at && latestItemAt && dateTimeValue(event.latest_item_at) > dateTimeValue(latestItemAt)
            ? event.latest_item_at
            : latestItemAt;
        event.source_entries.set(row.source_id, {
          id: row.source_id,
          name: row.source_name,
          kind: row.source_kind,
        });
        event.representative_items.set(row.item_id, {
          itemId: row.item_id,
          title: row.title,
          titleZh: row.title_zh,
          url: row.item_url,
          sourceName: row.source_name,
          platform: row.source_kind,
          fetchedAt: latestItemAt,
        });
        current.related_events.set(row.cluster_id, event);
      }
      current.latest_item_at =
        current.latest_item_at && latestItemAt && dateTimeValue(current.latest_item_at) > dateTimeValue(latestItemAt)
          ? current.latest_item_at
          : latestItemAt;
      keywordStats.set(key, current);
    }
  }

  const topTags = [...keywordStats.values()]
    .map((row) => ({
      ...row,
      source_names: [...row.source_entries.values()]
        .map((entry) => entry.name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))
        .join(" / "),
      source_entries: [...row.source_entries.values()],
      inverse_document_frequency:
        totalKeywordDocuments > 0
          ? Math.log((1 + totalKeywordDocuments) / (1 + Math.max(1, row.document_count))) + 1
          : 1,
    }))
    .sort((a, b) => {
      const aScore = a.mentions * a.inverse_document_frequency * (1 + Math.log1p(a.distinct_sources));
      const bScore = b.mentions * b.inverse_document_frequency * (1 + Math.log1p(b.distinct_sources));
      if (bScore !== aScore) return bScore - aScore;
      if (b.distinct_sources !== a.distinct_sources) return b.distinct_sources - a.distinct_sources;
      if (b.mentions !== a.mentions) return b.mentions - a.mentions;
      const aMs = dateTimeValue(a.latest_item_at);
      const bMs = dateTimeValue(b.latest_item_at);
      return bMs - aMs;
    })
    .slice(0, Math.max(topN * 4, topN));

  const scoreOrder =
    clusterSort === "sources"
      ? sqlClient`distinct_sources DESC, items_window DESC, recency_score DESC`
      : clusterSort === "items"
        ? sqlClient`items_window DESC, distinct_sources DESC, recency_score DESC`
        : clusterSort === "recency"
          ? sqlClient`recency_score DESC, distinct_sources DESC, items_window DESC`
          : clusterSort === "cohesion"
            ? sqlClient`cohesion_score DESC, distinct_sources DESC, items_window DESC`
            : sqlClient`hybrid_score DESC, distinct_sources DESC, items_window DESC`;

  const topClusters = await sqlClient<{
    id: string;
    topic: string | null;
    topic_source: string | null;
    item_count: number;
    last_seen_at: Date;
    distinct_sources: number;
    source_names: string | null;
    items_window: number;
    recency_score: number;
    cohesion_score: number;
    hybrid_score: number;
  }[]>`
    WITH cluster_stats AS (
      SELECT
        c.id,
        c.topic,
        c.topic_source,
        c.item_count,
        c.last_seen_at,
        COUNT(*)::int AS items_window,
        COUNT(DISTINCT i.source_id)::int AS distinct_sources,
        STRING_AGG(DISTINCT s.name, ' / ' ORDER BY s.name) AS source_names,
        MAX(i.fetched_at) AS latest_item_at,
        AVG(
          CASE
            WHEN c.centroid_embedding IS NULL OR ie.embedding IS NULL THEN NULL
            ELSE (1 - (ie.embedding <=> c.centroid_embedding))
          END
        )::float AS cohesion_score
      FROM clusters c
      INNER JOIN item_enrichments ie ON ie.cluster_id = c.id
      INNER JOIN items i ON i.id = ie.item_id
      INNER JOIN sources s ON s.id = i.source_id
      WHERE i.fetched_at >= ${startAt.toISOString()}::timestamptz
        AND i.fetched_at < ${endAt.toISOString()}::timestamptz
        ${platformFrag}
        ${tagFrag}
      GROUP BY c.id, c.topic, c.topic_source, c.item_count, c.last_seen_at
      HAVING COUNT(DISTINCT i.source_id) >= ${consensusMinSources}
    ),
    maxv AS (
      SELECT
        GREATEST(MAX(cs.distinct_sources), 1)::float AS max_sources,
        GREATEST(MAX(cs.items_window), 1)::float AS max_items
      FROM cluster_stats cs
    )
    SELECT
      cs.id,
      cs.topic,
      cs.topic_source,
      cs.item_count,
      cs.last_seen_at,
      cs.distinct_sources,
      cs.source_names,
      cs.items_window,
      EXP(-GREATEST(EXTRACT(EPOCH FROM (now() - COALESCE(cs.latest_item_at, cs.last_seen_at))) / 3600.0, 0) / 48.0)::float AS recency_score,
      COALESCE(cs.cohesion_score, 0.5)::float AS cohesion_score,
      (
        ${weights.sources} * (cs.distinct_sources / maxv.max_sources)
        + ${weights.items} * (cs.items_window / maxv.max_items)
        + ${weights.recency} * EXP(-GREATEST(EXTRACT(EPOCH FROM (now() - COALESCE(cs.latest_item_at, cs.last_seen_at))) / 3600.0, 0) / 48.0)
        + ${weights.cohesion} * COALESCE(cs.cohesion_score, 0.5)
      )::float AS hybrid_score
    FROM cluster_stats cs
    CROSS JOIN maxv
    ORDER BY ${scoreOrder}
    LIMIT ${topN}
  `;

  const keywordMentionMax = Math.max(
    ...topTags.map((row) => row.mentions ?? 0),
    1,
  );
  const keywordGroupCandidates = topTags.map((row) => {
    const sourceEntriesRaw = Array.isArray(row.source_entries) ? row.source_entries : [];
    const sourceMap = new Map<string, { id: string; name: string; kind: string }>();
    for (const entry of sourceEntriesRaw) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const record = entry as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id : "";
      const name = typeof record.name === "string" ? record.name : "";
      const kind = typeof record.kind === "string" ? record.kind : "rss";
      if (!id || sourceMap.has(id)) continue;
      sourceMap.set(id, { id, name, kind });
    }
    const sourceEntries = [...sourceMap.values()];
    const sourceWeights = sourceEntries.map((entry) => sourceQualityWeight(entry.name, entry.kind));
    const weightedDistinctSources = sourceWeights.reduce((acc, value) => acc + value, 0);
    return { row, weightedDistinctSources };
  });
  const keywordSourceMax = Math.max(
    ...keywordGroupCandidates.map((candidate) => candidate.weightedDistinctSources),
    1,
  );
  const keywordGroups = keywordGroupCandidates.map(({ row, weightedDistinctSources }) => {
    const keywordConsistency =
      row.mentions > 0 ? Math.min(1, weightedDistinctSources / row.mentions) : 0;
    const recencyScore = recencyScoreForDate(row.latest_item_at, 72);
    const inverseDocumentFrequency = metricNumber(row.inverse_document_frequency);
    const idfScore = normalizeScore(inverseDocumentFrequency, 4);
    const attentionScore =
      normalizeScore(weightedDistinctSources, keywordSourceMax) * 0.42 +
      normalizeScore(row.mentions, keywordMentionMax) * 0.22 +
      idfScore * 0.15 +
      recencyScore * 0.13 +
      keywordConsistency * 0.08;
    const recencyLabel =
      recencyScore >= 0.72 ? "近期仍在升温" : recencyScore >= 0.35 ? "近期仍有提及" : "主要来自较早窗口";
    const relatedEvents = [...row.related_events.values()]
      .map((event) => {
        const sourceEntries = [...event.source_entries.values()];
        const sourceNames = sourceEntries
          .map((entry) => entry.name)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))
          .join(" / ");
        return {
          id: event.id,
          topic: event.topic,
          displayTitle: normalizeDisplayText(event.topic) || normalizeDisplayText([...event.representative_items.values()][0]?.titleZh ?? [...event.representative_items.values()][0]?.title) || row.keyword,
          topicState: event.topic_source === "llm" ? "named" : event.topic ? "generated" : "provisional",
          mentions: event.mentions,
          distinctSources: sourceEntries.length,
          sourceNames,
          latestItemAt: event.latest_item_at,
          representativeItems: [...event.representative_items.values()]
            .sort((a, b) => dateTimeValue(b.fetchedAt) - dateTimeValue(a.fetchedAt))
            .slice(0, 3),
        };
      })
      .sort((a, b) => {
        if (b.mentions !== a.mentions) return b.mentions - a.mentions;
        if (b.distinctSources !== a.distinctSources) return b.distinctSources - a.distinctSources;
        return dateTimeValue(b.latestItemAt) - dateTimeValue(a.latestItemAt);
      })
      .slice(0, 3);
    const representativeItems = [...row.representative_items.values()]
      .sort((a, b) => dateTimeValue(b.fetchedAt) - dateTimeValue(a.fetchedAt))
      .slice(0, 5);
    return {
      keyword: normalizeKeywordText(row.keyword),
      displayTitle: normalizeDisplayText(row.keyword),
      summary:
        relatedEvents.length > 0
          ? `${normalizeDisplayText(row.keyword)} 关联 ${relatedEvents.length} 个事件，主要由 ${row.distinct_sources} 个信源在当前窗口提及。`
          : `${normalizeDisplayText(row.keyword)} 在当前窗口被 ${row.distinct_sources} 个信源提及。`,
      attentionScore: Number(attentionScore.toFixed(4)),
      keywordConsistency: Number(keywordConsistency.toFixed(4)),
      mentions: row.mentions,
      distinctSources: row.distinct_sources,
      weightedDistinctSources: Number(weightedDistinctSources.toFixed(2)),
      sourceNames: row.source_names ?? "",
      eventCount: row.related_events.size,
      relatedEvents,
      representativeItems,
      selectionWindow: range,
      whyAttention: [
        `${row.distinct_sources} 个不同信源覆盖`,
        `窗口内提及 ${row.mentions} 次`,
        `加权信源覆盖 ${weightedDistinctSources.toFixed(2)}`,
        `${recencyLabel}，逆文档权重 ${inverseDocumentFrequency.toFixed(2)}`,
      ],
    };
  }).sort((a, b) =>
    b.attentionScore - a.attentionScore ||
    b.weightedDistinctSources - a.weightedDistinctSources ||
    b.distinctSources - a.distinctSources ||
    b.mentions - a.mentions ||
    a.displayTitle.localeCompare(b.displayTitle, "zh-Hans-CN"),
  ).slice(0, topN);

  const trend = await sqlClient<{
    day: Date;
    items_count: number;
    active_sources_count: number;
    clusters_count: number;
    hotspot_index: number;
  }[]>`
    WITH day_items AS (
      SELECT
        date_trunc('day', i.fetched_at) AS day,
        count(*)::int AS items_count,
        count(DISTINCT i.source_id)::int AS active_sources_count
      FROM items i
      INNER JOIN sources s ON s.id = i.source_id
      LEFT JOIN item_enrichments ie ON ie.item_id = i.id
      WHERE i.fetched_at >= ${startAt.toISOString()}::timestamptz
        AND i.fetched_at < ${endAt.toISOString()}::timestamptz
        ${platformFrag}
        ${tagFrag}
      GROUP BY day
    ),
    day_clusters AS (
      WITH day_cluster_sources AS (
        SELECT
          date_trunc('day', i.fetched_at) AS day,
          ie.cluster_id,
          count(DISTINCT i.source_id)::int AS distinct_sources
        FROM items i
        INNER JOIN sources s ON s.id = i.source_id
        LEFT JOIN item_enrichments ie ON ie.item_id = i.id
        WHERE i.fetched_at >= ${startAt.toISOString()}::timestamptz
          AND i.fetched_at < ${endAt.toISOString()}::timestamptz
          AND ie.cluster_id IS NOT NULL
          ${platformFrag}
          ${tagFrag}
        GROUP BY day, ie.cluster_id
      )
      SELECT
        day,
        count(*)::int AS clusters_count
      FROM day_cluster_sources
      WHERE distinct_sources >= ${consensusMinSources}
      GROUP BY day
    ),
    day_hotspots AS (
      WITH cluster_day AS (
        SELECT
          date_trunc('day', i.fetched_at) AS day,
          ie.cluster_id,
          count(*)::int AS items_window,
          count(DISTINCT i.source_id)::int AS distinct_sources,
          max(i.fetched_at) AS latest_item_at
        FROM items i
        INNER JOIN sources s ON s.id = i.source_id
        INNER JOIN item_enrichments ie ON ie.item_id = i.id
        WHERE i.fetched_at >= ${startAt.toISOString()}::timestamptz
          AND i.fetched_at < ${endAt.toISOString()}::timestamptz
          AND ie.cluster_id IS NOT NULL
          ${platformFrag}
          ${tagFrag}
        GROUP BY day, ie.cluster_id
      ),
      cluster_day_max AS (
      SELECT
        day,
        GREATEST(MAX(distinct_sources), 1)::float AS max_sources,
        GREATEST(MAX(items_window), 1)::float AS max_items
      FROM cluster_day
      WHERE distinct_sources >= ${consensusMinSources}
      GROUP BY day
      )
      SELECT
        cd.day,
        SUM(
          ${weights.sources} * (cd.distinct_sources / cdm.max_sources)
          + ${weights.items} * (cd.items_window / cdm.max_items)
          + ${weights.recency} * EXP(-GREATEST(EXTRACT(EPOCH FROM (now() - cd.latest_item_at)) / 3600.0, 0) / 48.0)
      )::float AS hotspot_index
      FROM cluster_day cd
      INNER JOIN cluster_day_max cdm ON cdm.day = cd.day
      WHERE cd.distinct_sources >= ${consensusMinSources}
      GROUP BY cd.day
    )
    SELECT
      di.day,
      di.items_count,
      di.active_sources_count,
      COALESCE(dc.clusters_count, 0)::int AS clusters_count,
      COALESCE(dh.hotspot_index, 0)::float AS hotspot_index
    FROM day_items di
    LEFT JOIN day_clusters dc ON dc.day = di.day
    LEFT JOIN day_hotspots dh ON dh.day = di.day
    ORDER BY di.day ASC
  `;

  const [clusterQuality] = await sqlClient<{
    total_clusters_window: number;
    cross_source_clusters_window: number;
    two_source_clusters_window: number;
    min_source_clusters_window: number;
  }[]>`
    WITH cluster_stats AS (
      SELECT
        ie.cluster_id,
        count(DISTINCT i.source_id)::int AS distinct_sources
      FROM items i
      INNER JOIN sources s ON s.id = i.source_id
      INNER JOIN item_enrichments ie ON ie.item_id = i.id
      WHERE i.fetched_at >= ${startAt.toISOString()}::timestamptz
        AND i.fetched_at < ${endAt.toISOString()}::timestamptz
        AND ie.cluster_id IS NOT NULL
        ${platformFrag}
        ${tagFrag}
      GROUP BY ie.cluster_id
      )
    SELECT
      count(*)::int AS total_clusters_window,
      count(*) FILTER (WHERE distinct_sources >= ${consensusMinSources})::int AS cross_source_clusters_window
      ,
      count(*) FILTER (WHERE distinct_sources = 2)::int AS two_source_clusters_window,
      count(*) FILTER (WHERE distinct_sources >= ${consensusMinSources})::int AS min_source_clusters_window
    FROM cluster_stats
  `;

  const safeTotals = totals ?? {
    total_items: 0,
    items_24h: 0,
    total_sources: 0,
    active_sources: 0,
    total_clusters: 0,
    items_window: 0,
    active_sources_window: 0,
    clusters_window: 0,
    items_prev_window: 0,
    active_sources_prev_window: 0,
    clusters_prev_window: 0,
  };
  const delta = {
    items: compare ? safeTotals.items_window - safeTotals.items_prev_window : null,
    activeSources: compare
      ? safeTotals.active_sources_window - safeTotals.active_sources_prev_window
      : null,
    clusters: compare ? safeTotals.clusters_window - safeTotals.clusters_prev_window : null,
  };

  return {
    range,
    filters: {
      platform: params?.platform ?? null,
      tag: params?.tag ?? null,
      compare,
      audience: params?.audience ?? null,
      minSources,
      clusterSort,
      from: startAt,
      to: endAt,
    },
    totals: safeTotals,
    delta,
    byPlatform,
    topTags: topTags.slice(0, topN),
    topClusters: topClusters.map((c) => ({
      id: c.id,
      topic: c.topic,
      topicSource: c.topic_source,
      itemCount: c.item_count,
      lastSeenAt: c.last_seen_at,
      distinctSources: c.distinct_sources,
      sourceNames: c.source_names ?? "",
      itemsWindow: c.items_window,
      recencyScore: c.recency_score,
      cohesionScore: c.cohesion_score,
      hybridScore: c.hybrid_score,
      attentionScore: c.hybrid_score,
      keywordConsistency:
        c.items_window > 0 ? Number((c.distinct_sources / c.items_window).toFixed(4)) : 0,
      whyAttention: [
        `${c.distinct_sources} distinct source${c.distinct_sources === 1 ? "" : "s"}`,
        `${c.items_window} item${c.items_window === 1 ? "" : "s"} in window`,
        `recency score ${c.recency_score.toFixed(2)}`,
      ],
      ...buildHotspotTitleMeta({
        topic: c.topic,
        topicSource: c.topic_source,
        titles: [],
        sourceNames: c.source_names ?? "",
        distinctSources: c.distinct_sources,
        weightedDistinctSources: c.distinct_sources,
        selectionWindow: range,
      }),
    })),
    keywordGroups,
    topicGroups: topClusters.map((c) => ({
      id: c.id,
      displayTitle: c.topic,
      attentionScore: c.hybrid_score,
      keywordConsistency:
        c.items_window > 0 ? Number((c.distinct_sources / c.items_window).toFixed(4)) : 0,
      topicState:
        (buildHotspotTitleMeta({
          topic: c.topic,
          topicSource: c.topic_source,
          titles: [],
          sourceNames: c.source_names ?? "",
          distinctSources: c.distinct_sources,
          weightedDistinctSources: c.distinct_sources,
          selectionWindow: range,
        }).topicState ?? "fallback"),
      whyAttention: [
        `${c.distinct_sources} distinct source${c.distinct_sources === 1 ? "" : "s"}`,
        `${c.items_window} item${c.items_window === 1 ? "" : "s"} in window`,
      ],
      selectionWindow: range,
      sourceNames: c.source_names ?? "",
      distinctSources: c.distinct_sources,
      itemsWindow: c.items_window,
    })),
    trend: trend.map((row) => ({
      day: row.day,
      items: row.items_count,
      activeSources: row.active_sources_count,
      clusters: row.clusters_count,
      hotspotIndex: row.hotspot_index,
    })),
    hotspot: {
      hotspotIndex: Number(topClusters.reduce((acc, c) => acc + c.hybrid_score, 0).toFixed(4)),
      attentionIndex: Number(topClusters.reduce((acc, c) => acc + c.hybrid_score, 0).toFixed(4)),
      totalClustersWindow: clusterQuality?.total_clusters_window ?? 0,
      crossSourceClustersWindow: clusterQuality?.cross_source_clusters_window ?? 0,
      crossSourceClusterRate:
        (clusterQuality?.total_clusters_window ?? 0) > 0
          ? (clusterQuality!.cross_source_clusters_window / clusterQuality!.total_clusters_window)
          : 0,
      weights,
      diagnostics: {
        twoSourceClustersWindow: clusterQuality?.two_source_clusters_window ?? 0,
        twoSourceClusterRate:
          (clusterQuality?.total_clusters_window ?? 0) > 0
            ? (clusterQuality!.two_source_clusters_window / clusterQuality!.total_clusters_window)
            : 0,
        minSourceClustersWindow: clusterQuality?.min_source_clusters_window ?? 0,
      },
    },
  };
}
export async function getHotspotOverview(params?: {
  range?: StatsRange;
  audience?: "public" | "personal";
  platform?: string;
  tag?: string;
  compare?: boolean;
  topN?: number;
  minSources?: number;
  clusterSort?: StatsClusterSort;
  from?: Date;
  to?: Date;
}) {
  const overview = await getStatsOverview(params);
  const sqlClient = getSql();
  const range = overview.range;
  const windowPolicy = getHotspotWindowPolicy(range);
  const minSources = Math.min(Math.max(params?.minSources ?? 2, 1), 20);
  const consensusMinSources = Math.max(minSources, windowPolicy.consensusMinSources);
  const breakingMinSources = Math.max(1, windowPolicy.breakingMinSources);
  const topN = Math.min(Math.max(params?.topN ?? 10, 3), 30);
  const audienceScope = audienceToSourceScope(overview.filters.audience ?? undefined);
  const scopeFrag = audienceScope ? sqlClient`AND s.scope = ${audienceScope}` : sqlClient``;
  const platformFrag = overview.filters.platform
    ? sqlClient`AND s.kind = ${overview.filters.platform}`
    : sqlClient``;
  const tagFrag = overview.filters.tag
    ? sqlClient`AND ie.tags @> ${`{"${overview.filters.tag.replace(/"/g, '\\"')}"}`}::text[]`
    : sqlClient``;
  const startAt = overview.filters.from ?? new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const endAt = overview.filters.to ?? new Date();
  const oneHourAgo = new Date(endAt.getTime() - 3600 * 1000);
  const fourHoursAgo = new Date(endAt.getTime() - 4 * 3600 * 1000);
  const twelveHoursAgo = new Date(endAt.getTime() - 12 * 3600 * 1000);

  const clusterRows = await sqlClient<
    {
      id: string;
      topic: string | null;
      topic_source: string | null;
      item_count: number;
      last_seen_at: Date;
      distinct_sources: number;
      distinct_platforms: number;
      source_names: string | null;
      source_entries: unknown;
      platform_metrics_entries: unknown;
      items_window: number;
      latest_item_at: Date | null;
      cohesion_score: number | null;
      items_1h: number;
      items_prev_3h: number;
      items_12h: number;
    }[]
  >`
    WITH cluster_stats AS (
      SELECT
        c.id,
        c.topic,
        c.topic_source,
        c.item_count,
        c.last_seen_at,
        COUNT(*)::int AS items_window,
        COUNT(DISTINCT i.source_id)::int AS distinct_sources,
        COUNT(DISTINCT s.kind)::int AS distinct_platforms,
        STRING_AGG(DISTINCT s.name, ' / ' ORDER BY s.name) AS source_names,
        JSONB_AGG(DISTINCT JSONB_BUILD_OBJECT('id', i.source_id::text, 'name', s.name, 'kind', s.kind)) AS source_entries,
        JSONB_AGG(ie.platform_metrics) AS platform_metrics_entries,
        MAX(i.fetched_at) AS latest_item_at,
        AVG(
          CASE
            WHEN c.centroid_embedding IS NULL OR ie.embedding IS NULL THEN NULL
            ELSE (1 - (ie.embedding <=> c.centroid_embedding))
          END
        )::float AS cohesion_score,
        SUM(CASE WHEN i.fetched_at >= ${oneHourAgo.toISOString()}::timestamptz THEN 1 ELSE 0 END)::int AS items_1h,
        SUM(
          CASE
            WHEN i.fetched_at >= ${fourHoursAgo.toISOString()}::timestamptz
             AND i.fetched_at < ${oneHourAgo.toISOString()}::timestamptz
            THEN 1 ELSE 0 END
        )::int AS items_prev_3h,
        SUM(CASE WHEN i.fetched_at >= ${twelveHoursAgo.toISOString()}::timestamptz THEN 1 ELSE 0 END)::int AS items_12h
      FROM clusters c
      INNER JOIN item_enrichments ie ON ie.cluster_id = c.id
      INNER JOIN items i ON i.id = ie.item_id
      INNER JOIN sources s ON s.id = i.source_id
      WHERE i.fetched_at >= ${startAt.toISOString()}::timestamptz
        AND i.fetched_at < ${endAt.toISOString()}::timestamptz
        ${scopeFrag}
        ${platformFrag}
        ${tagFrag}
      GROUP BY c.id, c.topic, c.topic_source, c.item_count, c.last_seen_at
    )
    SELECT * FROM cluster_stats
  `;

  const normalizedRows = clusterRows.map((row) => {
    const sourceEntriesRaw = Array.isArray(row.source_entries) ? row.source_entries : [];
    const sourceMap = new Map<string, { id: string; name: string; kind: string }>();
    for (const entry of sourceEntriesRaw) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const record = entry as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id : "";
      const name = typeof record.name === "string" ? record.name : "";
      const kind = typeof record.kind === "string" ? record.kind : "rss";
      if (!id) continue;
      if (!sourceMap.has(id)) {
        sourceMap.set(id, { id, name, kind });
      }
    }
    const sourceEntries = [...sourceMap.values()];
    const sourceWeights = sourceEntries.map((entry) => sourceQualityWeight(entry.name, entry.kind));
    const weightedDistinctSources = sourceWeights.reduce((acc, value) => acc + value, 0);
    const sourceQualityScore = sourceWeights.length > 0 ? weightedDistinctSources / sourceWeights.length : 0;
    const platformMetricsEntries = Array.isArray(row.platform_metrics_entries)
      ? row.platform_metrics_entries
      : [];
    const platformTotals = platformMetricsEntries.reduce(
      (acc: { x: number; hn: number }, metrics) => {
        const scored = summarizePlatformMetrics(metrics);
        acc.x += scored.x;
        acc.hn += scored.hn;
        return acc;
      },
      { x: 0, hn: 0 },
    );
    const xSignalScore = logScaled(platformTotals.x);
    const hnSignalScore = logScaled(platformTotals.hn);
    const burstVelocity = burstVelocityRaw(row.items_1h, row.items_prev_3h, row.items_12h);
    const recencyScore = recencyScoreForDate(row.latest_item_at ?? row.last_seen_at, 48);
    const breakingRecencyScore = recencyScoreForDate(row.latest_item_at ?? row.last_seen_at, windowPolicy.breakingMaxAgeHours);
    const crossPlatformScore = normalizeScore(row.distinct_platforms, 4);
    const display = buildHotspotTitleMeta({
      topic: row.topic,
      topicSource: row.topic_source,
      titles: [],
      sourceNames: row.source_names ?? "",
      distinctSources: row.distinct_sources,
      weightedDistinctSources,
      selectionWindow: range,
    });
    return {
      ...row,
      distinctSources: row.distinct_sources,
      distinctPlatforms: row.distinct_platforms,
      itemCount: row.item_count,
      lastSeenAt: row.last_seen_at,
      sourceNames: row.source_names ?? "",
      sourceEntries,
      platformMetricsEntries,
      itemsWindow: row.items_window,
      latestItemAt: row.latest_item_at,
      cohesionScore: row.cohesion_score,
      items1h: row.items_1h,
      itemsPrev3h: row.items_prev_3h,
      items12h: row.items_12h,
      weightedDistinctSources,
      sourceQualityScore,
      xSignalScore,
      hnSignalScore,
      burstVelocity,
      recencyScore,
      breakingRecencyScore,
      crossPlatformScore,
      ...display,
    };
  });

  const consensusSourceMax = Math.max(
    ...normalizedRows.map((row) => row.weightedDistinctSources),
    1,
  );
  const consensusItemMax = Math.max(...normalizedRows.map((row) => row.items_window), 1);
  const burstMax = Math.max(...normalizedRows.map((row) => row.burstVelocity), 1);
  const xMax = Math.max(...normalizedRows.map((row) => row.xSignalScore), 1);
  const hnMax = Math.max(...normalizedRows.map((row) => row.hnSignalScore), 1);

  const consensusWeights = {
    sources: safeEnvWeight("HOTSPOT_CONSENSUS_W_SOURCES", 0.42),
    items: safeEnvWeight("HOTSPOT_CONSENSUS_W_ITEMS", 0.18),
    recency: safeEnvWeight("HOTSPOT_CONSENSUS_W_RECENCY", 0.16),
    cohesion: safeEnvWeight("HOTSPOT_CONSENSUS_W_COHESION", 0.08),
    crossPlatform: safeEnvWeight("HOTSPOT_CONSENSUS_W_CROSS_PLATFORM", 0.16),
  };
  const breakingWeights = {
    velocity: safeEnvWeight("HOTSPOT_BREAKING_W_VELOCITY", 0.34),
    sourceQuality: safeEnvWeight("HOTSPOT_BREAKING_W_SOURCE_QUALITY", 0.18),
    x: safeEnvWeight("HOTSPOT_BREAKING_W_X", 0.2),
    hn: safeEnvWeight("HOTSPOT_BREAKING_W_HN", 0.1),
    recency: safeEnvWeight("HOTSPOT_BREAKING_W_RECENCY", 0.1),
    crossPlatform: safeEnvWeight("HOTSPOT_BREAKING_W_CROSS_PLATFORM", 0.08),
  };

  const scoredRows = normalizedRows.map((row) => {
    const consensusScore =
      consensusWeights.sources * normalizeScore(row.weightedDistinctSources, consensusSourceMax) +
      consensusWeights.items * normalizeScore(row.items_window, consensusItemMax) +
      consensusWeights.recency * row.recencyScore +
      consensusWeights.cohesion * (row.cohesion_score ?? 0.5) +
      consensusWeights.crossPlatform * row.crossPlatformScore;
    const breakingScore =
      breakingWeights.velocity * normalizeScore(row.burstVelocity, burstMax) +
      breakingWeights.sourceQuality * row.sourceQualityScore +
      breakingWeights.x * normalizeScore(row.xSignalScore, xMax) +
      breakingWeights.hn * normalizeScore(row.hnSignalScore, hnMax) +
      breakingWeights.recency * row.breakingRecencyScore +
      breakingWeights.crossPlatform * row.crossPlatformScore;
    return {
      ...row,
      consensusScore,
      breakingScore,
      attentionScore: Math.max(consensusScore, breakingScore),
      displayTitle: row.displayTitle,
      topicState: row.topicState,
      nameConfidence: row.nameConfidence,
      keywordConsistency:
        row.items_window > 0 ? Number((row.distinct_sources / row.items_window).toFixed(4)) : 0,
      whyConsensus: [
        `${row.distinct_sources} distinct source${row.distinct_sources === 1 ? "" : "s"}`,
        `${row.weightedDistinctSources.toFixed(2)} weighted source coverage`,
        `${row.items_window} item${row.items_window === 1 ? "" : "s"} in window`,
        `cross-platform score: ${row.crossPlatformScore.toFixed(2)}`,
      ],
      whyBreaking: [
        `burst velocity: ${row.burstVelocity.toFixed(2)}`,
        `source quality: ${row.sourceQualityScore.toFixed(2)}`,
        `X signal: ${row.xSignalScore.toFixed(2)}`,
        `HN signal: ${row.hnSignalScore.toFixed(2)}`,
      ],
      whyAttention: [
        `keyword consistency: ${row.items_window > 0 ? (row.distinct_sources / row.items_window).toFixed(2) : "0.00"}`,
        `weighted sources: ${row.weightedDistinctSources.toFixed(2)}`,
        `attention score: ${Math.max(consensusScore, breakingScore).toFixed(2)}`,
      ],
      whySelected: [
        `window: ${range}`,
        `title state: ${row.topicState}`,
        `display title: ${row.displayTitle}`,
      ],
      selectionWindow: range,
    };
  });

  const consensusClusters = scoredRows
    .filter((row) => row.distinct_sources >= consensusMinSources)
    .sort((a, b) => {
      if (b.consensusScore !== a.consensusScore) return b.consensusScore - a.consensusScore;
      if (b.distinct_sources !== a.distinct_sources) return b.distinct_sources - a.distinct_sources;
      if (b.items_window !== a.items_window) return b.items_window - a.items_window;
      return (b.recencyScore ?? 0) - (a.recencyScore ?? 0);
    })
    .slice(0, topN)
    .map((row) => ({
      ...row,
      distinctSources: row.distinctSources ?? row.distinct_sources,
      distinctPlatforms: row.distinctPlatforms ?? row.distinct_platforms,
      itemCount: row.itemCount ?? row.item_count,
      lastSeenAt: row.lastSeenAt ?? row.last_seen_at,
      sourceNames: row.sourceNames ?? row.source_names ?? "",
      itemsWindow: row.itemsWindow ?? row.items_window,
      latestItemAt: row.latestItemAt ?? row.latest_item_at,
      cohesionScore: row.cohesionScore ?? row.cohesion_score,
      consensusScore: Number(row.consensusScore.toFixed(4)),
      breakingScore: Number(row.breakingScore.toFixed(4)),
      attentionScore: Number(row.attentionScore.toFixed(4)),
      keywordConsistency: row.keywordConsistency,
      whyAttention: row.whyAttention,
    }));

  const breakingClusters = scoredRows
    .filter((row) => row.distinct_sources >= breakingMinSources)
    .sort((a, b) => {
      if (b.breakingScore !== a.breakingScore) return b.breakingScore - a.breakingScore;
      if (b.burstVelocity !== a.burstVelocity) return b.burstVelocity - a.burstVelocity;
      if (b.sourceQualityScore !== a.sourceQualityScore) return b.sourceQualityScore - a.sourceQualityScore;
      return (b.breakingRecencyScore ?? 0) - (a.breakingRecencyScore ?? 0);
    })
    .slice(0, topN)
    .map((row) => ({
      ...row,
      distinctSources: row.distinctSources ?? row.distinct_sources,
      distinctPlatforms: row.distinctPlatforms ?? row.distinct_platforms,
      itemCount: row.itemCount ?? row.item_count,
      lastSeenAt: row.lastSeenAt ?? row.last_seen_at,
      sourceNames: row.sourceNames ?? row.source_names ?? "",
      itemsWindow: row.itemsWindow ?? row.items_window,
      latestItemAt: row.latestItemAt ?? row.latest_item_at,
      cohesionScore: row.cohesionScore ?? row.cohesion_score,
      consensusScore: Number(row.consensusScore.toFixed(4)),
      breakingScore: Number(row.breakingScore.toFixed(4)),
      attentionScore: Number(row.attentionScore.toFixed(4)),
      keywordConsistency: row.keywordConsistency,
      whyAttention: row.whyAttention,
    }));

  return {
    ...overview,
    consensusClusters,
    breakingClusters,
    topicGroups: consensusClusters,
    topClusters: consensusClusters,
    hotspot: {
      ...overview.hotspot,
      hotspotIndex: Number(consensusClusters.reduce((acc, row) => acc + row.consensusScore, 0).toFixed(4)),
      attentionIndex: Number(consensusClusters.reduce((acc, row) => acc + row.attentionScore, 0).toFixed(4)),
      consensusHotspotIndex: Number(consensusClusters.reduce((acc, row) => acc + row.consensusScore, 0).toFixed(4)),
      breakingHotspotIndex: Number(breakingClusters.reduce((acc, row) => acc + row.breakingScore, 0).toFixed(4)),
      consensusWeights,
      breakingWeights,
    },
  };
}

export async function runRetention(days = 90) {
  const sqlClient = getSql();
  const [{ deleted_items }] = await sqlClient<{ deleted_items: number }[]>`
    WITH deleted AS (
      DELETE FROM items
      WHERE published_at IS NOT NULL
        AND published_at < now() - (${days} || ' days')::interval
      RETURNING id
    )
    SELECT count(*)::int AS deleted_items FROM deleted
  `;

  const [{ deleted_clusters }] = await sqlClient<{ deleted_clusters: number }[]>`
    WITH deleted AS (
      DELETE FROM clusters c
      WHERE NOT EXISTS (
        SELECT 1 FROM item_enrichments ie WHERE ie.cluster_id = c.id
      )
      RETURNING id
    )
    SELECT count(*)::int AS deleted_clusters FROM deleted
  `;

  return {
    deletedItems: deleted_items ?? 0,
    deletedClusters: deleted_clusters ?? 0,
  };
}






