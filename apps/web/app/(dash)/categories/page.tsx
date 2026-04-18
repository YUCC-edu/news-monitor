"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Button } from "@/app/ui/button";
import { Card } from "@/app/ui/card";
import { Chip } from "@/app/ui/chip";
import { Skeleton } from "@/app/ui/skeleton";
import { SourceAvatar } from "@/app/ui/source-avatar";

const CONTROLLED_TAGS = [
  "Agent",
  "模型发布",
  "编码",
  "大佬观点",
  "安全",
  "数据集",
  "多模态",
  "推理",
  "硬件",
  "行业新闻",
];

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
  clusterId: string | null;
  clusterTopic: string | null;
  relatedCount: number | null;
  publishedAt: string | null;
  fetchedAt: string;
  favoritedAt?: string | null;
};

type TagCount = { tag: string; count: number };

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

export default function CategoriesPage() {
  const [tagCounts, setTagCounts] = useState<TagCount[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/tags")
      .then((r) => r.json())
      .then((data: TagCount[]) => {
        if (active) setTagCounts(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const qs = new URLSearchParams({ limit: "80" });
    if (selected.length > 0) qs.set("tags", selected.join(","));
    fetch(`/api/items?${qs.toString()}`)
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
  }, [selected]);

  const countByTag = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tagCounts) m.set(t.tag, t.count);
    return m;
  }, [tagCounts]);

  const chipTags = useMemo(() => {
    const known = new Set<string>(CONTROLLED_TAGS);
    const extras = tagCounts
      .map((t) => t.tag)
      .filter((t) => !known.has(t))
      .slice(0, 20);
    return [...CONTROLLED_TAGS, ...extras];
  }, [tagCounts]);

  function toggle(tag: string) {
    setSelected((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

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
          标签 AND 过滤
          {selected.length > 0 ? ` · 已选 ${selected.length}` : ""}
        </span>
        {selected.length > 0 && (
          <Button variant="ghost" size="sm" style={{ marginLeft: "auto" }} onClick={() => setSelected([])}>
            清空
          </Button>
        )}
      </header>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {chipTags.map((tag) => {
            const active = selected.includes(tag);
            const count = countByTag.get(tag) ?? 0;
            return (
              <Chip
                key={tag}
                active={active}
                onClick={() => toggle(tag)}
                style={{ opacity: count === 0 && !active ? 0.45 : 1 }}
              >
                {tag}
                <span style={{ marginLeft: 6, color: "var(--fg-2)" }}>{count}</span>
              </Chip>
            );
          })}
          {chipTags.length === 0 && (
            <span className="nm-muted">暂无标签统计（等待 AI 打标签）</span>
          )}
        </div>
      </Card>

      <div style={{ display: "grid", gap: 12 }}>
        {loading ? (
          <>
            <Skeleton style={{ height: 96 }} />
            <Skeleton style={{ height: 96 }} />
          </>
        ) : items.length === 0 ? (
          <div className="nm-empty-state">
            {selected.length > 0 ? "当前标签组合下暂无内容" : "暂无内容"}
          </div>
        ) : (
          items.map((item, i) => {
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

const tagStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--fg-0)",
  border: "1px solid var(--border-strong)",
  borderRadius: 999,
  padding: "2px 8px",
};
