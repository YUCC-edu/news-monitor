import { and, asc, desc, eq, ilike, inArray, lt, max, ne, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { computeDedupKey, type SourceKind } from "./dedup";
import { getDb, getSql } from "./client";
import type { Source } from "./schema";
import {
  clusters,
  favorites,
  itemEnrichments,
  items,
  keywordRules,
  sources,
  userLinks,
} from "./schema";

export type { SourceKind };

export type SourceInput = {
  id?: string;
  kind: SourceKind;
  name: string;
  config: unknown;
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
    raw: item.raw,
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
}) {
  const db = getDb();
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

/** Recent items in a cluster (for “其它来源” UI). */
export async function listClusterSiblingItems(params: {
  clusterId: string;
  excludeItemId?: string;
  excludeSourceId?: string;
  limit?: number;
}): Promise<ClusterSiblingRow[]> {
  const pg = getSql();
  const limit = Math.min(Math.max(params.limit ?? 30, 1), 100);
  const excludeItemFrag = params.excludeItemId ? pg`AND i.id <> ${params.excludeItemId}::uuid` : pg``;
  const excludeSourceFrag = params.excludeSourceId
    ? pg`AND i.source_id <> ${params.excludeSourceId}::uuid`
    : pg``;
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

export async function setClusterTopic(clusterId: string, topic: string) {
  const db = getDb();
  await db.update(clusters).set({ topic }).where(eq(clusters.id, clusterId));
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
  tags: string[] | null;
  categoryDomain: string[] | null;
  categoryTopic: string[] | null;
  categoryEntity: string[] | null;
  clusterId: string | null;
  clusterTopic: string | null;
  relatedCount: number | null;
  publishedAt: Date | null;
  fetchedAt: Date;
  favoritedAt: Date | null;
};

async function listCuratedItems(params: {
  limit?: number;
  before?: Date;
  /** Lower bound on COALESCE(published_at, fetched_at) for time-range filters. */
  publishedSince?: Date;
  platform?: string;
  q?: string;
  tags?: string[];
  favoritedOnly?: boolean;
  sortBy?: "published" | "fetched";
}): Promise<ItemListRow[]> {
  const pg = getSql();
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const publishedSinceIso = params.publishedSince?.toISOString();
  const qLike = params.q ? `%${params.q}%` : null;
  const tagsLiteral =
    params.tags && params.tags.length > 0
      ? `{${params.tags.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(",")}}`
      : null;

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
    tags: string[] | null;
    category_domain: string[] | null;
    category_topic: string[] | null;
    category_entity: string[] | null;
    cluster_id: string;
    cluster_topic: string | null;
    related_count: number;
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
      INNER JOIN clusters c ON c.id = ie.cluster_id AND c.item_count >= 2
      WHERE true
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
    tags: r.tags,
    categoryDomain: r.category_domain,
    categoryTopic: r.category_topic,
    categoryEntity: r.category_entity,
    clusterId: r.cluster_id,
    clusterTopic: r.cluster_topic,
    relatedCount: r.related_count,
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
  platform?: string;
  q?: string;
  tags?: string[];
  favoritedOnly?: boolean;
  sortBy?: "published" | "fetched";
}) {
  if (params.feed === "curated") {
    return listCuratedItems(params);
  }

  const db = getDb();
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const publishedSinceIso = params.publishedSince?.toISOString();
  const clauses: SQL[] = [];
  const sortBy = params.sortBy ?? "published";
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

export async function getStatsOverview() {
  const sqlClient = getSql();

  const [totals] = await sqlClient<
    {
      total_items: number;
      items_24h: number;
      total_sources: number;
      active_sources: number;
      total_clusters: number;
    }[]
  >`
    SELECT
      (SELECT count(*)::int FROM items) AS total_items,
      (SELECT count(*)::int FROM items WHERE fetched_at > now() - interval '24 hours') AS items_24h,
      (SELECT count(*)::int FROM sources) AS total_sources,
      (SELECT count(*)::int FROM sources WHERE last_ok_at > now() - interval '7 days') AS active_sources,
      (SELECT count(*)::int FROM clusters) AS total_clusters
  `;

  const byPlatform = await sqlClient<{ kind: string; count: number }[]>`
    SELECT s.kind, count(*)::int AS count
    FROM items i
    JOIN sources s ON s.id = i.source_id
    WHERE i.fetched_at > now() - interval '7 days'
    GROUP BY s.kind
    ORDER BY count DESC
  `;

  const topTags = await sqlClient<{ tag: string; count: number }[]>`
    SELECT unnest(tags) AS tag, count(*)::int AS count
    FROM item_enrichments
    WHERE enriched_at > now() - interval '7 days'
    GROUP BY tag
    ORDER BY count DESC
    LIMIT 10
  `;

  const topClusters = await sqlClient<{
    id: string;
    topic: string | null;
    item_count: number;
    last_seen_at: Date;
  }[]>`
    SELECT id, topic, item_count, last_seen_at
    FROM clusters
    WHERE last_seen_at > now() - interval '7 days'
      AND item_count > 1
    ORDER BY item_count DESC, last_seen_at DESC
    LIMIT 10
  `;

  return {
    totals: totals ?? {
      total_items: 0,
      items_24h: 0,
      total_sources: 0,
      active_sources: 0,
      total_clusters: 0,
    },
    byPlatform,
    topTags,
    topClusters: topClusters.map((c) => ({
      id: c.id,
      topic: c.topic,
      itemCount: c.item_count,
      lastSeenAt: c.last_seen_at,
    })),
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
