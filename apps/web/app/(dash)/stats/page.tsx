"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/app/ui/button";
import { Card } from "@/app/ui/card";
import { Select } from "@/app/ui/select";
import { Skeleton } from "@/app/ui/skeleton";
import { TrendChart } from "./trend-chart";

type StatsRange = "24h" | "72h" | "7d" | "30d" | "90d";
type Audience = "public" | "personal";

type TrendPoint = {
  day: string;
  items: number;
  activeSources: number;
  clusters: number;
  hotspotIndex: number;
};

type KeywordGroup = {
  keyword: string;
  displayTitle?: string;
  summary?: string;
  mentions?: number;
  distinctSources?: number;
  eventCount?: number;
  attentionScore?: number;
};

type ClusterRow = {
  id: string;
  topic: string | null;
  displayTitle?: string;
  distinctSources?: number;
  itemsWindow?: number;
  consensusScore?: number;
  sourceNames?: string;
};

type Overview = {
  range: StatsRange;
  totals: {
    total_items: number;
    items_window: number;
    active_sources_window: number;
    clusters_window: number;
  };
  byPlatform: Array<{ kind: string; count: number }>;
  keywordGroups: KeywordGroup[];
  consensusClusters: ClusterRow[];
  trend: TrendPoint[];
  hotspot: {
    attentionIndex?: number;
    consensusHotspotIndex?: number;
    breakingHotspotIndex?: number;
    crossSourceClusterRate?: number;
  };
};

