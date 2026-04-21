"use client";

import { logTimelineClient } from "@news/shared";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Card } from "@/app/ui/card";
import { Drawer } from "@/app/ui/drawer";
import { Select } from "@/app/ui/select";
import { SourceAvatar } from "@/app/ui/source-avatar";
import { Skeleton } from "@/app/ui/skeleton";
import { Tabs } from "@/app/ui/tabs";

type FeedMode = "curated" | "all";
type SortMode = "published" | "fetched";

/** URL ?range= — server filters on COALESCE(published_at, fetched_at). */
type TimelineRange = "all" | "24h" | "72h" | "7d" | "30d";

function parseTimelineRange(raw: string | null): TimelineRange {
  if (raw === "24h" || raw === "72h" || raw === "7d" || raw === "30d") return raw;
  return "all";
}

function itemsApiQuery(feed: FeedMode, range: TimelineRange, q: string, sort: SortMode) {
  const p = new URLSearchParams();
  p.set("feed", feed);
  p.set("limit", "50");
  if (range !== "all") p.set("range", range);
  if (q.trim()) p.set("q", q.trim());
  if (sort !== "published") p.set("sort", sort);
  return p.toString();
}

function rangeToSinceMs(range: TimelineRange): number | null {
  if (range === "all") return null;
  const ms = Date.now();
  const h = (n: number) => ms - n * 3600 * 1000;
  switch (range) {
    case "24h":
      return h(24);
    case "72h":
      return h(72);
    case "7d":
      return ms - 7 * 24 * 3600 * 1000;
    case "30d":
      return ms - 30 * 24 * 3600 * 1000;
    default:
      return null;
  }
}

function itemPassesRange(
  item: { publishedAt?: string | null; fetchedAt?: string },
  sinceMs: number | null,
): boolean {
  if (sinceMs == null) return true;
  const raw = item.publishedAt ?? item.fetchedAt;
  const t = new Date(raw ?? 0).getTime();
  return !Number.isNaN(t) && t >= sinceMs;
}

function itemPassesQuery(
  item: Partial<TimelineItem> & { sourceName?: string | null; author?: string | null },
  q: string,
): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    item.titleZh,
    item.title,
    item.contentZh,
    item.contentText,
    item.sourceName,
    item.author,
    ...(Array.isArray(item.tags) ? item.tags : []),
  ]
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .join("\n")
    .toLowerCase();
  return haystack.includes(needle);
}

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

function dedupeSiblingsBySource(rows: ClusterSiblingRow[]): ClusterSiblingRow[] {
  const seen = new Set<string>();
  const out: ClusterSiblingRow[] = [];
  for (const r of rows) {
    if (seen.has(r.sourceId)) continue;
    seen.add(r.sourceId);
    out.push(r);
  }
  return out;
}

type TimelineItem = {
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
  categoryDomain?: string[] | null;
  categoryTopic?: string[] | null;
  categoryEntity?: string[] | null;
  clusterId: string | null;
  clusterTopic: string | null;
  relatedCount: number | null;
  publishedAt: string | null;
  fetchedAt: string;
  favoritedAt?: string | null;
};

type KeywordRule = {
  id: string;
  pattern: string;
  isRegex: boolean;
  notify: boolean;
};

/** 左侧时间块：日期 + 时:分；跨年则带年份。 */
function formatPublishedBlock(raw: string | null | undefined) {
  if (!raw) return { label: "发布", date: "—", time: "" };
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return { label: "发布", date: "—", time: "" };
  const nowY = new Date().getFullYear();
  const date =
    d.getFullYear() === nowY
      ? new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(d)
      : new Intl.DateTimeFormat("zh-CN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(d);
  return {
    label: "发布",
    date,
    time: new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d),
  };
}

function DashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  /** 默认「全部动态」以便 SSE `item.created` 立刻插入列表；「精选」需 URL `?feed=curated`。 */
  const feed: FeedMode =
    searchParams.get("feed") === "curated" ? "curated" : "all";
  const range: TimelineRange = parseTimelineRange(searchParams.get("range"));
  const q = (searchParams.get("q") ?? "").trim();
  const sort: SortMode = searchParams.get("sort") === "fetched" ? "fetched" : "published";

  const setFeed = useCallback(
    (next: FeedMode) => {
      const p = new URLSearchParams(searchParams.toString());
      if (next === "curated") {
        p.set("feed", "curated");
      } else {
        p.delete("feed");
      }
      const qs = p.toString();
      router.replace(qs ? `/?${qs}` : "/", { scroll: false });
    },
    [router, searchParams],
  );

  const setRange = useCallback(
    (next: TimelineRange) => {
      const p = new URLSearchParams(searchParams.toString());
      if (next === "all") p.delete("range");
      else p.set("range", next);
      const qs = p.toString();
      router.replace(qs ? `/?${qs}` : "/", { scroll: false });
    },
    [router, searchParams],
  );
  const setSort = useCallback(
    (next: SortMode) => {
      const p = new URLSearchParams(searchParams.toString());
      if (next === "published") p.delete("sort");
      else p.set("sort", "fetched");
      const qs = p.toString();
      router.replace(qs ? `/?${qs}` : "/", { scroll: false });
    },
    [router, searchParams],
  );

  const setQuery = useCallback(
    (next: string) => {
      const p = new URLSearchParams(searchParams.toString());
      const normalized = next.trim();
      if (normalized) p.set("q", normalized);
      else p.delete("q");
      const qs = p.toString();
      router.replace(qs ? `/?${qs}` : "/", { scroll: false });
    },
    [router, searchParams],
  );

  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keywords, setKeywords] = useState<KeywordRule[]>([]);
  const [siblingsOpen, setSiblingsOpen] = useState(false);
  const [siblingsCtx, setSiblingsCtx] = useState<{
    clusterId: string;
    excludeItemId: string;
    excludeSourceId: string;
    topic: string | null;
  } | null>(null);
  const [siblingsRows, setSiblingsRows] = useState<ClusterSiblingRow[]>([]);
  const [siblingsLoading, setSiblingsLoading] = useState(false);
  const [siblingsErr, setSiblingsErr] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState(q);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const keywordsRef = useRef(keywords);
  keywordsRef.current = keywords;

  const feedRef = useRef(feed);
  feedRef.current = feed;
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const rangeSinceMsRef = useRef<number | null>(rangeToSinceMs(range));
  rangeSinceMsRef.current = rangeToSinceMs(range);
  const queryRef = useRef(q);
  queryRef.current = q;
  const sortRef = useRef<SortMode>(sort);
  sortRef.current = sort;

  useEffect(() => {
    setQueryInput(q);
  }, [q]);

  const curatedReloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleCuratedReload = useCallback(() => {
    if (curatedReloadTimer.current) clearTimeout(curatedReloadTimer.current);
    curatedReloadTimer.current = setTimeout(() => {
      curatedReloadTimer.current = null;
      const qs = itemsApiQuery("curated", rangeRef.current, queryRef.current, sortRef.current);
      void fetch(`/api/items?${qs}`)
        .then((r) => r.json())
        .then((data: TimelineItem[]) => {
          if (feedRef.current !== "curated") return;
          setItems(data);
        })
        .catch(() => {});
    }, 450);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const qs = itemsApiQuery(feed, range, q, sort);
    void fetch(`/api/items?${qs}`)
      .then((r) => r.json())
      .then((data: TimelineItem[]) => {
        if (active) setItems(data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [feed, range, q, sort]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/keywords")
      .then((r) => r.json())
      .then((rules: KeywordRule[]) => {
        if (active) setKeywords(rules.filter((x) => x.notify));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!siblingsOpen || !siblingsCtx) return;
    let cancelled = false;
    setSiblingsLoading(true);
    setSiblingsErr(null);
    const q = new URLSearchParams();
    q.set("exclude", siblingsCtx.excludeItemId);
    q.set("excludeSource", siblingsCtx.excludeSourceId);
    q.set("limit", "40");
    void fetch(`/api/clusters/${siblingsCtx.clusterId}/siblings?${q}`)
      .then(async (r) => {
        if (!r.ok) {
          const t = await r.text();
          throw new Error(t || `HTTP ${r.status}`);
        }
        return r.json() as Promise<ClusterSiblingRow[]>;
      })
      .then((list) => {
        if (!cancelled) setSiblingsRows(Array.isArray(list) ? list : []);
      })
      .catch((e: unknown) => {
        if (!cancelled) setSiblingsErr(e instanceof Error ? e.message : "加载失败");
      })
      .finally(() => {
        if (!cancelled) setSiblingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [siblingsOpen, siblingsCtx]);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        void Notification.requestPermission();
      }
    }

    const es = new EventSource("/api/stream");
    es.addEventListener("item.created", (event) => {
      const parsed = JSON.parse((event as MessageEvent).data) as {
        item?: Partial<TimelineItem> & { id: string };
      };
      const payload = parsed.item;
      if (!payload?.id) {
        logTimelineClient("ui", "item.created ignored (no item.id in payload)", {});
        return;
      }
      logTimelineClient("ui", "item.created received", {
        itemId: payload.id,
        feed: feedRef.current,
        range: rangeRef.current,
      });
      if (feedRef.current === "all") {
        const since = rangeSinceMsRef.current;
        const row = {
          id: payload.id,
          sourceId: payload.sourceId ?? "",
          sourceName: payload.sourceName ?? "unknown",
          platform: payload.platform ?? "unknown",
          sourceConfig: payload.sourceConfig ?? null,
          title: payload.title ?? "(无标题)",
          url: payload.url ?? null,
          author: payload.author ?? null,
          contentText: null,
          titleZh: null,
          contentZh: null,
          tags: null,
          clusterId: null,
          clusterTopic: null,
          relatedCount: null,
          publishedAt: payload.publishedAt ?? null,
          fetchedAt: new Date().toISOString(),
        };
        if (!itemPassesRange(row, since)) {
          logTimelineClient("ui", "item.created not prepended (outside time range filter)", {
            itemId: payload.id,
            range: rangeRef.current,
            publishedAt: row.publishedAt,
            fetchedAt: row.fetchedAt,
          });
          return;
        }
        if (!itemPassesQuery(row, queryRef.current)) {
          logTimelineClient("ui", "item.created not prepended (search query mismatch)", {
            itemId: payload.id,
            q: queryRef.current,
          });
          return;
        }
        setItems((prev) => {
          if (prev.some((x) => x.id === payload.id)) {
            logTimelineClient("ui", "item.created skipped (id already in list)", { itemId: payload.id });
            return prev;
          }
          logTimelineClient("ui", "item.created prepended to timeline", { itemId: payload.id });
          return [row, ...prev].slice(0, 100);
        });
      } else {
        logTimelineClient("ui", "item.created → curated mode (debounced refetch only, not prepended)", {
          itemId: payload.id,
        });
        scheduleCuratedReload();
      }
      notifyIfKeywordMatched(payload, keywordsRef.current);
    });
    es.addEventListener("item.enriched", (event) => {
      const parsed = JSON.parse((event as MessageEvent).data) as {
        item?: {
          id: string;
          titleZh?: string;
          contentZh?: string;
          tags?: string[];
          clusterId?: string;
        };
      };
      const payload = parsed.item;
      if (!payload?.id) return;
      if (feedRef.current === "all") {
        setItems((prev) =>
          prev.map((item) =>
            item.id === payload.id
              ? {
                  ...item,
                  titleZh: payload.titleZh ?? item.titleZh,
                  contentZh: payload.contentZh ?? item.contentZh,
                  tags: payload.tags ?? item.tags,
                  clusterId: payload.clusterId ?? item.clusterId,
                }
              : item,
          ),
        );
      } else {
        scheduleCuratedReload();
      }
      notifyIfKeywordMatched(payload, keywordsRef.current);
    });

    es.addEventListener("cluster.updated", (event) => {
      const parsed = JSON.parse((event as MessageEvent).data) as {
        cluster?: { id: string; itemCount?: number };
      };
      const c = parsed.cluster;
      if (!c?.id) return;
      if (feedRef.current === "all") {
        setItems((prev) =>
          prev.map((item) =>
            item.clusterId === c.id
              ? { ...item, relatedCount: c.itemCount ?? item.relatedCount }
              : item,
          ),
        );
      } else {
        scheduleCuratedReload();
      }
    });

    return () => {
      es.close();
      if (curatedReloadTimer.current) clearTimeout(curatedReloadTimer.current);
    };
  }, [scheduleCuratedReload]);

  const subtitle = useMemo(() => {
    const RANGE_HINT: Record<TimelineRange, string> = {
      all: "",
      "24h": " · 24 小时内",
      "72h": " · 72 小时内",
      "7d": " · 7 天内",
      "30d": " · 30 天内",
    };
    const rangeHint = RANGE_HINT[range];
    if (loading) return "正在加载...";
    if (items.length === 0) {
      if (q) {
        return `未找到与“${q}”相关的结果`;
      }
      if (feed === "curated") {
        return "暂无多源聚类，可切到「全部动态」或等待聚类";
      }
      return range === "all"
        ? "暂无数据，去信源页添加订阅"
        : "该时间范围内暂无条目，可改为「全部时间」试试";
    }
    if (feed === "curated") {
      return `共 ${items.length} 个热点话题${rangeHint}`;
    }
    return `共 ${items.length} 条${rangeHint}${q ? ` · 搜索：${q}` : ""}`;
  }, [items.length, loading, feed, range, q]);

  const emptyHint =
    q
      ? `无匹配结果（关键词：${q}）`
      : feed === "curated"
      ? "暂无多源聚类热点。全部动态展示所有抓取；聚类需后台 enrichment 完成。"
      : "暂无内容";

  const dedupedSiblings = useMemo(
    () => dedupeSiblingsBySource(siblingsRows),
    [siblingsRows],
  );

  return (
    <div>
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          marginBottom: 12,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <h1 className="nm-title">时间轴</h1>
        <span className="nm-muted">{subtitle}</span>
      </header>

      <Tabs
        tabs={[
          { id: "all", label: "全部动态" },
          { id: "curated", label: "精选" },
        ]}
        value={feed}
        onChange={(id) => setFeed(id as FeedMode)}
      />

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 10,
          marginTop: 12,
        }}
      >
        <span className="nm-muted" style={{ fontSize: 13 }}>
          时间范围
        </span>
        <Select
          aria-label="时间范围"
          value={range}
          onChange={(e) => setRange(parseTimelineRange(e.target.value))}
          style={{ minWidth: 148 }}
        >
          <option value="all">全部时间</option>
          <option value="24h">24 小时内</option>
          <option value="72h">72 小时内</option>
          <option value="7d">7 天内</option>
          <option value="30d">30 天内</option>
        </Select>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
          <input
            ref={searchInputRef}
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setQuery(queryInput);
              if (e.key === "Escape") {
                setQueryInput("");
                setQuery("");
              }
            }}
            placeholder="搜索标题/内容（回车）"
            aria-label="搜索关键词"
            style={{
              minWidth: 230,
              height: 34,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg-0)",
              color: "var(--fg-0)",
              padding: "0 10px",
              fontSize: 13,
            }}
          />
          <button type="button" onClick={() => setQuery(queryInput)} style={miniBtn}>
            搜索
          </button>
          <button
            type="button"
            onClick={() => {
              setQueryInput("");
              setQuery("");
            }}
            style={miniBtn}
          >
            清空
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="nm-muted" style={{ fontSize: 12 }}>
            排序
          </span>
          <Select
            aria-label="排序方式"
            value={sort}
            onChange={(e) => setSort(e.target.value === "fetched" ? "fetched" : "published")}
            style={{ minWidth: 148 }}
          >
            <option value="published">发布时间优先</option>
            <option value="fetched">抓取时间优先</option>
          </Select>
        </div>
      </div>

      <div style={{ height: 16 }} />

      <div style={{ display: "grid", gap: 12 }}>
        {loading ? (
          <>
            <Skeleton style={{ height: 100 }} />
            <Skeleton style={{ height: 100 }} />
            <Skeleton style={{ height: 100 }} />
          </>
        ) : items.length === 0 ? (
          <div className="nm-empty-state">
            {emptyHint}
          </div>
        ) : (
          items.map((item, i) => {
            const when = formatPublishedBlock(item.publishedAt ?? item.fetchedAt);
            return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.4), duration: 0.2 }}
            >
              <Card>
                <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
                  <aside
                    style={{
                      width: 80,
                      flexShrink: 0,
                      paddingRight: 14,
                      marginRight: 4,
                      borderRight: "1px solid var(--border)",
                      textAlign: "right",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-start",
                      gap: 2,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.06em",
                        color: "var(--fg-3)",
                        textTransform: "uppercase",
                      }}
                    >
                      {when.label}
                    </span>
                    <span
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                        color: "var(--fg-0)",
                        lineHeight: 1.15,
                      }}
                    >
                      {when.date}
                    </span>
                    {when.time ? (
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          fontVariantNumeric: "tabular-nums",
                          color: "var(--fg-1)",
                          lineHeight: 1.1,
                        }}
                      >
                        {when.time}
                      </span>
                    ) : null}
                  </aside>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 12,
                      }}
                    >
                      <div style={{ display: "flex", gap: 10, flex: 1, minWidth: 0 }}>
                        <SourceAvatar
                          source={{
                            kind: item.platform,
                            name: item.sourceName,
                            config: item.sourceConfig ?? undefined,
                          }}
                          size={40}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: "var(--fg-2)", fontSize: 12 }}>
                            [{item.platform}] {item.sourceName}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void toggleFavorite(item.id, !!item.favoritedAt, setItems)
                        }
                        title={item.favoritedAt ? "取消收藏" : "收藏"}
                        style={{
                          background: "transparent",
                          border: 0,
                          fontSize: 20,
                          cursor: "pointer",
                          color: item.favoritedAt ? "#ff6b9d" : "var(--fg-3)",
                          padding: "0 6px",
                        }}
                      >
                        {item.favoritedAt ? "♥" : "♡"}
                      </button>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, marginTop: 8 }}>
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noreferrer">
                          {item.titleZh ?? item.title ?? "(无标题)"}
                        </a>
                      ) : (
                        item.titleZh ?? item.title ?? "(无标题)"
                      )}
                    </div>
                    {(item.contentZh ?? item.contentText) && (
                      <p style={{ margin: "8px 0 0", color: "var(--fg-1)" }}>
                        {(item.contentZh ?? item.contentText ?? "").slice(0, 220)}
                      </p>
                    )}
                    {item.tags && item.tags.length > 0 && (
                      <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {item.tags.map((tag) => (
                          <span key={`${item.id}-${tag}`} style={tagStyle}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {typeof item.relatedCount === "number" &&
                      item.relatedCount > 1 &&
                      item.clusterId && (
                        <div
                          style={{
                            marginTop: 8,
                            color: "var(--fg-2)",
                            fontSize: 12,
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "center",
                            gap: "6px 10px",
                          }}
                        >
                          <span>
                            {item.clusterTopic ? `#${item.clusterTopic} · ` : ""}
                            另有 {Math.max(0, (item.relatedCount ?? 1) - 1)} 个不同来源也报道了此事件
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSiblingsCtx({
                                clusterId: item.clusterId!,
                                excludeItemId: item.id,
                                excludeSourceId: item.sourceId,
                                topic: item.clusterTopic ?? null,
                              });
                              setSiblingsOpen(true);
                            }}
                            style={{
                              background: "none",
                              border: 0,
                              padding: 0,
                              cursor: "pointer",
                              color: "var(--fg-0)",
                              textDecoration: "underline",
                              fontSize: 12,
                            }}
                          >
                            查看其它来源
                          </button>
                        </div>
                      )}
                  </div>
                </div>
              </Card>
            </motion.div>
            );
          })
        )}
      </div>

      <Drawer
        open={siblingsOpen}
        onClose={() => {
          setSiblingsOpen(false);
        }}
        title={siblingsCtx?.topic ? `其它来源 · #${siblingsCtx.topic}` : "其它来源报道"}
      >
        {siblingsLoading ? (
          <div style={{ display: "grid", gap: 10 }}>
            <Skeleton style={{ height: 56 }} />
            <Skeleton style={{ height: 56 }} />
            <Skeleton style={{ height: 56 }} />
          </div>
        ) : siblingsErr ? (
          <p className="nm-muted" style={{ fontSize: 13 }}>
            {siblingsErr}
          </p>
        ) : dedupedSiblings.length === 0 ? (
          <p className="nm-muted" style={{ fontSize: 13 }}>
            暂无其它条目（或仍在聚类中）
          </p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {dedupedSiblings.map((row) => (
              <div
                key={row.itemId}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  paddingBottom: 12,
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <SourceAvatar
                  source={{
                    kind: row.platform,
                    name: row.sourceName,
                    config: row.sourceConfig as Record<string, unknown> | undefined,
                  }}
                  size={36}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "var(--fg-2)", fontSize: 11 }}>
                    [{row.platform}] {row.sourceName}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 14, fontWeight: 600 }}>
                    {row.url ? (
                      <a href={row.url} target="_blank" rel="noreferrer">
                        {row.titleZh ?? row.title ?? "(无标题)"}
                      </a>
                    ) : (
                      row.titleZh ?? row.title ?? "(无标题)"
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div>
          <h1 className="nm-title">时间轴</h1>
          <Skeleton style={{ height: 100, marginTop: 16 }} />
        </div>
      }
    >
      <DashboardInner />
    </Suspense>
  );
}

