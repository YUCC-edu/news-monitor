import { getConnector } from "@news/connectors-core";
import type { Job } from "bullmq";
import {
  getMaxPublishedAtForSource,
  getSourceById,
  markSourceRun,
  recordItems,
  updateSourceAvatarUrl,
  type MarkSourceRunFailureMeta,
} from "@news/db";
import { categorizeErrorMessage, classifyRemediation, createLogger, logTimelineServer } from "@news/shared";
import { publish } from "../ipc/publish";
import { filterItemsWithFirstFetchRelaxation } from "./relax-rss-wechat-first-fetch";

type FetchSourceJobData = {
  sourceId: string;
};

type FetchSourceOptions = {
  onInsertedItemIds?: (itemIds: string[]) => Promise<void>;
  onAfterFetchFailure?: (ctx: {
    sourceId: string;
    meta: MarkSourceRunFailureMeta | undefined;
  }) => Promise<void>;
};

const log = createLogger("worker:fetch-source");

export async function handleFetchSource(
  job: Job<FetchSourceJobData>,
  options: FetchSourceOptions = {},
) {
  const startedAtMs = Date.now();
  const source = await getSourceById(job.data.sourceId);
  const jobLog = log.child({ queue: "fetch-source", jobId: job.id, sourceId: job.data.sourceId });
  jobLog.debug("job started");
  if (!source || !source.enabled) return { ok: false, reason: "source-not-found-or-disabled" };
  const sourceLog = jobLog.child({ sourceName: source.name, kind: source.kind });

  const nowMs = Date.now();
  if (source.nextRunAfter && source.nextRunAfter.getTime() > nowMs) {
    sourceLog.debug("skipped because source is in backoff window", {
      nextRunAfter: source.nextRunAfter.toISOString(),
    });
    logTimelineServer("fetch", "skipped (backoff window)", {
      sourceId: source.id,
      name: source.name,
      nextRunAfter: source.nextRunAfter.toISOString(),
    });
    return { ok: true, skipped: "backoff" as const };
  }

  try {
    const connector = getConnector(
      source.kind as "rss" | "hn" | "x-rsshub" | "x-rsshub-search" | "wechat-wewe",
    );
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 25_000);
    try {
      const fetchStartedAtMs = Date.now();
      sourceLog.debug("connector fetch begin", {
        connector: source.kind,
        lastOkAt: source.lastOkAt?.toISOString() ?? null,
      });
      const fetchResult = await connector.fetch({
        source: {
          id: source.id,
          config: source.config,
          lastOkAt: source.lastOkAt,
        },
        now: new Date(),
        signal: ac.signal,
      });
      const fetchLatencyMs = Date.now() - fetchStartedAtMs;
      const normalized = fetchResult.items;
      const avatarUrl = fetchResult.sourceMeta?.avatarUrl;
      if (avatarUrl) {
        await updateSourceAvatarUrl(source.id, avatarUrl);
      }

      const now = new Date();
      const firstFetchDefault = Number(process.env.FIRST_FETCH_MAX_AGE_DAYS ?? 1);
      const maxPublishedAtWatermark = await getMaxPublishedAtForSource(source.id);
      const fresh = filterItemsWithFirstFetchRelaxation({
        kind: source.kind,
        lastOkAt: source.lastOkAt,
        initialFetchDays: source.initialFetchDays,
        maxItemAgeDays: source.maxItemAgeDays,
        firstFetchMaxAgeDaysDefault: firstFetchDefault,
        items: normalized,
        now,
        maxPublishedAtWatermark,
      });

      const inserted = await recordItems(source.id, fresh);
      sourceLog.info("fetch and persist completed", {
        latencyMs: Date.now() - startedAtMs,
        fetchLatencyMs,
        normalizedCount: normalized.length,
        afterFilterCount: fresh.length,
        insertedCount: inserted.length,
      });
      logTimelineServer("fetch", "recordItems result", {
        sourceId: source.id,
        name: source.name,
        kind: source.kind,
        normalizedCount: normalized.length,
        afterFirstFetchFilter: fresh.length,
        insertedNewRows: inserted.length,
      });
      await markSourceRun(source.id, { ok: true });
      await publish("news.events", {
        type: "source.health",
        sourceId: source.id,
        enabled: true,
        failCount: 0,
        lastOkAt: now.toISOString(),
        nextRunAfter: null,
      });
      if (inserted.length > 0 && options.onInsertedItemIds) {
        await options.onInsertedItemIds(inserted.map((row) => row.id));
      }

      for (const row of inserted) {
        await publish("news.events", {
          type: "item.created",
          item: {
            id: row.id,
            sourceId: source.id,
            sourceName: source.name,
            platform: source.kind,
            title: row.title,
          },
        });
      }
      if (inserted.length > 0) {
        sourceLog.debug("item.created events published", { count: inserted.length });
        logTimelineServer("fetch", "published item.created events", {
          sourceId: source.id,
          count: inserted.length,
          firstItemId: inserted[0]?.id,
        });
      }
      return { ok: true, fetched: normalized.length, inserted: inserted.length };
    } finally {
      clearTimeout(timeout);
      sourceLog.debug("fetch timeout cleared");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorClass = error instanceof Error ? error.name : typeof error;
    const errorCategory = categorizeErrorMessage(message);
    const remediation = classifyRemediation(errorCategory);
    sourceLog.error("fetch-source failed", {
      latencyMs: Date.now() - startedAtMs,
      errorClass,
      errorCategory,
      remediation,
      message,
      error,
    });
    const meta = await markSourceRun(source.id, { ok: false, error: message });
    const refreshed = await getSourceById(source.id);
    await publish("news.events", {
      type: "source.health",
      sourceId: source.id,
      enabled: refreshed?.enabled ?? false,
      failCount: refreshed?.failCount ?? meta?.failCount,
      lastError: message,
      nextRunAfter: refreshed?.nextRunAfter?.toISOString() ?? null,
      autoDisabled: meta?.autoDisabled ?? false,
    });
    await options.onAfterFetchFailure?.({ sourceId: source.id, meta });
    throw error;
  }
}
