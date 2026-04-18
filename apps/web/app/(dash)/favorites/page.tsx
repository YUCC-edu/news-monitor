"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Card } from "@/app/ui/card";
import { SourceAvatar } from "@/app/ui/source-avatar";
import { Skeleton } from "@/app/ui/skeleton";

type FavItem = {
  id: string;
  sourceName: string;
  platform: string;
  sourceConfig?: Record<string, unknown> | null;
  title: string | null;
  url: string | null;
  titleZh: string | null;
  contentZh: string | null;
  contentText: string | null;
  tags: string[] | null;
  publishedAt: string | null;
  fetchedAt: string;
  favoritedAt: string;
  note: string | null;
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

export default function FavoritesPage() {
  const [items, setItems] = useState<FavItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = (await fetch("/api/favorites").then((r) => r.json())) as FavItem[];
      setItems(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function unfavorite(id: string) {
    await fetch(`/api/items/${id}/favorite`, { method: "DELETE" });
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <div>
      <header style={{ display: "flex", alignItems: "baseline", marginBottom: 16, gap: 8 }}>
        <h1 className="nm-title">收藏</h1>
        <span className="nm-muted">{loading ? "加载中..." : `共 ${items.length} 条`}</span>
      </header>

      <div style={{ display: "grid", gap: 12 }}>
        {loading ? (
          <>
            <Skeleton style={{ height: 88 }} />
            <Skeleton style={{ height: 88 }} />
          </>
        ) : items.length === 0 ? (
          <div className="nm-empty-state">
            还没有收藏。在精选或分类页点 ♡ 即可收藏。
          </div>
        ) : (
          items.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.35) }}
            >
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "flex", gap: 10, flex: 1, minWidth: 0 }}>
                    <SourceAvatar
                      source={{
                        kind: item.platform,
                        name: item.sourceName,
                        config: item.sourceConfig ?? undefined,
                      }}
                      size={40}
                    />
                    <div style={{ color: "var(--fg-2)", fontSize: 12 }}>
                      [{item.platform}] {item.sourceName}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void unfavorite(item.id)}
                    style={{
                      background: "transparent",
                      border: 0,
                      color: "var(--danger)",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    移除
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
                <div style={{ color: "var(--fg-3)", fontSize: 12, marginTop: 6 }}>
                  收藏于 {formatZhDateTime(item.favoritedAt)}
                </div>
                {(item.contentZh ?? item.contentText) && (
                  <p style={{ margin: "8px 0 0", color: "var(--fg-1)" }}>
                    {(item.contentZh ?? item.contentText ?? "").slice(0, 200)}
                  </p>
                )}
              </Card>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
