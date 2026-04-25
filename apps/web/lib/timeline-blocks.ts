export type TimelineItemRecord = {
  id: string;
  sourceId: string;
  sourceName: string;
  platform: string;
  sourceConfig?: Record<string, unknown> | null;
  title: string | null;
  url: string | null;
  author: string | null;
  contentText: string | null;
  titleZh: string | null;
  contentZh: string | null;
  tags: string[] | null;
  clusterId: string | null;
  clusterTopic: string | null;
  relatedCount: number | null;
  relatedSourceCount?: number | null;
  clusterItemCount?: number | null;
  publishedAt: string | null;
  fetchedAt: string;
  whySelected?: string[];
};

export type TimelineItemBlock<TItem extends TimelineItemRecord = TimelineItemRecord> = {
  type: "item";
  id: string;
  item: TItem;
};

export type CollapsedSourceGroupBlock<TItem extends TimelineItemRecord = TimelineItemRecord> = {
  type: "collapsed-source-group";
  id: string;
  sourceId: string;
  sourceName: string;
  platform: string;
  sourceConfig?: Record<string, unknown> | null;
  windowStart: string;
  windowEnd: string;
  itemCount: number;
  latestItem: TItem;
  items: TItem[];
};

export type TimelineBlock<TItem extends TimelineItemRecord = TimelineItemRecord> =
  | TimelineItemBlock<TItem>
  | CollapsedSourceGroupBlock<TItem>;

export const DEFAULT_TIMELINE_COLLAPSE_WINDOW_HOURS = 12;
export const DEFAULT_TIMELINE_COLLAPSE_THRESHOLD = 4;
export const DEFAULT_TIMELINE_ALL_RAW_LIMIT = 150;
export const DEFAULT_TIMELINE_ALL_VISIBLE_LIMIT = 80;

function itemTimestampMs(item: Pick<TimelineItemRecord, "publishedAt" | "fetchedAt">) {
  const raw = item.publishedAt ?? item.fetchedAt;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function collapseWindowKey(
  item: Pick<TimelineItemRecord, "sourceId" | "publishedAt" | "fetchedAt">,
  windowHours: number,
) {
  const bucketMs = Math.max(1, windowHours) * 3600 * 1000;
  const ts = itemTimestampMs(item);
  const bucketStart = Math.floor(ts / bucketMs) * bucketMs;
  return `${item.sourceId}:${bucketStart}`;
}

export function buildTimelineBlocks<TItem extends TimelineItemRecord>(
  items: TItem[],
  options?: {
    collapseHighVolume?: boolean;
    collapseWindowHours?: number;
    collapseThreshold?: number;
  },
): TimelineBlock<TItem>[] {
  const collapseHighVolume = options?.collapseHighVolume ?? true;
  if (!collapseHighVolume) {
    return items.map((item) => ({ type: "item", id: item.id, item }));
  }

  const collapseWindowHours = Math.max(
    1,
    Math.trunc(options?.collapseWindowHours ?? DEFAULT_TIMELINE_COLLAPSE_WINDOW_HOURS),
  );
  const collapseThreshold = Math.max(
    2,
    Math.trunc(options?.collapseThreshold ?? DEFAULT_TIMELINE_COLLAPSE_THRESHOLD),
  );

  const grouped = new Map<string, TItem[]>();
  for (const item of items) {
    const key = collapseWindowKey(item, collapseWindowHours);
    const list = grouped.get(key);
    if (list) {
      list.push(item);
    } else {
      grouped.set(key, [item]);
    }
  }

  const collapsedKeys = new Set(
    [...grouped.entries()]
      .filter(([, groupItems]) => groupItems.length >= collapseThreshold)
      .map(([key]) => key),
  );

  const emittedKeys = new Set<string>();
  const blocks: TimelineBlock<TItem>[] = [];

  for (const item of items) {
    const key = collapseWindowKey(item, collapseWindowHours);
    if (!collapsedKeys.has(key)) {
      blocks.push({ type: "item", id: item.id, item });
      continue;
    }
    if (emittedKeys.has(key)) continue;
    emittedKeys.add(key);
    const groupedItems = grouped.get(key) ?? [item];
    const latestItem = groupedItems[0] ?? item;
    const latestMs = itemTimestampMs(latestItem);
    const windowEndMs = latestMs + collapseWindowHours * 3600 * 1000;
    blocks.push({
      type: "collapsed-source-group",
      id: `collapsed:${key}`,
      sourceId: latestItem.sourceId,
      sourceName: latestItem.sourceName,
      platform: latestItem.platform,
      sourceConfig: latestItem.sourceConfig,
      windowStart: new Date(Math.floor(latestMs / (collapseWindowHours * 3600 * 1000)) * collapseWindowHours * 3600 * 1000).toISOString(),
      windowEnd: new Date(windowEndMs).toISOString(),
      itemCount: groupedItems.length,
      latestItem,
      items: groupedItems,
    });
  }

  return blocks;
}
