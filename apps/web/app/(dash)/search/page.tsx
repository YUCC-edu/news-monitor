"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/app/ui/card";
import type { SearchGroupType } from "@/lib/global-search";

type SearchResult = {
  id: string;
  type: SearchGroupType;
  title: string;
  subtitle?: string;
  href: string;
  score: number;
};

type SearchGroup = {
  type: SearchGroupType;
  label: string;
  results: SearchResult[];
};

function SearchInner() {
  const searchParams = useSearchParams();
  const q = (searchParams.get("q") ?? "").trim();
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    p.set("limitPerGroup", "20");
    void fetch(`/api/search/global?${p.toString()}`)
      .then((r) => r.json())
      .then((data: { groups?: SearchGroup[] }) => {
        setGroups(Array.isArray(data.groups) ? data.groups : []);
      })
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }, [q]);

  const total = useMemo(
    () => groups.reduce((acc, group) => acc + group.results.length, 0),
    [groups],
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 className="nm-title">全局搜索</h1>
        <span className="nm-muted">{q ? `关键词：${q}` : "请输入关键词"} · {total} 条结果</span>
      </header>
      {loading ? (
        <div className="nm-muted">搜索中...</div>
      ) : total === 0 ? (
        <div className="nm-empty-state">暂无匹配结果</div>
      ) : (
        groups.map((group) =>
          group.results.length === 0 ? null : (
            <Card key={group.type}>
              <div className="nm-muted" style={{ fontSize: 12, marginBottom: 10 }}>
                {group.label}
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {group.results.map((row) => (
                  <a
                    key={`${row.type}:${row.id}`}
                    href={row.href}
                    target={row.href.startsWith("http") ? "_blank" : undefined}
                    rel={row.href.startsWith("http") ? "noreferrer" : undefined}
                    style={{
                      display: "block",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "8px 10px",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{row.title}</div>
                    {row.subtitle ? (
                      <div className="nm-muted" style={{ fontSize: 12, marginTop: 3 }}>
                        {row.subtitle}
                      </div>
                    ) : null}
                  </a>
                ))}
              </div>
            </Card>
          ),
        )
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="nm-muted">加载中...</div>}>
      <SearchInner />
    </Suspense>
  );
}
