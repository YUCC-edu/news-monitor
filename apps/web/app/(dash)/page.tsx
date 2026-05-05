"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/app/ui/button";
import { Drawer } from "@/app/ui/drawer";
import { Skeleton } from "@/app/ui/skeleton";
import {
  mapRepresentativeSources,
  selectEditorialRadar,
  type EditorialRadar,
  type EditorialRepresentativeSource,
  type TimelineRange,
} from "@/lib/editorial-radar";

type Overview = Parameters<typeof selectEditorialRadar>[0];
type RepresentativeSourceRows = Parameters<typeof mapRepresentativeSources>[0];
type RadarWithDetail = EditorialRadar & { judgmentDetail?: string };

const RANGE_TABS = [
  { id: "24h", label: "24H" },
  { id: "72h", label: "72H" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
] as const;

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

function signalTitle(signal: NonNullable<EditorialRadar["leadSignal"]>) {
  return signal.displayTitle?.trim() || signal.topic?.trim() || "未命名信号";
}

function signalSearchUrl(signal: NonNullable<EditorialRadar["leadSignal"]>) {
  return `/search?q=${encodeURIComponent(signalTitle(signal))}`;
}

function judgmentDetail(radar: EditorialRadar) {
  const detail = (radar as RadarWithDetail).judgmentDetail?.trim();
  if (detail) return detail;
  if (!radar.leadSignal) return "当前时间窗内还没有足够的跨来源动向形成主焦点，建议稍后再看。";
  return `${signalTitle(radar.leadSignal)} 是当前最值得先看的信号，结合来源覆盖、突发强度和共识程度排序得出。`;
}

function DashboardSkeleton() {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Skeleton style={{ width: "70%", height: 36, borderRadius: 8 }} />
      <Skeleton style={{ width: "100%", height: 170, borderRadius: 12 }} />
      <Skeleton style={{ width: "100%", height: 120, borderRadius: 12 }} />
    </div>
  );
}

function SignalReasons({ signal }: { signal: NonNullable<EditorialRadar["leadSignal"]> }) {
  return (
    <div className="today-signal-reasons" style={{ display: "grid", gap: 10 }}>
      {signal.reasons.slice(0, 3).map((reason) => (
        <div
          key={reason.label}
          style={{
            display: "grid",
            gap: 4,
            padding: "10px 0",
            borderTop: "1px solid var(--border)",
          }}
        >
          <div style={{ color: "var(--fg-0)", fontSize: 13, fontWeight: 650 }}>{reason.label}</div>
          <div className="nm-muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
            {reason.text}
          </div>
        </div>
      ))}
    </div>
  );
}

function DashboardHomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const range = parseRange(searchParams.get("range"));
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mainSignalOpen, setMainSignalOpen] = useState(false);
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
  const [representativeSources, setRepresentativeSources] = useState<EditorialRepresentativeSource[]>([]);
  const [representativeLoading, setRepresentativeLoading] = useState(false);

  const radar = useMemo<EditorialRadar | null>(() => {
    if (!overview) return null;
    return selectEditorialRadar(overview, range);
  }, [overview, range]);

  const selectedSignal = useMemo(
    () =>
      [radar?.leadSignal, ...(radar?.secondarySignals ?? [])].find((signal) => signal?.id === selectedSignalId) ??
      radar?.leadSignal ??
      null,
    [radar, selectedSignalId],
  );

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/stats?range=${range}&audience=public`, { cache: "no-store" });
      const json = (await response.json()) as Overview | { error?: string };
      if (!response.ok) {
        throw new Error("error" in json ? json.error || "加载总编台失败" : "加载总编台失败");
      }
      setOverview(json as Overview);
    } catch (loadError) {
      setOverview(null);
      setError(loadError instanceof Error ? loadError.message : "加载总编台失败");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    const source = new EventSource("/api/stream");
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void loadStats();
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
  }, [loadStats]);

  const setRange = useCallback(
    (nextRange: TimelineRange) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("range", nextRange);
      router.replace(`/?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const openMainSignal = useCallback(async (signalId: string) => {
    setMainSignalOpen(true);
    setSelectedSignalId(signalId);
    setRepresentativeSources([]);
    setRepresentativeLoading(true);
    try {
      const response = await fetch(`/api/clusters/${encodeURIComponent(signalId)}/siblings?audience=public`, {
        cache: "no-store",
      });
      const json = (await response.json()) as { items?: RepresentativeSourceRows; error?: string } | RepresentativeSourceRows;
      if (!response.ok) {
        throw new Error(Array.isArray(json) ? "加载代表来源失败" : json.error || "加载代表来源失败");
      }
      const rows = Array.isArray(json) ? json : Array.isArray(json.items) ? json.items : [];
      setRepresentativeSources(mapRepresentativeSources(rows));
    } catch {
      setRepresentativeSources([]);
    } finally {
      setRepresentativeLoading(false);
    }
  }, []);

  return (
    <div className="today-page-shell" style={{ display: "grid", gap: 22 }}>
      <section className="today-page" style={{ display: "grid", gap: 22 }}>
        <div
          className="today-page-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "grid", gap: 10, maxWidth: 760 }}>
            <div
              className="today-kicker"
              style={{
                color: "var(--fg-3)",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 1.1,
                textTransform: "uppercase",
              }}
            >
              Editorial Radar · {range.toUpperCase()}
            </div>
            {loading || !radar ? (
              <Skeleton style={{ width: "min(100%, 620px)", height: 46, borderRadius: 8 }} />
            ) : (
              <>
                <h1 style={{ margin: 0, color: "var(--fg-0)", fontSize: 34, lineHeight: 1.12 }}>
                  {radar.totalJudgment}
                </h1>
                <p className="nm-muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.7, maxWidth: 680 }}>
                  {judgmentDetail(radar)}
                </p>
              </>
            )}
          </div>

          <div className="today-range-tabs" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {RANGE_TABS.map((tab) => (
              <Button
                key={tab.id}
                size="sm"
                variant="ghost"
                onClick={() => setRange(tab.id)}
                style={{
                  borderColor: range === tab.id ? "var(--border-strong)" : "var(--border)",
                  color: range === tab.id ? "var(--fg-0)" : "var(--fg-2)",
                }}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>

        {error ? (
          <div
            className="today-error"
            style={{
              padding: 16,
              border: "1px solid var(--border-strong)",
              borderRadius: 12,
            }}
          >
            <div style={{ color: "var(--fg-0)", fontWeight: 650, marginBottom: 6 }}>加载失败</div>
            <div className="nm-muted">{error}</div>
          </div>
        ) : null}

        {loading || !radar ? (
          <DashboardSkeleton />
        ) : radar.leadSignal ? (
          <>
            <article
              className="today-main-signal"
              style={{
                display: "grid",
                gap: 16,
                padding: 20,
                border: "1px solid var(--border)",
                borderRadius: 12,
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: "var(--fg-0)", fontSize: 12, fontWeight: 750, letterSpacing: 1 }}>
                  MAIN SIGNAL
                </span>
                <span className="nm-muted" style={{ fontSize: 12 }}>
                  {radar.leadSignal.distinctSources} 个来源
                </span>
              </div>
              <div style={{ display: "grid", gap: 10, maxWidth: 760 }}>
                <h2 style={{ margin: 0, color: "var(--fg-0)", fontSize: 28, lineHeight: 1.18 }}>
                  {signalTitle(radar.leadSignal)}
                </h2>
                <p className="nm-muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.7 }}>
                  {radar.leadSignal.editorialTake}
                </p>
              </div>
              <SignalReasons signal={radar.leadSignal} />
              <div className="today-action-row" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Button variant="primary" onClick={() => void openMainSignal(radar.leadSignal!.id)}>
                  继续阅读
                </Button>
                <Button variant="ghost" onClick={() => router.push("/reports")}>
                  生成简报
                </Button>
                <Button variant="ghost" onClick={() => router.push(signalSearchUrl(radar.leadSignal!))}>
                  追踪主题
                </Button>
                <Button variant="ghost" onClick={() => router.push("/sources")}>
                  查看来源
                </Button>
              </div>
            </article>

            <section className="today-secondary-signals" style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <h2 style={{ margin: 0, color: "var(--fg-0)", fontSize: 18 }}>次级信号</h2>
                <span className="nm-muted" style={{ fontSize: 12 }}>
                  最多展示 4 条
                </span>
              </div>
              {radar.secondarySignals.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 12,
                  }}
                >
                  {radar.secondarySignals.slice(0, 4).map((signal) => (
                    <button
                      key={signal.id}
                      type="button"
                      className="today-secondary-signal"
                      onClick={() => void openMainSignal(signal.id)}
                      style={{
                        textAlign: "left",
                        display: "grid",
                        gap: 8,
                        padding: 14,
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        background: "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <div className="nm-muted" style={{ fontSize: 12 }}>
                        {signal.distinctSources} 个来源 · {formatRelativeTime(signal.lastSeenAt)}
                      </div>
                      <div style={{ color: "var(--fg-0)", fontWeight: 650, lineHeight: 1.45 }}>{signalTitle(signal)}</div>
                      <div className="nm-muted" style={{ fontSize: 12, lineHeight: 1.55 }}>
                        {signal.editorialTake}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="nm-muted" style={{ padding: "4px 0" }}>
                  当前没有更多可排序的次级信号。
                </div>
              )}
            </section>
          </>
        ) : (
          <div
            className="today-empty-state"
            style={{
              display: "grid",
              gap: 8,
              padding: 20,
              border: "1px solid var(--border)",
              borderRadius: 12,
            }}
          >
            <div style={{ color: "var(--fg-0)", fontSize: 20, fontWeight: 700 }}>暂无主信号</div>
            <div className="nm-muted" style={{ lineHeight: 1.7 }}>
              当前时间窗内还没有足够的来源覆盖或突发强度。你可以切换时间范围，或等待下一轮抓取更新。
            </div>
          </div>
        )}
      </section>

      <Drawer open={mainSignalOpen} onClose={() => setMainSignalOpen(false)} title={selectedSignal ? signalTitle(selectedSignal) : "主焦点"} width={760}>
        {selectedSignal ? (
          <div className="today-main-signal-drawer" style={{ display: "grid", gap: 18 }}>
            <section style={{ display: "grid", gap: 10 }}>
              <div className="nm-muted" style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                Editorial Take
              </div>
              <p style={{ margin: 0, color: "var(--fg-0)", lineHeight: 1.7 }}>{selectedSignal.editorialTake}</p>
            </section>

            <section style={{ display: "grid", gap: 10 }}>
              <h3 style={{ margin: 0, color: "var(--fg-0)", fontSize: 16 }}>为什么重要</h3>
              <SignalReasons signal={selectedSignal} />
            </section>

            <section style={{ display: "grid", gap: 10 }}>
              <h3 style={{ margin: 0, color: "var(--fg-0)", fontSize: 16 }}>代表来源</h3>
              {representativeLoading ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} style={{ width: "100%", height: 76, borderRadius: 10 }} />
                  ))}
                </div>
              ) : representativeSources.length > 0 ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {representativeSources.map((source) => (
                    <div
                      key={source.id}
                      style={{
                        display: "grid",
                        gap: 7,
                        padding: 12,
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                      }}
                    >
                      <div className="nm-muted" style={{ fontSize: 12 }}>
                        {source.sourceName} · {source.platform}
                      </div>
                      <div style={{ color: "var(--fg-0)", lineHeight: 1.5 }}>{source.title}</div>
                      <a href={source.url} target="_blank" rel="noreferrer" className="nm-link-inline">
                        打开原文
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="nm-muted">这个信号暂时没有可展示的代表来源。</div>
              )}
            </section>

            <section style={{ display: "grid", gap: 10 }}>
              <h3 style={{ margin: 0, color: "var(--fg-0)", fontSize: 16 }}>迷你时间线</h3>
              <div style={{ display: "grid", gap: 8 }}>
                {[
                  { label: "观察窗口", value: selectedSignal.range.toUpperCase() },
                  { label: "最近更新", value: formatRelativeTime(selectedSignal.lastSeenAt) },
                  { label: "来源覆盖", value: `${selectedSignal.distinctSources} 个来源 · ${selectedSignal.itemsWindow} 条内容` },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "9px 0",
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    <span className="nm-muted" style={{ fontSize: 13 }}>
                      {item.label}
                    </span>
                    <span style={{ color: "var(--fg-0)", fontSize: 13, textAlign: "right" }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </section>

            <div className="today-drawer-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button variant="primary" onClick={() => router.push("/reports")}>
                生成简报段落
              </Button>
              <Button variant="ghost" onClick={() => router.push(signalSearchUrl(selectedSignal))}>
                追踪这个主题
              </Button>
              <Button variant="ghost" onClick={() => router.push("/all")}>
                查看完整文章流
              </Button>
            </div>
            <p className="nm-muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>
              代表来源用于快速判断这个信号是否值得写入简报；完整文章流会保留所有抓取到的相关内容。
            </p>
          </div>
        ) : (
          <div className="nm-muted">请选择一个信号查看详情。</div>
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
