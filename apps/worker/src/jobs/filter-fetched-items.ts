import type { NormalizedItem } from "@news/connectors-core";

export type FilterFetchedItemsParams = {
  kind: string;
  lastOkAt: Date | null | undefined;
  initialFetchDays: number | null | undefined;
  maxItemAgeDays: number | null | undefined;
  /** When `initialFetchDays` is null, use this default (e.g. FIRST_FETCH_MAX_AGE_DAYS). */
  firstFetchMaxAgeDaysDefault: number;
  items: NormalizedItem[];
  now: Date;
};

/**
 * Drop items outside the configured publish-time window.
 * hn / x-rsshub: also apply incremental window from lastOkAt (pub dates near "now").
 * rss / wechat-wewe: use only firstThresh + maxItemAge (pub date is article time, not sync time).
 */
export function filterFetchedItems(params: FilterFetchedItemsParams): NormalizedItem[] {
  const initDays =
    params.initialFetchDays ?? params.firstFetchMaxAgeDaysDefault;
  const firstThresh = new Date(params.now.getTime() - initDays * 24 * 3600 * 1000);
  const maxAgeThresh =
    params.maxItemAgeDays != null
      ? new Date(params.now.getTime() - params.maxItemAgeDays * 24 * 3600 * 1000)
      : null;

  const usePubDateIncrementalWindow =
    params.kind === "hn" || params.kind === "x-rsshub";
  const lastOk = params.lastOkAt ?? null;
  const lastOkThresh =
    lastOk && usePubDateIncrementalWindow
      ? new Date(lastOk.getTime() - 10 * 60 * 1000)
      : firstThresh;

  return params.items.filter((item) => {
    if (!item.publishedAt) return true;
    if (item.publishedAt < lastOkThresh) return false;
    if (maxAgeThresh && item.publishedAt < maxAgeThresh) return false;
    return true;
  });
}
