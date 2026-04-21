import type { NormalizedItem } from "@news/connectors-core";

export type FilterFetchedItemsParams = {
  kind: string;
  /** Used by rss/wechat relaxation only; not used for hn/x incremental threshold anymore. */
  lastOkAt: Date | null | undefined;
  initialFetchDays: number | null | undefined;
  maxItemAgeDays: number | null | undefined;
  /** When `initialFetchDays` is null, use this default (e.g. FIRST_FETCH_MAX_AGE_DAYS). */
  firstFetchMaxAgeDaysDefault: number;
  items: NormalizedItem[];
  now: Date;
  /**
   * For hn / x-rsshub: `max(items.published_at)` already stored for this source.
   * Incremental lower bound is `max(firstThresh, watermark - slack)` so we do not compare
   * tweet times to wall-clock `lastOkAt` (which broke steady updates after first success).
   */
  maxPublishedAtWatermark?: Date | null;
  /** Subtracted from watermark to avoid duplicate edge inserts; default 5 minutes. */
  incrementalSlackMs?: number;
};

const DEFAULT_INCREMENTAL_SLACK_MS = 5 * 60 * 1000;

/**
 * Drop items outside the configured publish-time window.
 * hn / x-rsshub: when `maxPublishedAtWatermark` is set, keep items with publishedAt
 * not older than max(firstThresh, watermark - slack). When unset, use firstThresh only.
 * rss / wechat-wewe: firstThresh + maxItemAge only (pub date is article time).
 */
export function filterFetchedItems(params: FilterFetchedItemsParams): NormalizedItem[] {
  const initDays =
    params.initialFetchDays ?? params.firstFetchMaxAgeDaysDefault;
  const firstThresh = new Date(params.now.getTime() - initDays * 24 * 3600 * 1000);
  const maxAgeThresh =
    params.maxItemAgeDays != null
      ? new Date(params.now.getTime() - params.maxItemAgeDays * 24 * 3600 * 1000)
      : null;

  const isHnOrX = params.kind === "hn" || params.kind === "x-rsshub";
  const slackMs = params.incrementalSlackMs ?? DEFAULT_INCREMENTAL_SLACK_MS;
  const wm = params.maxPublishedAtWatermark ?? null;

  let pubThresh: Date;
  if (isHnOrX && wm) {
    const fromWatermark = new Date(wm.getTime() - slackMs);
    pubThresh = fromWatermark > firstThresh ? fromWatermark : firstThresh;
  } else {
    pubThresh = firstThresh;
  }

  return params.items.filter((item) => {
    if (!item.publishedAt) return true;
    if (item.publishedAt < pubThresh) return false;
    if (maxAgeThresh && item.publishedAt < maxAgeThresh) return false;
    return true;
  });
}
