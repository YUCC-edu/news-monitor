"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppearanceSwitcher } from "@/app/ui/appearance-switcher";
import { Button } from "@/app/ui/button";
import { Card } from "@/app/ui/card";
import { Input } from "@/app/ui/input";
import { SourceAvatar } from "@/app/ui/source-avatar";
import { useToast } from "@/app/ui/toast-context";
import { readJsonResponse } from "@/lib/read-json-response";
import {
  getRecommendedSourceSignature,
  isRecommendedSourceInLibrary,
  type RecommendedAiSource,
  type RecommendedAiSourceSection,
} from "@/lib/recommended-ai-sources";
import {
  recommendedActionButtonStyle,
  recommendedActionGridStyle,
  recommendedCardBodyStyle,
  recommendedCardStyle,
} from "@/lib/recommended-source-layout";

type SourceKind = "rss" | "hn" | "x-rsshub" | "x-rsshub-search" | "wechat-wewe";

type SourceRow = {
  id: string;
  kind: SourceKind;
  name: string;
  config: Record<string, unknown>;
};

type RecommendedResponse = {
  items: RecommendedAiSource[];
  sections: Array<{
    key: RecommendedAiSourceSection;
    label: string;
    description: string;
    itemCount: number;
  }>;
};

const KIND_LABEL: Record<SourceKind, string> = {
  rss: "RSS",
  hn: "黑客新闻",
  "x-rsshub": "X（RSSHub）",
  "x-rsshub-search": "X 搜索",
  "wechat-wewe": "公众号（WeWe-RSS）",
};

const POOL_LABEL: Record<RecommendedAiSource["sourcePool"], string> = {
  official: "官方发布",
  industry: "行业媒体",
  "x-signal": "X 信号",
  "hn-popular-blogs-2025": "HN 候选池",
  internal: "内部精选",
  chinese: "中文精选",
};

const SECTION_LABEL: Record<RecommendedAiSourceSection, string> = {
  "high-signal": "高信号 AI",
  "x-signal": "X 信号",
  chinese: "中文源",
  industry: "行业新闻",
  official: "官方发布",
  research: "研究前沿",
};