const RANGE_OPTIONS: Array<{ value: StatsRange; label: string }> = [
  { value: "24h", label: "24H" },
  { value: "72h", label: "72H" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
];

function numberText(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "0";
  return value.toLocaleString("zh-CN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function percentText(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "0%";
  return `${Math.round(value * 100)}%`;
}

function trendData(rows: TrendPoint[]) {
  return rows.map((row) => {
    const date = new Date(row.day);
    const dayLabel = Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date)
      : row.day;
    return { ...row, dayLabel };
  });
}

export default function StatsPage() {
  const [range, setRange] = useState<StatsRange>("7d");
  const [audience, setAudience] = useState<Audience>("public");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [agentReport, setAgentReport] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        range,
        audience,
        compare: "1",
        topN: "12",
        minSources: "1",
      });
      const [statsResponse, agentResponse] = await Promise.all([
        fetch(`/api/stats?${params.toString()}`, { cache: "no-store" }),
        fetch(`/api/agent/stats-report?${params.toString()}`, { cache: "no-store" }),
      ]);
      const statsJson = (await statsResponse.json()) as Overview | { error?: string };
      const agentJson = await agentResponse.json();
      if (!statsResponse.ok) {
        throw new Error("error" in statsJson ? statsJson.error || "统计加载失败" : "统计加载失败");
      }
      setOverview(statsJson as Overview);
      setAgentReport(agentJson);
    } catch (loadError) {
      setOverview(null);
      setAgentReport(null);
      setError(loadError instanceof Error ? loadError.message : "统计加载失败");
    } finally {
      setLoading(false);
    }
  }, [audience, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo(() => {
    const totals = overview?.totals;
    const hotspot = overview?.hotspot;
    return [
      { label: "窗口条目", value: numberText(totals?.items_window) },
      { label: "活跃信源", value: numberText(totals?.active_sources_window) },
      { label: "事件簇", value: numberText(totals?.clusters_window) },
      { label: "关注指数", value: numberText(hotspot?.attentionIndex, 2) },
      { label: "共识指数", value: numberText(hotspot?.consensusHotspotIndex, 2) },
      { label: "突发指数", value: numberText(hotspot?.breakingHotspotIndex, 2) },
      { label: "跨源事件率", value: percentText(hotspot?.crossSourceClusterRate) },
    ];
  }, [overview]);

  const agentOk =
    !!agentReport &&
    typeof agentReport === "object" &&
    "ok" in agentReport &&
    (agentReport as { ok?: unknown }).ok === true;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section
        style={{
          display: "grid",
          gap: 14,
          padding: 18,
          border: "1px solid var(--border)",
          borderRadius: 12,
          background: "var(--bg-1)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <h1 style={{ margin: 0, color: "var(--fg-0)", fontSize: 28 }}>统计</h1>
            <div className="nm-muted">热点、关键词、平台与 Agent 统计接口的同源视图。</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Select value={range} onChange={(event) => setRange(event.target.value as StatsRange)}>
              {RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select value={audience} onChange={(event) => setAudience(event.target.value as Audience)}>
              <option value="public">公共信源</option>
              <option value="personal">个人信源</option>
            </Select>
            <Button onClick={() => void load()} disabled={loading}>
              {loading ? "刷新中..." : "刷新"}
            </Button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
          {metrics.map((metric) => (
            <div
              key={metric.label}
              style={{
                padding: "12px 14px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <div className="nm-muted" style={{ fontSize: 12 }}>
                {metric.label}
              </div>
              <div style={{ color: "var(--fg-0)", fontSize: 24, fontWeight: 750 }}>{metric.value}</div>
            </div>
          ))}
        </div>
      </section>

      {error ? (
        <Card style={{ padding: 16, borderColor: "var(--border-strong)" }}>
          <div style={{ color: "var(--fg-0)", fontWeight: 650 }}>加载失败</div>
          <div className="nm-muted" style={{ marginTop: 6 }}>
            {error}
          </div>
        </Card>
      ) : null}

      {loading || !overview ? (
        <div style={{ display: "grid", gap: 12 }}>
          <Skeleton style={{ height: 320, borderRadius: 10 }} />
          <Skeleton style={{ height: 220, borderRadius: 10 }} />
        </div>
      ) : (
        <>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 14 }}>
            <Card style={{ padding: 16, display: "grid", gap: 12 }}>
              <div style={{ color: "var(--fg-0)", fontWeight: 700, fontSize: 18 }}>趋势</div>
              <TrendChart data={trendData(overview.trend ?? [])} />
            </Card>
            <Card style={{ padding: 16, display: "grid", gap: 12 }}>
              <div style={{ color: "var(--fg-0)", fontWeight: 700, fontSize: 18 }}>Agent 接口</div>
              <div
                style={{
                  display: "inline-flex",
                  width: "fit-content",
                  padding: "4px 8px",
                  borderRadius: 999,
                  border: "1px solid var(--border)",
                  color: agentOk ? "var(--ok)" : "var(--fg-2)",
                }}
              >
                /api/agent/stats-report {agentOk ? "OK" : "未就绪"}
              </div>
              <div className="nm-muted" style={{ lineHeight: 1.6 }}>
                统计页会并行调用标准统计接口与 Agent 统计接口，用于发现口径漂移、权限错误或 envelope 异常。
              </div>
              <pre
                style={{
                  margin: 0,
                  maxHeight: 180,
                  overflow: "auto",
                  fontSize: 12,
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 10,
                  color: "var(--fg-1)",
                  background: "var(--bg-0)",
                }}
              >
                {JSON.stringify(agentReport, null, 2)}
              </pre>
            </Card>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
            <Card style={{ padding: 16, display: "grid", gap: 12 }}>
              <div style={{ color: "var(--fg-0)", fontWeight: 700, fontSize: 18 }}>高频关键词</div>
              {(overview.keywordGroups ?? []).slice(0, 8).map((keyword) => (
                <div key={keyword.keyword} style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ color: "var(--fg-0)", fontWeight: 650 }}>{keyword.displayTitle ?? keyword.keyword}</div>
                    <div className="nm-muted">{numberText(keyword.attentionScore, 2)}</div>
                  </div>
                  <div className="nm-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                    {keyword.mentions ?? 0} 次提及 · {keyword.distinctSources ?? 0} 个来源 · {keyword.eventCount ?? 0} 个事件
                  </div>
                  {keyword.summary ? (
                    <div className="nm-muted" style={{ fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>
                      {keyword.summary}
                    </div>
                  ) : null}
                </div>
              ))}
            </Card>

            <Card style={{ padding: 16, display: "grid", gap: 12 }}>
              <div style={{ color: "var(--fg-0)", fontWeight: 700, fontSize: 18 }}>共识事件</div>
              {(overview.consensusClusters ?? []).slice(0, 8).map((cluster) => (
                <div key={cluster.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  <div style={{ color: "var(--fg-0)", fontWeight: 650 }}>
                    {cluster.displayTitle || cluster.topic || cluster.id.slice(0, 8)}
                  </div>
                  <div className="nm-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                    {cluster.distinctSources ?? 0} 个来源 · {cluster.itemsWindow ?? 0} 条 · 共识分{" "}
                    {numberText(cluster.consensusScore, 2)}
                  </div>
                  <div className="nm-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                    {cluster.sourceNames || "来源列表不可用"}
                  </div>
                </div>
              ))}
            </Card>

            <Card style={{ padding: 16, display: "grid", gap: 12 }}>
              <div style={{ color: "var(--fg-0)", fontWeight: 700, fontSize: 18 }}>平台分布</div>
              {(overview.byPlatform ?? []).map((row) => (
                <div key={row.kind} style={{ display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--fg-0)" }}>{row.kind}</span>
                    <span className="nm-muted">{row.count}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: "var(--bg-0)", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(100, (row.count / Math.max(1, overview.totals.items_window)) * 100)}%`,
                        background: "var(--fg-1)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
