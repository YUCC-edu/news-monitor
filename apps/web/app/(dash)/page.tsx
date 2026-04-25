"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/app/ui/button";
import { useAppearance } from "@/app/ui/appearance-provider";
import { Card } from "@/app/ui/card";
import { Drawer } from "@/app/ui/drawer";
import { Skeleton } from "@/app/ui/skeleton";
import { SourceAvatar } from "@/app/ui/source-avatar";
import { Tabs } from "@/app/ui/tabs";
import { type TimelineBlock, type TimelineItemRecord } from "@/lib/timeline-blocks";
import { getPreferredContent } from "@/lib/ui-preferences";

type TimelineRange = "24h" | "72h" | "7d" | "30d";

type ClusterSiblingRow = {
  itemId: string;
  title: string | null;
  titleZh: string | null;
  url: string | null;
  sourceId: string;
  sourceName: string;
  platform: string;
  sourceConfig: unknown;
};

type HotspotCluster = {
  id: string;
  topic: string | null;
  displayTitle?: string;
  topicState?: "named" | "generated" | "provisional" | "fallback";
  nameConfidence?: number;
  selectionWindow?: string;
  whySelected?: string[];
  titleState?: string;
  itemCount: number;
  lastSeenAt: string;
  distinctSources: number;
  weightedDistinctSources: number;
  sourceNames: string;
  itemsWindow: number;
  recencyScore: number;
  cohesionScore: number;
  consensusScore?: number;
  breakingScore?: number;
  crossPlatformScore: number;
  burstVelocity?: number;
  xSignalScore?: number;
  hnSignalScore?: number;
  sourceQualityScore?: number;
  whyConsensus?: string[];
  whyBreaking?: string[];
  platforms?: string[];
};

type Overview = {
  totals: {
    items_window: number;
    active_sources_window: number;
    clusters_window: number;
  };
  consensusClusters: HotspotCluster[];
  breakingClusters: HotspotCluster[];
  topicGroups?: HotspotCluster[];
  keywordGroups?: Array<{
    keyword: string;
    displayTitle?: string;
    attentionScore?: number;
    keywordConsistency?: number;
    mentions?: number;
    distinctSources?: number;
    weightedDistinctSources?: number;
    sourceNames?: string;
    whyAttention?: string[];
  }>;
  hotspot: {
    consensusHotspotIndex?: number;
    breakingHotspotIndex?: number;
    attentionIndex?: number;
  };
};

