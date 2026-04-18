import type { NormalizedItem } from "@news/connectors-core";
import { filterFetchedItems } from "./filter-fetched-items";

export type RelaxFilterParams = {
  kind: string;
  lastOkAt: Date | null | undefined;
  initialFetchDays: number | null | undefined;
  maxItemAgeDays: number | null | undefined;
  firstFetchMaxAgeDaysDefault: number;
  items: NormalizedItem[];
  now: Date;
};

/**
 * rss / wechat-wewe：从未成功过（lastOkAt 为空）且「有拉取结果但全被首抓天数滤掉」时，
 * 若当前有效回溯小于 7 天，再用 7 天窗口重算一次。
 *
 * 解决：新博主默认 1 天回溯时，公众号 Atom 里文章常早于 24h → 0 条入库，看起来像「抓失败」；
 * 而早期添加的源多为 3 天或更大窗口，仍能入库。
 */
export function filterItemsWithFirstFetchRelaxation(p: RelaxFilterParams): NormalizedItem[] {
  const first = filterFetchedItems(p);
  const effectiveDays = p.initialFetchDays ?? p.firstFetchMaxAgeDaysDefault;
  if (
    (p.kind === "rss" || p.kind === "wechat-wewe") &&
    !p.lastOkAt &&
    first.length === 0 &&
    p.items.length > 0 &&
    effectiveDays < 7
  ) {
    return filterFetchedItems({
      ...p,
      initialFetchDays: 7,
      firstFetchMaxAgeDaysDefault: 7,
    });
  }
  return first;
}
