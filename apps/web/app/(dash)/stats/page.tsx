"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Skeleton } from "@/app/ui/skeleton";

type Overview = {
  totals: {
    total_items: number;
    items_24h: number;
    total_sources: number;
    active_sources: number;
    total_clusters: number;
  };
  byPlatform: Array<{ kind: string; count: number }>;
  topTags: Array<{ tag: string; count: number }>;
  topClusters: Array<{
    id: string;
    topic: string | null;
    itemCount: number;
    lastSeenAt: string;
  }>;
};

const PLATFORM_LABEL: Record<string, string> = {
  rss: "RSS",
  hn: "Hacker News",
  "x-rsshub": "X 博主",
  "wechat-wewe": "公众号",
};

export default function StatsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d: Overview) => {
        if (active) setData(d);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const maxPlatform = Math.max(1, ...(data?.byPlatform.map((p) => p.count) ?? [1]));
  const maxTag = Math.max(1, ...(data?.topTags.map((p) => p.count) ?? [1]));

  return (
    <div>
      <header style={{ display: "flex", alignItems: "baseline", marginBottom: 16 }}>
        <h1 className="nm-title">统计</h1>
        <span style={{ marginLeft: 12 }} className="nm-muted">
          近 7 天数据概览
        </span>
      </header>

      {loading || !data ? (
        <div aria-busy="true" aria-label="加载中">
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
          </section>

          <section style={{ ...cardStyle, marginBottom: 16 }}>
            <h2 style={sectionTitle}>按平台分布（近 7 天）</h2>
            {data.byPlatform.length === 0 ? (
              <div style={{ color: "#5b6478", fontSize: 13 }}>暂无数据</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {data.byPlatform.map((p) => (
                  <div key={p.kind} style={barRow}>
                    <div style={{ width: 110, color: "#cdd2dc", fontSize: 13 }}>
                      {PLATFORM_LABEL[p.kind] ?? p.kind}
                    </div>
                    <div style={barTrack}>
                      <div
                        style={{
                          ...barFill,
                          width: `${(p.count / maxPlatform) * 100}%`,
                        }}
                      />
                    </div>
                    <div style={{ width: 60, textAlign: "right", color: "#95b4ff" }}>
                      {p.count}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={{ ...cardStyle, marginBottom: 16 }}>
            <h2 style={sectionTitle}>热门标签 Top 10（近 7 天）</h2>
            {data.topTags.length === 0 ? (
              <div style={{ color: "#5b6478", fontSize: 13 }}>暂无数据</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {data.topTags.map((t) => (
                  <div key={t.tag} style={barRow}>
                    <div style={{ width: 140, color: "#cdd2dc", fontSize: 13 }}>
                      {t.tag}
                    </div>
                    <div style={barTrack}>
                      <div
                        style={{
                          ...barFill,
                          width: `${(t.count / maxTag) * 100}%`,
                          background: "#6366f1",
                        }}
                      />
                    </div>
                    <div style={{ width: 60, textAlign: "right", color: "#95b4ff" }}>
                      {t.count}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={cardStyle}>
            <h2 style={sectionTitle}>热门事件簇（近 7 天）</h2>
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

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
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
    </div>
  );
}

const cardStyle: CSSProperties = {
  background: "#0f1522",
  border: "1px solid #252c3d",
  borderRadius: 10,
  padding: 14,
};

const sectionTitle: CSSProperties = {
  margin: "0 0 12px",
  fontSize: 14,
  color: "#cdd2dc",
};

const barRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const barTrack: CSSProperties = {
  flex: 1,
  height: 10,
  background: "#1a2233",
  borderRadius: 999,
  overflow: "hidden",
};

const barFill: CSSProperties = {
  height: "100%",
  background: "#3b82f6",
};