const RANGE_TABS = [
  { id: "24h", label: "24H" },
  { id: "72h", label: "72H" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
] as const;

const TIMELINE_PAGE_LIMIT = 80;

function parseRange(raw: string | null): TimelineRange {
  return raw === "24h" || raw === "72h" || raw === "30d" ? raw : "7d";
}

function formatRelativeTime(raw: string | null | undefined) {
  if (!raw) return "未知";
  const ms = new Date(raw).getTime();
  if (!Number.isFinite(ms)) return "未知";
  const diffMinutes = Math.max(1, Math.round((Date.now() - ms) / 60000));
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  return `${Math.round(diffHours / 24)} 天前`;
}

function formatWindow(windowStart: string, windowEnd: string) {
  const start = new Date(windowStart);
  const end = new Date(windowEnd);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return "最近窗口";
  const date = new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(start);
  const time = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date} ${time.format(start)} - ${time.format(end)}`;
}

function keywordTitle(keyword: NonNullable<Overview["keywordGroups"]>[number]) {
  return keyword.displayTitle?.trim() || keyword.keyword?.trim() || "未命名关键词";
}

function timelineQuery(range: TimelineRange, q: string, audience: "public" | "personal" = "personal") {
  const params = new URLSearchParams();
  params.set("feed", "all");
  params.set("limit", String(TIMELINE_PAGE_LIMIT));
  params.set("range", range);
  params.set("rawLimit", "150");
  params.set("audience", audience);
  if (q.trim()) params.set("q", q.trim());
  return params.toString();
}

function statsRange(range: TimelineRange) {
  return range;
}

function blockTimestampMs(block: TimelineBlock<TimelineItemRecord>) {
  if (block.type === "item") {
    const ms = new Date(block.item.publishedAt ?? block.item.fetchedAt).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  let min = Infinity;
  for (const item of block.items) {
    const ms = new Date(item.publishedAt ?? item.fetchedAt).getTime();
    if (Number.isFinite(ms) && ms < min) min = ms;
  }
  return Number.isFinite(min) ? min : 0;
}

function oldestBlockCursor(blocks: TimelineBlock<TimelineItemRecord>[]) {
  let min = Infinity;
  for (const block of blocks) {
    const ms = blockTimestampMs(block);
    if (ms > 0 && ms < min) min = ms;
  }
  return Number.isFinite(min) ? new Date(min).toISOString() : null;
}

function mergeTimelineBlocks(
  current: TimelineBlock<TimelineItemRecord>[],
  incoming: TimelineBlock<TimelineItemRecord>[],
) {
  if (incoming.length === 0) return current;
  const merged = [...current];
  const indexById = new Map<string, number>();
  for (let i = 0; i < merged.length; i += 1) indexById.set(merged[i].id, i);

  const mergeItems = (existing: TimelineItemRecord[], next: TimelineItemRecord[]) => {
    const byId = new Map<string, TimelineItemRecord>();
    for (const item of existing) byId.set(item.id, item);
    for (const item of next) byId.set(item.id, item);
    return [...byId.values()].sort((a, b) => {
      const aMs = new Date(a.publishedAt ?? a.fetchedAt).getTime();
      const bMs = new Date(b.publishedAt ?? b.fetchedAt).getTime();
      return bMs - aMs;
    });
  };

  for (const block of incoming) {
    const existingIndex = indexById.get(block.id);
    if (existingIndex == null) {
      merged.push(block);
      indexById.set(block.id, merged.length - 1);
      continue;
    }
    const existing = merged[existingIndex];
    if (existing.type === "collapsed-source-group" && block.type === "collapsed-source-group") {
      const items = mergeItems(existing.items, block.items);
      merged[existingIndex] = {
        ...existing,
        itemCount: items.length,
        items,
        latestItem: items[0] ?? existing.latestItem,
        windowStart: new Date(
          Math.min(new Date(existing.windowStart).getTime() || Infinity, new Date(block.windowStart).getTime() || Infinity),
        ).toISOString(),
        windowEnd: new Date(
          Math.max(new Date(existing.windowEnd).getTime() || 0, new Date(block.windowEnd).getTime() || 0),
        ).toISOString(),
      };
    } else {
      merged[existingIndex] = block;
    }
  }

  return merged;
}

function DashboardSkeleton() {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Skeleton style={{ width: "100%", height: 220, borderRadius: 12 }} />
      <Skeleton style={{ width: "100%", height: 260, borderRadius: 12 }} />
      <Skeleton style={{ width: "100%", height: 320, borderRadius: 12 }} />
    </div>
  );
}

function KeywordBoard({ keywords }: { keywords: NonNullable<Overview["keywordGroups"]> }) {
  const lead = keywords[0] ?? null;
  const rest = keywords.slice(1, 9);
  const totalMentions = keywords.reduce((sum, keyword) => sum + (keyword.mentions ?? 0), 0);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ color: "var(--fg-0)", fontSize: 20, fontWeight: 700 }}>高频关键词</div>
          <div className="nm-muted" style={{ fontSize: 13 }}>
            来自当前时间窗内所有已添加信源抓取内容的关键词汇总，按出现频次排序。
          </div>
        </div>
        <span className="nm-chip">
          {keywords.length} 个关键词 · {totalMentions} 次提及
        </span>
      </div>

      {lead ? (
        <>
          <Card style={{ padding: 18, display: "grid", gap: 12, minHeight: 240, borderColor: "var(--border-strong)" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span className="nm-chip">{lead.mentions ?? 0} 次提及</span>
              <span className="nm-muted" style={{ fontSize: 12 }}>{lead.distinctSources ?? 0} 个来源</span>
              <span className="nm-muted" style={{ fontSize: 12 }}>{lead.weightedDistinctSources?.toFixed(2) ?? "0.00"} 加权来源</span>
            </div>
            <h2 style={{ margin: 0, color: "var(--fg-0)", fontSize: 28, lineHeight: 1.18 }}>
              {keywordTitle(lead)}
            </h2>
            <div className="nm-muted" style={{ lineHeight: 1.7 }}>
              {lead.whyAttention?.join(" · ") ||
                `关键词一致性 ${lead.keywordConsistency?.toFixed(2) ?? "0.00"} · 关注分 ${lead.attentionScore?.toFixed(2) ?? "0.00"}`}
            </div>
            <div className="nm-muted" style={{ fontSize: 12 }}>{lead.sourceNames || "来源列表不可用"}</div>
          </Card>

          {rest.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
              {rest.map((keyword, index) => (
                <Card key={`${keyword.keyword}-${index}`} style={{ padding: 14, display: "grid", gap: 8, minHeight: 170 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <span className="nm-muted" style={{ fontSize: 11 }}>{keyword.mentions ?? 0} 次提及</span>
                    <span className="nm-muted" style={{ fontSize: 11 }}>{keyword.distinctSources ?? 0} 个来源</span>
                  </div>
                  <div style={{ color: "var(--fg-0)", fontWeight: 650, lineHeight: 1.45 }}>{keywordTitle(keyword)}</div>
                  <div className="nm-muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
                    {keyword.whyAttention?.slice(0, 2).join(" · ") ||
                      `关键词一致性 ${keyword.keywordConsistency?.toFixed(2) ?? "0.00"} · 关注分 ${keyword.attentionScore?.toFixed(2) ?? "0.00"}`}
                  </div>
                  <div className="nm-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                    {keyword.sourceNames || "来源列表不可用"}
                  </div>
                </Card>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <Card style={{ padding: 18 }}>
          <div style={{ color: "var(--fg-0)", fontWeight: 600, marginBottom: 6 }}>暂无高频关键词</div>
          <div className="nm-muted">当前时间窗内还没有足够的抓取动态形成关键词汇总。</div>
        </Card>
      )}
    </div>
  );
}

function DashboardHomeInner() {
  const { locale } = useAppearance();
  const router = useRouter();
  const searchParams = useSearchParams();
  const range = parseRange(searchParams.get("range"));
  const q = (searchParams.get("q") ?? "").trim();
  const [queryInput, setQueryInput] = useState(q);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [timelineBlocks, setTimelineBlocks] = useState<TimelineBlock<TimelineItemRecord>[]>([]);
  const [timelineCursor, setTimelineCursor] = useState<string | null>(null);
  const [hasMoreTimeline, setHasMoreTimeline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [siblingsOpen, setSiblingsOpen] = useState(false);
  const [siblingsRows, setSiblingsRows] = useState<ClusterSiblingRow[]>([]);
  const [siblingsLoading, setSiblingsLoading] = useState(false);
  const [siblingsTitle, setSiblingsTitle] = useState("其他来源补充");
  const timelineBlocksRef = useRef(timelineBlocks);
  const timelineCursorRef = useRef<string | null>(timelineCursor);

  const setFilters = useCallback(
    (next: { range?: TimelineRange; q?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      const nextRange = next.range ?? range;
      params.set("range", nextRange);
      const nextQuery = (next.q ?? q).trim();
      if (nextQuery) params.set("q", nextQuery);
      else params.delete("q");
      router.replace(`/?${params.toString()}`, { scroll: false });
    },
    [q, range, router, searchParams],
  );

  useEffect(() => {
    setQueryInput(q);
  }, [q]);

  useEffect(() => {
    timelineBlocksRef.current = timelineBlocks;
  }, [timelineBlocks]);

  useEffect(() => {
    timelineCursorRef.current = timelineCursor;
  }, [timelineCursor]);

  const load = useCallback(
    async (append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const timelineParams = new URLSearchParams(timelineQuery(range, q, "public"));
        const before = timelineCursorRef.current;
        if (append && before) timelineParams.set("before", before);
        const [statsResponse, timelineResponse] = await Promise.all([
          fetch(`/api/stats?range=${statsRange(range)}&audience=public`, { cache: "no-store" }),
          fetch(`/api/items?${timelineParams.toString()}`, { cache: "no-store" }),
        ]);
        const [statsJson, timelineJson] = await Promise.all([
          statsResponse.json() as Promise<Overview | { error?: string }>,
          timelineResponse.json() as Promise<TimelineBlock<TimelineItemRecord>[] | { error?: string }>,
        ]);
        if (!statsResponse.ok) {
          throw new Error("error" in statsJson ? statsJson.error || "加载值得关注失败" : "加载值得关注失败");
        }
        if (!timelineResponse.ok) {
          throw new Error(
            typeof timelineJson === "object" && timelineJson && "error" in timelineJson
              ? timelineJson.error || "加载时间流失败"
              : "加载时间流失败",
          );
        }
        setOverview(statsJson as Overview);
        const incoming = Array.isArray(timelineJson) ? timelineJson : [];
        const merged = append ? mergeTimelineBlocks(timelineBlocksRef.current, incoming) : incoming;
        setTimelineBlocks(merged);
        setTimelineCursor(oldestBlockCursor(merged));
        setHasMoreTimeline(incoming.length > 0);
      } catch (loadError) {
        setOverview(null);
        setTimelineBlocks([]);
        setTimelineCursor(null);
        setHasMoreTimeline(false);
        setError(loadError instanceof Error ? loadError.message : "加载总编台失败");
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [q, range],
  );

  useEffect(() => {
    setTimelineBlocks([]);
    setTimelineCursor(null);
    setHasMoreTimeline(true);
    void load(false);
  }, [load, q, range]);

  useEffect(() => {
    const source = new EventSource("/api/stream");
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void load();
      }, 300);
    };
    source.addEventListener("item.created", refetch);
    source.addEventListener("item.enriched", refetch);
    source.addEventListener("cluster.updated", refetch);
    source.addEventListener("sources.changed", refetch);
    return () => {
      if (timer) clearTimeout(timer);
      source.close();
    };
  }, [load]);

  const summary = useMemo(() => {
    const collapsedGroups = timelineBlocks.filter((block) => block.type === "collapsed-source-group");
    const keywordGroups = overview?.keywordGroups ?? [];
    const collapsedItems = collapsedGroups.reduce((sum, block) => sum + block.itemCount, 0);
    const keywordMentions = keywordGroups.reduce((sum, keyword) => sum + (keyword.mentions ?? 0), 0);
    return {
      totalItems: overview?.totals.items_window ?? 0,
      activeSources: overview?.totals.active_sources_window ?? 0,
      keywordCount: keywordGroups.length,
      keywordMentions,
      collapsedGroups: collapsedGroups.length,
      collapsedItems,
    };
  }, [overview, timelineBlocks]);

  async function openSiblings(cluster: HotspotCluster, audience: "public" | "personal" = "public") {
    setSiblingsOpen(true);
    setSiblingsLoading(true);
    setSiblingsRows([]);
    setSiblingsTitle(cluster.topic?.trim() || `来源补充 · ${cluster.id.slice(0, 8)}`);
    try {
      const response = await fetch(`/api/clusters/${cluster.id}/siblings?audience=${audience}`, {
        cache: "no-store",
      });
      const json = (await response.json()) as { items?: ClusterSiblingRow[]; error?: string };
      if (!response.ok) throw new Error(json.error || "加载其他来源失败");
      setSiblingsRows(Array.isArray(json.items) ? json.items : []);
    } catch {
      setSiblingsRows([]);
    } finally {
      setSiblingsLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <section
        style={{
          display: "grid",
          gap: 16,
          padding: 18,
          border: "1px solid var(--border)",
          borderRadius: 12,
          background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
        }}
      >
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.4, color: "var(--fg-3)" }}>
            总编台工作面
          </div>
          <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.12, color: "var(--fg-0)" }}>总编台</h1>
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
          <Tabs
            tabs={RANGE_TABS.map((tab) => ({ id: tab.id, label: tab.label }))}
            value={range}
            onChange={(next) => setFilters({ range: next as TimelineRange })}
          />
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setFilters({ q: queryInput });
            }}
            style={{ display: "flex", gap: 8, flexWrap: "wrap", minWidth: "min(100%, 420px)" }}
          >
            <input
              className="nm-input"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="搜索事件、信源、关键词"
              style={{ minWidth: 260, flex: 1 }}
            />
            <Button variant="primary" type="submit">
              搜索
            </Button>
          </form>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12,
          }}
        >
          {[
            { label: "窗口条目", value: summary.totalItems },
            { label: "活跃信源", value: summary.activeSources },
            { label: "高频关键词", value: summary.keywordCount },
            { label: "关键词提及", value: summary.keywordMentions },
            { label: "已折叠信源", value: summary.collapsedGroups },
            { label: "折叠条目", value: summary.collapsedItems },
          ].map((metric) => (
            <div
              key={metric.label}
              style={{
                minWidth: 118,
                padding: "10px 12px",
                border: "1px solid var(--border)",
                borderRadius: 10,
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <div className="nm-muted" style={{ fontSize: 11 }}>
                {metric.label}
              </div>
              <div style={{ fontSize: 22, color: "var(--fg-0)", fontWeight: 700 }}>{metric.value}</div>
            </div>
          ))}
        </div>
      </section>

      {error ? (
        <Card style={{ borderColor: "var(--border-strong)", padding: 18 }}>
          <div style={{ color: "var(--fg-0)", fontWeight: 600, marginBottom: 6 }}>加载失败</div>
          <div className="nm-muted">{error}</div>
        </Card>
      ) : null}

      {loading || !overview ? (
        <DashboardSkeleton />
      ) : (
        <>
          <section
            style={{
              display: "grid",
              gap: 16,
            }}
          >
            <KeywordBoard keywords={overview.keywordGroups ?? []} />
          </section>

          <section style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gap: 4 }}>
              <div
                style={{
                  fontSize: 12,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  color: "var(--fg-3)",
                }}
              >
                时间流
              </div>
              <div style={{ color: "var(--fg-0)", fontSize: 22, fontWeight: 700 }}>全部抓取动态</div>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {timelineBlocks.map((block) =>
                block.type === "collapsed-source-group" ? (
                  <Card
                    key={block.id}
                    style={{
                      padding: 16,
                      display: "grid",
                      gap: 14,
                      borderColor: expandedGroups[block.id] ? "var(--border-strong)" : "var(--border)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <SourceAvatar
                          source={{
                            kind: block.platform,
                            name: block.sourceName,
                            config: block.sourceConfig as Record<string, unknown> | null,
                          }}
                          size={38}
                        />
                        <div style={{ display: "grid", gap: 4 }}>
                          <div style={{ color: "var(--fg-0)", fontWeight: 600 }}>{block.sourceName}</div>
                          <div className="nm-muted" style={{ fontSize: 12 }}>
                            {formatWindow(block.windowStart, block.windowEnd)} · {block.itemCount} 条更新
                          </div>
                        </div>
                      </div>
                  <Button
                        size="sm"
                        onClick={() =>
                          setExpandedGroups((current) => ({
                            ...current,
                            [block.id]: !current[block.id],
                          }))
                        }
                      >
                        {expandedGroups[block.id] ? "收起" : "展开"}
                      </Button>
                    </div>

                    <div style={{ color: "var(--fg-0)", fontSize: 18, lineHeight: 1.45, fontWeight: 600 }}>
                      {getPreferredContent(block.latestItem, locale, "title") || "暂无标题"}
                    </div>

                    {expandedGroups[block.id] ? (
                      <div style={{ display: "grid", gap: 10 }}>
                        {block.items.map((item) => (
                          <div
                            key={item.id}
                            style={{
                              paddingTop: 10,
                              borderTop: "1px solid var(--border)",
                              display: "grid",
                              gap: 6,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                              <div style={{ color: "var(--fg-0)", fontWeight: 500, lineHeight: 1.5 }}>
                                {getPreferredContent(item, locale, "title") || "暂无标题"}
                              </div>
                              <div className="nm-muted" style={{ fontSize: 12 }}>
                                {formatRelativeTime(item.publishedAt ?? item.fetchedAt)}
                              </div>
                            </div>
                            {item.url ? (
                              <a href={item.url} target="_blank" rel="noreferrer" className="nm-link-inline">
                                打开原文
                              </a>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </Card>
                ) : (
                  <Card key={block.id} style={{ padding: 16, display: "grid", gap: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <SourceAvatar
                          source={{
                            kind: block.item.platform,
                            name: block.item.sourceName,
                            config: block.item.sourceConfig as Record<string, unknown> | null,
                          }}
                          size={34}
                        />
                        <div>
                          <div style={{ color: "var(--fg-0)", fontWeight: 600 }}>{block.item.sourceName}</div>
                          <div className="nm-muted" style={{ fontSize: 12 }}>
                            {formatRelativeTime(block.item.publishedAt ?? block.item.fetchedAt)}
                          </div>
                        </div>
                      </div>
                      {block.item.clusterId && (block.item.relatedSourceCount ?? block.item.relatedCount ?? 1) > 1 ? (
                        <Button
                          size="sm"
                          onClick={() =>
                            void openSiblings(
                              {
                                id: block.item.clusterId!,
                                topic: block.item.clusterTopic ?? null,
                                itemCount: block.item.clusterItemCount ?? 0,
                                lastSeenAt: block.item.fetchedAt,
                                distinctSources: block.item.relatedSourceCount ?? 1,
                                weightedDistinctSources: block.item.relatedSourceCount ?? 1,
                                sourceNames: block.item.sourceName,
                                itemsWindow: block.item.clusterItemCount ?? 0,
                                recencyScore: 0,
                                cohesionScore: 0,
                                crossPlatformScore: 0,
                              },
                              "public",
                            )
                          }
                        >
                          查看来源
                        </Button>
                      ) : null}
                    </div>
                    <div style={{ color: "var(--fg-0)", fontSize: 18, lineHeight: 1.45, fontWeight: 600 }}>
                      {getPreferredContent(block.item, locale, "title") || "暂无标题"}
                    </div>
                    {block.item.url ? (
                      <a href={block.item.url} target="_blank" rel="noreferrer" className="nm-link-inline">
                        打开原文
                      </a>
                    ) : null}
                  </Card>
                ),
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "center", paddingTop: 4 }}>
              <Button variant="ghost" onClick={() => void load(true)} disabled={loadingMore || !hasMoreTimeline}>
                {loadingMore ? "加载中..." : hasMoreTimeline ? "加载更多" : "没有更多了"}
              </Button>
            </div>
          </section>
        </>
      )}

      <Drawer open={siblingsOpen} onClose={() => setSiblingsOpen(false)} title={siblingsTitle} width={560}>
        {siblingsLoading ? (
          <div style={{ display: "grid", gap: 10 }}>
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} style={{ width: "100%", height: 84, borderRadius: 10 }} />
            ))}
          </div>
        ) : siblingsRows.length > 0 ? (
          <div style={{ display: "grid", gap: 10 }}>
            {siblingsRows.map((row) => (
              <Card key={row.itemId} style={{ padding: 14, display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <SourceAvatar
                    source={{
                      kind: row.platform,
                      name: row.sourceName,
                      config: row.sourceConfig as Record<string, unknown> | null,
                    }}
                    size={32}
                  />
                  <div>
                    <div style={{ color: "var(--fg-0)", fontWeight: 600 }}>{row.sourceName}</div>
                    <div className="nm-muted" style={{ fontSize: 12 }}>
                      同一事件的其他报道来源
                    </div>
                  </div>
                </div>
                <div style={{ color: "var(--fg-0)", lineHeight: 1.5 }}>
                  {locale === "zh-CN" ? row.titleZh || row.title || "暂无标题" : row.title || row.titleZh || "暂无标题"}
                </div>
                {row.url ? (
                  <a href={row.url} target="_blank" rel="noreferrer" className="nm-link-inline">
                    打开原文
                  </a>
                ) : null}
              </Card>
            ))}
          </div>
        ) : (
          <div className="nm-muted">这个事件目前没有更多可展示的其他来源。</div>
        )}
      </Drawer>
    </div>
  );
}

export default function DashboardHomePage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardHomeInner />
    </Suspense>
  );
}

