import { listItems, listSources } from "@news/db";
import { NextResponse } from "next/server";
import { DASH_NAV, SETTINGS_CATALOG, filterAndScore, matchText, type SearchGroupType } from "@/lib/global-search";

type GroupPayload = {
  type: SearchGroupType;
  label: string;
  results: Array<{
    id: string;
    type: SearchGroupType;
    title: string;
    subtitle?: string;
    href: string;
    score: number;
    meta?: Record<string, unknown>;
  }>;
};

const GROUP_LABELS: Record<SearchGroupType, string> = {
  nav: "页面",
  setting: "设置项",
  source: "信源",
  creator: "博主订阅",
  item: "时间轴",
};

type ScoredGroupRow = {
  type: SearchGroupType;
  label: string;
  results: Array<{ row: Omit<GroupPayload["results"][number], "score">; score: number }>;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limitPerGroup = Math.min(Math.max(Number(url.searchParams.get("limitPerGroup") ?? "5"), 1), 15);
  const itemLimit = Math.min(Math.max(Number(url.searchParams.get("itemLimit") ?? "20"), 1), 50);

  const navRows = DASH_NAV.map((n) => ({
    id: n.href,
    type: "nav" as const,
    title: n.label,
    subtitle: n.group,
    href: n.href,
  }));
  const settingRows = SETTINGS_CATALOG.map((s) => ({
    id: s.key,
    type: "setting" as const,
    title: `${s.title} (${s.key})`,
    subtitle: s.description,
    href: s.href,
  }));

  const [sources, items] = await Promise.all([
    listSources(),
    q ? listItems({ feed: "all", q, limit: itemLimit, sortBy: "published" }) : Promise.resolve([]),
  ]);

  const sourceRows = sources
    .filter((row) => row.kind !== "x-rsshub" && row.kind !== "wechat-wewe")
    .map((row) => ({
      id: row.id,
      type: "source" as const,
      title: row.name,
      subtitle: `${row.kind}${row.enabled ? "" : " · 已停用"}`,
      href: `/sources`,
      meta: { sourceId: row.id, kind: row.kind },
    }));
  const creatorRows = sources
    .filter((row) => row.kind === "x-rsshub" || row.kind === "wechat-wewe")
    .map((row) => ({
      id: row.id,
      type: "creator" as const,
      title: row.name,
      subtitle: `${row.kind}${row.enabled ? "" : " · 已停用"}`,
      href: "/creators",
      meta: { sourceId: row.id, kind: row.kind },
    }));

  const itemRows = items
    .filter((row) =>
      q
        ? matchText(
            [
              row.titleZh,
              row.title,
              row.contentZh,
              row.contentText,
              row.sourceName,
              row.author,
            ],
            q,
          )
        : true,
    )
    .map((row) => ({
      id: row.id,
      type: "item" as const,
      title: row.titleZh ?? row.title ?? "(无标题)",
      subtitle: row.sourceName,
      href: row.url ?? "/",
      meta: { itemId: row.id, sourceId: row.sourceId, platform: row.platform },
    }));

  const rawGroups: ScoredGroupRow[] = [
    { type: "nav", label: GROUP_LABELS.nav, results: filterAndScore(navRows, q) },
    { type: "setting", label: GROUP_LABELS.setting, results: filterAndScore(settingRows, q) },
    { type: "source", label: GROUP_LABELS.source, results: filterAndScore(sourceRows, q) },
    { type: "creator", label: GROUP_LABELS.creator, results: filterAndScore(creatorRows, q) },
    {
      type: "item",
      label: GROUP_LABELS.item,
      results: filterAndScore(itemRows, q).map((x) => ({ row: x.row, score: x.score + 5 })),
    },
  ];

  const scoredGroups: GroupPayload[] = rawGroups.map((g) => ({
    type: g.type,
    label: g.label,
    results: g.results.slice(0, limitPerGroup).map(({ row, score }) => ({ ...row, score })),
  }));

  return NextResponse.json({
    q,
    groups: scoredGroups,
  });
}
