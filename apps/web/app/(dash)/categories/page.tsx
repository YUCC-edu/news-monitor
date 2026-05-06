"use client";

import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Button } from "@/app/ui/button";
import { Card } from "@/app/ui/card";
import { Chip } from "@/app/ui/chip";
import { Skeleton } from "@/app/ui/skeleton";
import { SourceAvatar } from "@/app/ui/source-avatar";
import { buildCategoryInsights } from "@/lib/category-insights";
import { readJsonResponse } from "@/lib/read-json-response";

type CategoryDimension = "domain" | "topic" | "entity";
type MatchMode = "all" | "any";

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
  categoryMeta?: {
    confidence?: { domain?: number; topic?: number; entity?: number };
    source?: { domain?: "rule" | "llm" | "mixed"; topic?: "rule" | "llm" | "mixed"; entity?: "rule" | "llm" | "mixed" };
  } | null;
  clusterId: string | null;
  clusterTopic: string | null;
  relatedCount: number | null;
  publishedAt: string | null;
  fetchedAt: string;
  favoritedAt?: string | null;
};

function formatZhDateTime(raw: string | null | undefined) {
  if (!raw) return "未知时间";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "未知时间";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function CategoriesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dimension, setDimension] = useState<CategoryDimension>("domain");
  const [matchMode, setMatchMode] = useState<MatchMode>("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [showAllTags, setShowAllTags] = useState(false);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const qs = new URLSearchParams({ limit: "120", taxonomyOnly: "1", sort: "published" });
      const res = await fetch(`/api/items?${qs.toString()}`);
      const data = await readJsonResponse<unknown>(res, "/api/items");
      setItems(Array.isArray(data) ? (data as TimelineItem[]) : []);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "分类加载失败");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const dim = searchParams.get("dimension");
    const selectedRaw = searchParams.get("selected");
    if (dim === "domain" || dim === "topic" || dim === "entity") setDimension(dim);
    if (selectedRaw) {
      const parsed = selectedRaw
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      if (parsed.length > 0) setSelected(parsed);
    }
  }, [searchParams]);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 45000);
    return () => {
      clearInterval(t);
    };
  }, [load]);

  const insights = useMemo(() => buildCategoryInsights(items), [items]);

  const chipRows = insights.byDimension[dimension];
  const chipTags = useMemo(() => chipRows.map((row) => row.value), [chipRows]);
  const rowByTag = useMemo(() => new Map(chipRows.map((row) => [row.value, row])), [chipRows]);

  const visibleChipRows = useMemo(() => {
    if (showAllTags) return chipRows;
    const top = chipRows.slice(0, 12);
    const keep = selected
      .map((tag) => rowByTag.get(tag))
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    return [...new Set([...keep, ...top])];
  }, [chipRows, rowByTag, selected, showAllTags]);

  const filteredItems = useMemo(() => {
    if (selected.length === 0) return items;
    return items.filter((item) => {
      const values =
        dimension === "domain"
          ? (item.categoryDomain ?? [])
          : dimension === "topic"
            ? (item.categoryTopic ?? [])
            : (item.categoryEntity ?? []);
      if (matchMode === "all") return selected.every((v) => values.includes(v));
      return selected.some((v) => values.includes(v));
    });
  }, [dimension, items, matchMode, selected]);

  const emptyMessage = useMemo(() => {
    if (loading) return "";
    if (items.length === 0) return "暂无内容。请先导入推荐信源或触发抓取，分类页会在内容入库后自动展示。";
    if (insights.classifiedItems === 0) return "已有内容，但还没有分类结果。请触发重新富化，或等待 worker 完成分类。";
    if (selected.length > 0 && filteredItems.length === 0) return "当前标签组合下暂无内容，可清空筛选或切换为“任一满足”。";
    return "暂无内容";
  }, [filteredItems.length, insights.classifiedItems, items.length, loading, selected.length]);

  function toggle(tag: string) {
    setSelected((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  function changeDimension(next: CategoryDimension) {
    setDimension(next);
    const p = new URLSearchParams(searchParams.toString());
    p.set("dimension", next);
    router.replace(`/categories?${p.toString()}`, { scroll: false });
  }

  useEffect(() => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("dimension", dimension);
    if (selected.length > 0) p.set("selected", selected.join(","));
    else p.delete("selected");
    const target = p.toString();
    if (target === searchParams.toString()) return;
    router.replace(target ? `/categories?${target}` : "/categories", { scroll: false });
  }, [dimension, selected, router, searchParams]);

  const explain = useMemo(() => {
    const selectedRows = filteredItems.filter((item) => {
      const source = item.categoryMeta?.source?.[dimension];
      return source === "rule" || source === "llm" || source === "mixed";
    });
    if (selectedRows.length === 0) return null;
    const sourceCount = { rule: 0, llm: 0, mixed: 0 };
    let confidenceSum = 0;
    for (const row of selectedRows) {
      const src = row.categoryMeta?.source?.[dimension];
      if (src) sourceCount[src] += 1;
      confidenceSum += row.categoryMeta?.confidence?.[dimension] ?? 0;
    }
    return {
      sourceCount,
      avgConfidence: confidenceSum / selectedRows.length,
      sampleSize: selectedRows.length,
    };
  }, [filteredItems, dimension]);

  async function toggleFavorite(itemId: string, currentlyFav: boolean) {
    await fetch(`/api/items/${itemId}/favorite`, {
      method: currentlyFav ? "DELETE" : "POST",
    });
    setItems((prev) =>
      prev.map((x) =>
        x.id === itemId
          ? { ...x, favoritedAt: currentlyFav ? null : new Date().toISOString() }
          : x,
      ),
    );
  }

  return (
    <div>
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <h1 className="nm-title">分类</h1>
        <span className="nm-muted">
          行业 / 主题 / 实体 多维过滤
          {selected.length > 0 ? ` · 已选 ${selected.length}` : ""}
        </span>
        {selected.length > 0 && (
          <Button variant="ghost" size="sm" style={{ marginLeft: "auto" }} onClick={() => setSelected([])}>
            清空
          </Button>
        )}
      </header>

      <div style={summaryGrid}>
        <Card style={summaryCardStyle}>
          <span className="nm-muted">覆盖条目</span>
          <strong>{insights.totalItems}</strong>
        </Card>
        <Card style={summaryCardStyle}>
          <span className="nm-muted">有分类条目</span>
          <strong>{insights.classifiedItems}</strong>
        </Card>
        <Card style={summaryCardStyle}>
          <span className="nm-muted">待分类条目</span>
          <strong>{insights.unclassifiedItems}</strong>
        </Card>
        <Card style={summaryCardStyle}>
          <span className="nm-muted">可选题候选</span>
          <strong>{insights.candidateCount}</strong>
        </Card>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <Button variant={dimension === "domain" ? "primary" : "ghost"} size="sm" onClick={() => changeDimension("domain")}>
            行业
          </Button>
          <Button variant={dimension === "topic" ? "primary" : "ghost"} size="sm" onClick={() => changeDimension("topic")}>
            主题
          </Button>
          <Button variant={dimension === "entity" ? "primary" : "ghost"} size="sm" onClick={() => changeDimension("entity")}>
            实体
          </Button>
          <Button variant={matchMode === "all" ? "primary" : "ghost"} size="sm" onClick={() => setMatchMode("all")}>
            全部满足
          </Button>
          <Button variant={matchMode === "any" ? "primary" : "ghost"} size="sm" onClick={() => setMatchMode("any")}>
            任一满足
          </Button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {visibleChipRows.map((row) => {
            const tag = row.value;
            const active = selected.includes(tag);
            return (
              <Chip
                key={tag}
                active={active}
                onClick={() => toggle(tag)}
                style={{ opacity: row.itemCount === 0 && !active ? 0.45 : 1 }}
              >
                {tag}
                <span style={{ marginLeft: 6, color: "var(--fg-2)" }}>{row.itemCount}</span>
                <span style={{ marginLeft: 4, color: "var(--fg-3)" }}>{row.sourceCount} 源</span>
              </Chip>
            );
          })}
          {chipTags.length === 0 && (
            <span className="nm-muted">暂无分类统计（等待 AI 富化）</span>
          )}
          {chipTags.length > 12 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAllTags((v) => !v)}
            >
              {showAllTags ? "收起" : `更多（+${chipTags.length - 12}）`}
            </Button>
          ) : null}
        </div>
        {explain ? (
          <div style={{ marginTop: 10, color: "var(--fg-2)", fontSize: 12 }}>
            分类依据：规则 {explain.sourceCount.rule} / LLM {explain.sourceCount.llm} / 混合 {explain.sourceCount.mixed}
            · 平均置信度 {(explain.avgConfidence * 100).toFixed(0)}%（样本 {explain.sampleSize}）
          </div>
        ) : null}
        {loadErr ? <div style={{ marginTop: 8, color: "#ff8f8f", fontSize: 12 }}>{loadErr}</div> : null}
        {chipTags.length === 0 && !loading ? (
          <div style={{ marginTop: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => void load()}>
              重新加载分类
            </Button>
          </div>
        ) : null}
      </Card>

      <div style={{ display: "grid", gap: 12 }}>
        {loading ? (
          <>
            <Skeleton style={{ height: 96 }} />
            <Skeleton style={{ height: 96 }} />
          </>
        ) : filteredItems.length === 0 ? (
          <div className="nm-empty-state">
            <div>{emptyMessage}</div>
            <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              {selected.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
                  清空筛选
                </Button>
              ) : null}
              {items.length === 0 || insights.classifiedItems === 0 ? (
                <Button variant="ghost" size="sm" onClick={() => void load()}>
                  重新加载
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          filteredItems.map((item, i) => {
            const isFav = !!item.favoritedAt;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.025, 0.35) }}
              >
                <Card>
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
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "var(--fg-2)", fontSize: 12, marginBottom: 4 }}>
                          [{item.platform}] {item.sourceName}
                        </div>
                        <div style={{ color: "var(--fg-3)", fontSize: 12 }}>
                          发布时间：{formatZhDateTime(item.publishedAt ?? item.fetchedAt)}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void toggleFavorite(item.id, isFav)}
                      title={isFav ? "取消收藏" : "收藏"}
                      style={{
                        background: "transparent",
                        border: 0,
                        fontSize: 20,
                        cursor: "pointer",
                        color: isFav ? "#ff6b9d" : "var(--fg-3)",
                        padding: "0 6px",
                      }}
                    >
                      {isFav ? "♥" : "♡"}
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
                        <span
                          key={`${item.id}-${tag}`}
                          onClick={() => toggle(tag)}
                          style={{
                            ...tagStyle,
                            cursor: "pointer",
                            borderColor: selected.includes(tag)
                              ? "var(--fg-0)"
                              : "var(--border-strong)",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </Card>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function CategoriesPage() {
  return (
    <Suspense fallback={<div aria-busy="true"><Skeleton style={{ height: 96 }} /></div>}>
      <CategoriesPageInner />
    </Suspense>
  );
}

const tagStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--fg-0)",
  border: "1px solid var(--border-strong)",
  borderRadius: 999,
  padding: "2px 8px",
};

const summaryGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 10,
  marginBottom: 16,
};

const summaryCardStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  minHeight: 74,
};
