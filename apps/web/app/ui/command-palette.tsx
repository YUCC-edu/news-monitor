"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchGroupType } from "@/lib/global-search";

type SearchResult = {
  id: string;
  type: SearchGroupType;
  title: string;
  subtitle?: string;
  href: string;
  score: number;
  meta?: Record<string, unknown>;
};

type SearchGroup = {
  type: SearchGroupType;
  label: string;
  results: SearchResult[];
};

type CommandPaletteProps = {
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
};

const GROUP_PRIORITY: Record<SearchGroupType, number> = {
  nav: 100,
  setting: 95,
  source: 80,
  creator: 80,
  item: 70,
};

export function CommandPalette({ open, initialQuery = "", onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open, initialQuery]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setLoading(true);
      const p = new URLSearchParams();
      if (query.trim()) p.set("q", query.trim());
      p.set("limitPerGroup", "5");
      void fetch(`/api/search/global?${p.toString()}`)
        .then((r) => r.json())
        .then((data: { groups?: SearchGroup[] }) => {
          const next = Array.isArray(data.groups) ? data.groups : [];
          next.sort((a, b) => GROUP_PRIORITY[b.type] - GROUP_PRIORITY[a.type]);
          setGroups(next);
          setActiveIndex(0);
        })
        .catch(() => {
          setGroups([]);
        })
        .finally(() => setLoading(false));
    }, 130);
    return () => clearTimeout(t);
  }, [open, query]);

  const flatResults = useMemo(
    () => groups.flatMap((g) => g.results.map((r) => ({ ...r, group: g.label }))),
    [groups],
  );

  const openHref = (href: string) => {
    onClose();
    if (href.startsWith("http://") || href.startsWith("https://")) {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }
    router.push(href);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (!flatResults.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % flatResults.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + flatResults.length) % flatResults.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        openHref(flatResults[activeIndex]?.href ?? "/search");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, flatResults, onClose, open, router]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="全局搜索"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(5px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(860px, calc(100vw - 24px))",
          margin: "8vh auto 0",
          border: "1px solid var(--border)",
          background: "var(--bg-1)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索页面、设置项、信源、博主、时间轴内容..."
            aria-label="全局搜索输入"
            style={{
              width: "100%",
              height: 42,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg-0)",
              color: "var(--fg-0)",
              padding: "0 12px",
              fontSize: 14,
            }}
          />
        </div>

        <div style={{ maxHeight: "64vh", overflow: "auto", padding: 12, display: "grid", gap: 10 }}>
          {loading ? <div className="nm-muted">搜索中...</div> : null}
          {!loading && groups.every((g) => g.results.length === 0) ? (
            <div className="nm-muted">暂无结果，试试关键词或前往设置页检查数据源。</div>
          ) : null}
          {groups.map((group) =>
            group.results.length === 0 ? null : (
              <section key={group.type} style={{ display: "grid", gap: 6 }}>
                <div className="nm-muted" style={{ fontSize: 12 }}>
                  {group.label}
                </div>
                {group.results.map((row) => {
                  const idx = flatResults.findIndex((x) => x.id === row.id && x.type === row.type);
                  const active = idx === activeIndex;
                  return (
                    <button
                      key={`${row.type}:${row.id}`}
                      type="button"
                      onClick={() => openHref(row.href)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      style={{
                        textAlign: "left",
                        border: "1px solid var(--border)",
                        borderColor: active ? "var(--fg-0)" : "var(--border)",
                        background: active ? "var(--bg-0)" : "transparent",
                        color: "var(--fg-0)",
                        borderRadius: 8,
                        padding: "8px 10px",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{row.title}</div>
                      {row.subtitle ? (
                        <div className="nm-muted" style={{ fontSize: 12, marginTop: 2 }}>
                          {row.subtitle}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </section>
            ),
          )}
        </div>

        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: "10px 12px",
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            fontSize: 12,
          }}
        >
          <span className="nm-muted">↑↓ 选择 · Enter 打开 · Esc 关闭</span>
          <button
            type="button"
            onClick={() => openHref(`/search${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`)}
            style={{
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--fg-0)",
              borderRadius: 8,
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            查看更多结果
          </button>
        </div>
      </div>
    </div>
  );
}