async function toggleFavorite(
  id: string,
  currentlyFav: boolean,
  setItems: React.Dispatch<React.SetStateAction<TimelineItem[]>>,
) {
  await fetch(`/api/items/${id}/favorite`, {
    method: currentlyFav ? "DELETE" : "POST",
  });
  setItems((prev) =>
    prev.map((x) =>
      x.id === id ? { ...x, favoritedAt: currentlyFav ? null : new Date().toISOString() } : x,
    ),
  );
}

function notifyIfKeywordMatched(
  payload: Partial<TimelineItem> | undefined,
  keywords: KeywordRule[],
) {
  if (!payload || keywords.length === 0) return;
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const haystack = [
    payload.title ?? "",
    payload.titleZh ?? "",
    payload.contentText ?? "",
    payload.contentZh ?? "",
  ]
    .join("\n")
    .toLowerCase();

  for (const rule of keywords) {
    const p = rule.pattern;
    if (!p) continue;
    try {
      const matched = rule.isRegex
        ? new RegExp(p, "i").test(haystack)
        : haystack.includes(p.toLowerCase());
      if (matched) {
        new Notification(`关键词命中: ${p}`, {
          body: payload.titleZh ?? payload.title ?? "有一条新动态命中关键词",
        });
        return;
      }
    } catch {
      // invalid regex: ignore
    }
  }
}

const tagStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--fg-0)",
  border: "1px solid var(--border-strong)",
  borderRadius: 999,
  padding: "2px 8px",
};

const miniBtn: CSSProperties = {
  height: 34,
  borderRadius: 8,
  border: "1px solid var(--border-strong)",
  background: "var(--bg-1)",
  color: "var(--fg-1)",
  padding: "0 10px",
  fontSize: 12,
  cursor: "pointer",
};
