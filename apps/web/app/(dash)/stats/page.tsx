"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/app/ui/button";
import { Skeleton } from "@/app/ui/skeleton";
import { Tabs } from "@/app/ui/tabs";

type Overview = {
  range: "7d" | "30d" | "90d" | "custom";
  filters: {
    compare: boolean;
    minSources: number;
    clusterSort: "hybrid" | "sources" | "items" | "recency" | "cohesion";
    from?: string;
    to?: string;
  };
  totals: {
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
  };
  delta: {
    items: number | null;
    activeSources: number | null;
    clusters: number | null;
  };
  topClusters: Array<{
    id: string;
    topic: string | null;
    itemCount: number;
    lastSeenAt: string;
    distinctSources: number;
    itemsWindow: number;
    recencyScore: number;
    cohesionScore: number;
    hybridScore: number;
  }>;
  trend: Array<{ day: string; items: number; activeSources: number; clusters: number; hotspotIndex: number }>;
  hotspot: {
    hotspotIndex: number;
    totalClustersWindow: number;
    crossSourceClustersWindow: number;
    crossSourceClusterRate: number;
    weights: { sources: number; items: number; recency: number; cohesion: number };
    diagnostics?: {
      twoSourceClustersWindow: number;
      twoSourceClusterRate: number;
      minSourceClustersWindow: number;
    };
  };
};

const RANGE_LABEL: Record<Overview["range"], string> = {
  "7d": "近 7 天",
  "30d": "近 30 天",
  "90d": "近 90 天",
  custom: "自定义范围",
};

function parseRange(raw: string | null): Overview["range"] {
  return raw === "30d" || raw === "90d" || raw === "custom" ? raw : "7d";
}

function formatShortDate(raw: string) {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(d);
}

function deltaText(value: number | null) {
  if (value == null) return "—";
  if (value === 0) return "持平";
  return value > 0 ? `+${value}` : `${value}`;
}

function StatsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const range = parseRange(searchParams.get("range"));
  const customStart = (searchParams.get("start") ?? "").trim();
  const customEnd = (searchParams.get("end") ?? "").trim();
  const compare = searchParams.get("compare") === "1";
  const minSources = Number.parseInt(searchParams.get("minSources") ?? "2", 10) || 2;
  const clusterSort =
    searchParams.get("clusterSort") === "sources" ||
    searchParams.get("clusterSort") === "items" ||
    searchParams.get("clusterSort") === "recency" ||
    searchParams.get("clusterSort") === "cohesion"
      ? (searchParams.get("clusterSort") as
          | "sources"
          | "items"
          | "recency"
          | "cohesion")
      : "hybrid";
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setFilters = (next: {
    range?: Overview["range"];
    compare?: boolean;
    minSources?: number;
    clusterSort?: "hybrid" | "sources" | "items" | "recency" | "cohesion";
    start?: string;
    end?: string;
  }) => {
    const p = new URLSearchParams(searchParams.toString());
    const nextRange = next.range ?? range;
    if (nextRange === "7d") p.delete("range");
    else p.set("range", nextRange);
    const nextStart = next.start !== undefined ? next.start.trim() : customStart;
    const nextEnd = next.end !== undefined ? next.end.trim() : customEnd;
    if (nextRange === "custom") {
      if (nextStart) p.set("start", nextStart);
      if (nextEnd) p.set("end", nextEnd);
    } else {
      p.delete("start");
      p.delete("end");
    }

    const nextCompare = nextRange === "custom" ? false : (next.compare ?? compare);
    if (nextCompare) p.set("compare", "1");
    else p.delete("compare");
    const nextMinSources = next.minSources ?? minSources;
    if (nextMinSources > 2) p.set("minSources", String(nextMinSources));
    else p.delete("minSources");
    const nextSort = next.clusterSort ?? clusterSort;
    if (nextSort === "hybrid") p.delete("clusterSort");
    else p.set("clusterSort", nextSort);

    const qs = p.toString();
    router.replace(qs ? `/stats?${qs}` : "/stats", { scroll: false });
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const p = new URLSearchParams();
    p.set("range", range);
    if (range === "custom") {
      if (customStart) p.set("start", customStart);
      if (customEnd) p.set("end", customEnd);
    } else if (compare) {
      p.set("compare", "1");
    }
    if (minSources > 2) p.set("minSources", String(minSources));
    if (clusterSort !== "hybrid") p.set("clusterSort", clusterSort);
    void (async () => {
      try {
        const r = await fetch(`/api/stats?${p.toString()}`, { cache: "no-store" });
        const text = await r.text();
        if (!r.ok) {
          try {
            const parsed = JSON.parse(text) as { error?: string };
            throw new Error(parsed.error || `请求失败（${r.status}）`);
          } catch {
            throw new Error(text || `请求失败（${r.status}）`);
          }
        }
        if (!text.trim()) {
          throw new Error("Stats API returned empty body");
        }
        const d = JSON.parse(text) as Overview;
        if (active) setData(d);
      } catch (err) {
        if (active) {
          setData(null);
          setError(err instanceof Error ? err.message : "统计数据加载失败");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [range, customStart, customEnd, compare, minSources, clusterSort]);

  function downloadCsv() {
    if (!data) return;
    const lines: string[] = [];
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    lines.push(["section", "key", "value"].join(","));
    lines.push(["totals", "total_items", String(data.totals.total_items)].join(","));
    lines.push(["totals", "items_24h", String(data.totals.items_24h)].join(","));
    lines.push(["totals", "total_sources", String(data.totals.total_sources)].join(","));
    lines.push(["totals", "active_sources", String(data.totals.active_sources)].join(","));
    lines.push(["totals", "total_clusters", String(data.totals.total_clusters)].join(","));
    lines.push(["window", "items_window", String(data.totals.items_window)].join(","));
    lines.push(["window", "active_sources_window", String(data.totals.active_sources_window)].join(","));
    lines.push(["window", "clusters_window", String(data.totals.clusters_window)].join(","));
    lines.push(["window", "delta_items", String(data.delta.items ?? 0)].join(","));
    lines.push(["window", "delta_active_sources", String(data.delta.activeSources ?? 0)].join(","));
    lines.push(["window", "delta_clusters", String(data.delta.clusters ?? 0)].join(","));
    for (const c of data.topClusters) {
      lines.push(
        ["topClusters", esc(c.id), esc(`${c.topic ?? ""}\t${c.itemCount}\t${c.lastSeenAt}`)].join(","),
      );
    }
    for (const t of data.trend) {
      lines.push(
        ["trend", esc(t.day), esc(`${t.items}\t${t.activeSources}\t${t.clusters}`)].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stats-overview-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const trendRows = useMemo(
    () =>
      (data?.trend ?? []).map((x) => ({
        ...x,
        dayLabel: formatShortDate(x.day),
      })),
    [data?.trend],
  );

  return (
    <div>
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <h1 className="nm-title">统计</h1>
        <span style={{ marginLeft: 12 }} className="nm-muted">
          {RANGE_LABEL[range]}数据分析
        </span>
        {!loading && data ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => downloadCsv()}
            style={{ marginLeft: "auto" }}
          >
            导出当前筛选 CSV
          </Button>
        ) : null}
      </header>
      <section style={{ marginBottom: 14, display: "grid", gap: 10 }}>
        <Tabs
          tabs={[
            { id: "7d", label: "近 7 天" },
            { id: "30d", label: "近 30 天" },
            { id: "90d", label: "近 90 天" },
            { id: "custom", label: "自定义" },
          ]}
          value={range}
          onChange={(id) => setFilters({ range: parseRange(id) })}
        />
        {range === "custom" ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setFilters({ start: e.target.value, range: "custom" })}
              style={dateInputStyle}
            />
            <span className="nm-muted">至</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setFilters({ end: e.target.value, range: "custom" })}
              style={dateInputStyle}
            />
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {range !== "custom" ? (
            <FilterChip
              active={compare}
              label={`对比上个${RANGE_LABEL[range]}窗口`}
              onClick={() => setFilters({ compare: !compare })}
            />
          ) : null}
          <FilterChip
            active={minSources === 2}
            label="最少2信源"
            onClick={() => setFilters({ minSources: 2 })}
          />
          <FilterChip
            active={minSources === 3}
            label="最少3信源"
            onClick={() => setFilters({ minSources: 3 })}
          />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="nm-muted" style={{ fontSize: 12, alignSelf: "center" }}>
            热门事件簇排序（仅影响下方榜单）
          </span>
          <FilterChip active={clusterSort === "hybrid"} label="综合分排序" onClick={() => setFilters({ clusterSort: "hybrid" })} />
          <FilterChip active={clusterSort === "sources"} label="按信源数" onClick={() => setFilters({ clusterSort: "sources" })} />
          <FilterChip active={clusterSort === "items"} label="按条目数" onClick={() => setFilters({ clusterSort: "items" })} />
          <FilterChip active={clusterSort === "recency"} label="按时效" onClick={() => setFilters({ clusterSort: "recency" })} />
          <FilterChip active={clusterSort === "cohesion"} label="按一致性" onClick={() => setFilters({ clusterSort: "cohesion" })} />
        </div>
      </section>

      {loading || !data ? (
        <div aria-busy="true" aria-label="加载中">
          {!loading && error ? (
            <section style={{ ...cardStyle, marginBottom: 16, borderColor: "#5b2a2a" }}>
              <div style={{ color: "#ffc9c9", fontSize: 13 }}>统计加载失败：{error}</div>
            </section>
          ) : null}
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
              gap: 12,
              marginBottom: 20,
            }}
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ ...cardStyle, minHeight: 86 }}>
                <Skeleton style={{ height: 12, width: 88, marginBottom: 10 }} />
                <Skeleton style={{ height: 30, width: 100 }} />
              </div>
            ))}
          </section>
          <section style={{ ...cardStyle, marginBottom: 16 }}>
            <Skeleton style={{ height: 16, width: 200, marginBottom: 12 }} />
            <div style={{ display: "grid", gap: 10 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={barRow}>
                  <Skeleton style={{ height: 14, width: 100 }} />
                  <div style={barTrack}>
                    <Skeleton style={{ height: 10, width: `${35 + (i % 3) * 18}%`, borderRadius: 999 }} />
                  </div>
                  <Skeleton style={{ height: 14, width: 36 }} />
                </div>
              ))}
            </div>
          </section>
          <section style={{ ...cardStyle, marginBottom: 16 }}>
            <Skeleton style={{ height: 16, width: 240, marginBottom: 12 }} />
            <div style={{ display: "grid", gap: 10 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={barRow}>
                  <Skeleton style={{ height: 14, width: 120 }} />
                  <div style={barTrack}>
                    <Skeleton style={{ height: 10, width: `${40 + (i % 4) * 12}%`, borderRadius: 999 }} />
                  </div>
                  <Skeleton style={{ height: 14, width: 32 }} />
                </div>
              ))}
            </div>
          </section>
          <section style={cardStyle}>
            <Skeleton style={{ height: 16, width: 180, marginBottom: 12 }} />
            <div style={{ display: "grid", gap: 10 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <Skeleton style={{ height: 14, flex: 1, maxWidth: 360 }} />
                  <Skeleton style={{ height: 14, width: 56 }} />
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <>
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
              gap: 12,
              marginBottom: 20,
            }}
          >
            <StatCard label="总条数" value={data.totals.total_items} />
            <StatCard label="近 24h 新增" value={data.totals.items_24h} accent="#3b82f6" />
            <StatCard label="信源总数" value={data.totals.total_sources} />
            <StatCard
              label="活跃信源（7d）"
              value={data.totals.active_sources}
              accent="#2ba245"
            />
            <StatCard label="事件簇" value={data.totals.total_clusters} />
            <StatCard
              label={`${RANGE_LABEL[range]}条目`}
              value={data.totals.items_window}
              note={compare ? `较上窗口 ${deltaText(data.delta.items)}` : undefined}
            />
            <StatCard
              label={`${RANGE_LABEL[range]}活跃信源`}
              value={data.totals.active_sources_window}
              note={compare ? `较上窗口 ${deltaText(data.delta.activeSources)}` : undefined}
            />
            <StatCard
              label={`${RANGE_LABEL[range]}活跃簇`}
              value={data.totals.clusters_window}
              note={compare ? `较上窗口 ${deltaText(data.delta.clusters)}` : undefined}
            />
            <StatCard
              label="热点指数（Top簇）"
              value={Number(data.hotspot.hotspotIndex.toFixed(2))}
              accent="#f59e0b"
            />
            <StatCard
              label="跨源簇占比"
              value={Number((data.hotspot.crossSourceClusterRate * 100).toFixed(1))}
              note={`${data.hotspot.crossSourceClustersWindow}/${data.hotspot.totalClustersWindow} 簇`}
              accent="#2ba245"
            />
          </section>

          <section style={{ ...cardStyle, marginBottom: 16 }}>
            <h2 style={sectionTitle}>热点趋势（指数 / 事件簇 / 条目）</h2>
            {trendRows.length === 0 ? (
              <div style={{ color: "#5b6478", fontSize: 13 }}>暂无数据</div>
            ) : (
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <LineChart data={trendRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="dayLabel" tick={{ fill: "var(--fg-2)", fontSize: 12 }} />
                    <YAxis tick={{ fill: "var(--fg-2)", fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ background: "var(--bg-1)", border: "1px solid var(--border)" }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="hotspotIndex"
                      name="热点指数"
                      stroke="#f59e0b"
                      strokeWidth={3}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="clusters"
                      name="事件簇"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line type="monotone" dataKey="items" name="条目" stroke="#4f8dff" strokeWidth={2} dot={false} />
                    <Line
                      type="monotone"
                      dataKey="activeSources"
                      name="活跃信源"
                      stroke="#2ba245"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section style={cardStyle}>
            <h2 style={sectionTitle}>热门事件簇（Hybrid Score）</h2>
            <div style={{ color: "var(--fg-2)", fontSize: 12, marginBottom: 8 }}>
              评分权重：信源 {data.hotspot.weights.sources.toFixed(2)} / 条目{" "}
              {data.hotspot.weights.items.toFixed(2)} / 时效 {data.hotspot.weights.recency.toFixed(2)} /
              一致性 {data.hotspot.weights.cohesion.toFixed(2)}
            </div>
            {data.hotspot.diagnostics ? (
              <div style={{ color: "var(--fg-2)", fontSize: 12, marginBottom: 8 }}>
                同源判定观测：2 源簇 {data.hotspot.diagnostics.twoSourceClustersWindow}（占比{" "}
                {(data.hotspot.diagnostics.twoSourceClusterRate * 100).toFixed(1)}%） · 满足当前最小信源阈值的簇{" "}
                {data.hotspot.diagnostics.minSourceClustersWindow}
              </div>
            ) : null}
            {data.topClusters.length === 0 ? (
              <div style={{ color: "#5b6478", fontSize: 13 }}>暂无跨源事件</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {data.topClusters.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: "flex",
                      gap: 12,
                      padding: "8px 0",
                      borderBottom: "1px solid #20283a",
                    }}
                  >
                    <div style={{ flex: 1, color: "#cdd2dc", fontSize: 13 }}>
                      {c.topic ?? "(未命名事件)"}
                    </div>
                    <div style={{ color: "#95b4ff", fontSize: 12 }}>
                      {c.itemCount} 条
                    </div>
                    <div style={{ color: "var(--fg-2)", fontSize: 12 }}>
                      {c.distinctSources} 信源 · 评分 {c.hybridScore.toFixed(3)}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          router.push("/");
                        }}
                      >
                        去时间轴
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          router.push("/categories");
                        }}
                      >
                        去分类页
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function StatsPage() {
  return (
    <Suspense fallback={<div style={{ padding: "8px 0" }}><Skeleton style={{ height: 120 }} /></div>}>
      <StatsPageInner />
    </Suspense>
  );
}

function StatCard({
  label,
  value,
  accent,
  note,
}: {
  label: string;
  value: number;
  accent?: string;
  note?: string;
}) {
  return (
    <div style={cardStyle}>
      <div style={{ color: "#73809b", fontSize: 12 }}>{label}</div>
      <div
        style={{
          color: accent ?? "#fff",
          fontSize: 28,
          fontWeight: 700,
          marginTop: 4,
        }}
      >
        {value}
      </div>
      {note ? (
        <div style={{ marginTop: 4, color: "var(--fg-2)", fontSize: 12 }}>{note}</div>
      ) : null}
    </div>
  );
}

function FilterChip(props: { active: boolean; label: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        border: "1px solid",
        borderColor: props.active ? "var(--fg-0)" : "var(--border)",
        background: props.active ? "var(--bg-0)" : "var(--bg-1)",
        color: props.active ? "var(--fg-0)" : "var(--fg-2)",
        borderRadius: 999,
        fontSize: 12,
        padding: "4px 10px",
        cursor: "pointer",
      }}
    >
      {props.label}
    </button>
  );
}

const cardStyle: CSSProperties = {
  background: "var(--bg-1)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: 14,
};

const sectionTitle: CSSProperties = {
  margin: "0 0 12px",
  fontSize: 14,
  color: "var(--fg-1)",
};

const barRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const barTrack: CSSProperties = {
  flex: 1,
  height: 10,
  background: "var(--bg-0)",
  borderRadius: 999,
  overflow: "hidden",
};

const dateInputStyle: CSSProperties = {
  background: "var(--bg-1)",
  color: "var(--fg-1)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "6px 8px",
};