export default function RecommendedSourcesPage() {
  const toast = useToast();
  const [items, setItems] = useState<RecommendedAiSource[]>([]);
  const [sections, setSections] = useState<RecommendedResponse["sections"]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | RecommendedAiSourceSection>("all");
  const [search, setSearch] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [optimisticSignatures, setOptimisticSignatures] = useState<Record<string, true>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recommendedRes, sourcesRes] = await Promise.all([
        fetch("/api/sources/recommended"),
        fetch("/api/sources"),
      ]);
      const recommended = await readJsonResponse<RecommendedResponse>(recommendedRes, "/api/sources/recommended");
      const sourceRows = await readJsonResponse<SourceRow[]>(sourcesRes, "/api/sources");
      setItems(Array.isArray(recommended.items) ? recommended.items : []);
      setSections(Array.isArray(recommended.sections) ? recommended.sections : []);
      setSources(Array.isArray(sourceRows) ? sourceRows : []);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
      setItems([]);
      setSections([]);
      setSources([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const sourceKeys = useMemo(() => {
    return new Set(
      sources.map((row) =>
        getRecommendedSourceSignature({
          kind: row.kind,
          config: row.config,
        }),
      ),
    );
  }, [sources]);

  const optimisticKeys = useMemo(() => new Set(Object.keys(optimisticSignatures)), [optimisticSignatures]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== "all" && item.section !== filter) return false;
      if (!query) return true;
      const haystack = [
        item.name,
        item.description ?? "",
        item.rationale,
        item.section,
        item.sourcePool,
        ...(item.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [filter, items, search]);

  const visibleSections = useMemo(() => {
    const order = filter === "all" ? sections.map((section) => section.key) : [filter];
    return order
      .map((key) => ({
        key,
        meta: sections.find((section) => section.key === key),
        items: filtered.filter((item) => item.section === key),
      }))
      .filter((section) => section.items.length > 0 && section.meta);
  }, [filter, filtered, sections]);

  function markOptimisticInstalled(item: RecommendedAiSource) {
    const signature = getRecommendedSourceSignature({ kind: item.kind, config: item.config });
    setOptimisticSignatures((prev) => (prev[signature] ? prev : { ...prev, [signature]: true }));
  }

  async function addSource(item: RecommendedAiSource) {
    setAddingId(item.id);
    try {
      const response = await fetch("/api/sources/import-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: true,
          selectedItems: [item],
        }),
      });
      const data = await readJsonResponse<{
        createdCount: number;
        conflictCount: number;
        failedCount: number;
      }>(response, "/api/sources/import-presets");
      if (data.createdCount > 0 || data.conflictCount > 0) {
        markOptimisticInstalled(item);
      }
      if (data.createdCount > 0) {
        toast("已添加到信源库");
      } else if (data.conflictCount > 0) {
        toast("该信源已在库中");
      } else {
        toast("添加失败");
      }
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    } finally {
      setAddingId(null);
    }
  }

  const summaryCards = [
    {
      label: "推荐总数",
      value: items.length,
      note: "公开可抓、适合持续观察的信源。",
    },
    {
      label: "已在库中",
      value: items.filter((item) => isRecommendedSourceInLibrary(item, sourceKeys, optimisticKeys)).length,
      note: "重复项会自动识别。",
    },
    {
      label: "中文源",
      value: items.filter((item) => item.section === "chinese").length,
      note: "中文 AI 媒体和官方号。",
    },
    {
      label: "研究前沿",
      value: items.filter((item) => item.section === "research").length,
      note: "适合做论文底池。",
    },
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section
        style={{
          display: "grid",
          gap: 16,
          padding: 18,
          border: "1px solid var(--border)",
          borderRadius: 12,
          background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div className="nm-muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.4 }}>
              推荐信源
            </div>
            <h1 className="nm-title" style={{ fontSize: 28, marginBottom: 0 }}>
              推荐信源
            </h1>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Link href="/sources">
              <Button variant="ghost" size="sm" style={{ minHeight: 40 }}>
                返回信源库
              </Button>
            </Link>
            <AppearanceSwitcher />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {summaryCards.map((metric) => (
            <Card key={metric.label} style={{ padding: 16, display: "grid", gap: 8 }}>
              <div className="nm-muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2 }}>
                {metric.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--fg-0)" }}>{metric.value}</div>
              <div className="nm-muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
                {metric.note}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <Card style={{ padding: 16, display: "grid", gap: 14 }}>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant={filter === "all" ? "primary" : "ghost"} size="sm" onClick={() => setFilter("all")}>
              全部
            </Button>
            {sections.map((section) => (
              <Button
                key={section.key}
                variant={filter === section.key ? "primary" : "ghost"}
                size="sm"
                onClick={() => setFilter(section.key)}
              >
                {SECTION_LABEL[section.key]}
              </Button>
            ))}
          </div>
          <div style={{ minWidth: 240, flex: "1 1 260px", maxWidth: 360 }}>
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索名称、标签、说明" />
          </div>
        </div>
      </Card>

      {loading ? <Card style={{ padding: 18 }}>加载中...</Card> : null}

      {visibleSections.map((section) => (
        <section key={section.key} style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <div>
              <h2 className="nm-title" style={{ fontSize: 18, marginBottom: 4 }}>
                {section.meta!.label}
              </h2>
              <div className="nm-muted" style={{ fontSize: 12 }}>
                {section.meta!.description}
              </div>
            </div>
            <div className="nm-muted" style={{ fontSize: 12 }}>
              {section.items.length} 个来源
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            {section.items.map((item) => {
              const installed = isRecommendedSourceInLibrary(item, sourceKeys, optimisticKeys);
              return (
                <Card key={item.id} style={recommendedCardStyle}>
                  <div style={recommendedCardBodyStyle}>
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <SourceAvatar
                        source={{
                          name: item.name,
                          kind: item.kind,
                          config: { ...item.config, homepageUrl: item.homepageUrl },
                        }}
                        size={40}
                      />
                      <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--fg-0)" }}>{item.name}</div>
                        <div className="nm-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                          {item.description}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {[POOL_LABEL[item.sourcePool], KIND_LABEL[item.kind], "免费", ...(item.tags ?? []).slice(0, 2)]
                        .filter(Boolean)
                        .map((tag) => (
                          <span
                            key={`${item.id}:${tag}`}
                            style={{
                              border: "1px solid var(--border)",
                              borderRadius: 999,
                              padding: "4px 8px",
                              fontSize: 11,
                              color: "var(--fg-2)",
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                    </div>

                    <div className="nm-muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
                      {item.rationale}
                    </div>
                  </div>

                  <div style={recommendedActionGridStyle}>
                    <Button
                      size="sm"
                      variant="ghost"
                      style={recommendedActionButtonStyle}
                      onClick={() => window.open(item.homepageUrl, "_blank", "noreferrer")}
                    >
                      查看来源
                    </Button>
                    <Button
                      size="sm"
                      variant={installed ? "ghost" : "primary"}
                      disabled={installed || addingId === item.id}
                      style={recommendedActionButtonStyle}
                      onClick={() => void addSource(item)}
                    >
                      {installed ? "已在库中" : addingId === item.id ? "添加中..." : "添加到信源库"}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
