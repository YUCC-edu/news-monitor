"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/app/ui/button";
import { Card } from "@/app/ui/card";
import { Dialog } from "@/app/ui/dialog";
import { Drawer } from "@/app/ui/drawer";
import { Input } from "@/app/ui/input";
import { Select } from "@/app/ui/select";
import { SourceAvatar } from "@/app/ui/source-avatar";
import { Switch } from "@/app/ui/switch";
import { Skeleton } from "@/app/ui/skeleton";
import { useToast } from "@/app/ui/toast-context";
import { readJsonResponse } from "@/lib/read-json-response";

type SourceKind = "rss" | "hn" | "x-rsshub" | "x-rsshub-search" | "wechat-wewe";
type SourceScope = "public_seed" | "personal";

type SourceRow = {
  id: string;
  kind: SourceKind;
  scope: SourceScope;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  fetchIntervalSec: number;
  initialFetchDays: number | null;
  maxItemAgeDays: number | null;
  lastOkAt: string | null;
  lastError: string | null;
  failCount: number;
  pipeline24hRate: number | null;
  totalItemsAllTime: number;
  items24h: number;
  items7d: number;
  enriched24h: number;
  clusters7d: number;
  consensusClusters7d: number;
  singleSourceClusters7d: number;
  avgSourcesPerCluster7d: number;
  avgItemsPerCluster7d: number;
  maxSourcesInCluster7d: number;
  consensusClusterRate7d: number | null;
  noiseRatio7d: number | null;
  qualityScore: number;
  qualityTier: "high" | "medium" | "low";
};

const kindLabels: Record<SourceKind, string> = {
  rss: "RSS",
  hn: "黑客新闻",
  "x-rsshub": "X（RSSHub）",
  "x-rsshub-search": "X 搜索",
  "wechat-wewe": "公众号（WeWe-RSS）",
};

const qualityTierLabels: Record<SourceRow["qualityTier"], string> = {
  high: "高价值",
  medium: "可用",
  low: "待复查",
};

const scopeLabels: Record<SourceScope, string> = {
  public_seed: "公共雷达",
  personal: "我的源",
};

function formatRate(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

function formatCount(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "0";
  return `${Math.round(value)}`;
}

function formatFixed(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

type DupGroup = {
  kind: string;
  dedupKey: string;
  sources: SourceRow[];
};

type RecentItem = {
  id: string;
  title: string | null;
  publishedAt: string | null;
  fetchedAt: string;
};

type PresetImportResult = {
  requestedCount?: number;
  importedFrom?: "manual-selection" | "preset-all";
  createdCount: number;
  conflictCount: number;
  failedCount: number;
  created: Array<{ id: string; name: string; kind: SourceKind }>;
  conflicts: Array<{ id: string; name: string; kind: SourceKind }>;
  failed: Array<{ name: string; reason: string }>;
};

type SourcePresetCategory = "hotspot" | "research";

type PresetItem = {
  id: string;
  name: string;
  description?: string;
  kind: SourceKind;
  config: Record<string, unknown>;
  fetchIntervalSec: number;
  initialFetchDays?: number | null;
  maxItemAgeDays?: number | null;
  category: SourcePresetCategory;
  tags?: string[];
  priority?: number;
};

type PresetPack = {
  key: string;
  label: string;
  description: string;
  itemCount: number;
  items: PresetItem[];
};

type PresetSection = "high-signal-ai" | "industry" | "official" | "research";

const PRESET_SECTION_META: Record<
  PresetSection,
  { label: string; description: string }
> = {
  "high-signal-ai": {
    label: "高信号 AI",
    description: "主打高共识、适合追值得关注事件的核心信源",
  },
  industry: {
    label: "行业新闻",
    description: "覆盖产品、公司、市场与平台动态",
  },
  official: {
    label: "官方发布",
    description: "实验室、平台和厂商的一手公告",
  },
  research: {
    label: "研究前沿",
    description: "论文、方法和研究进展",
  },
};

function getPresetSection(packKey: string, item: PresetItem): PresetSection {
  void packKey;
  if (
    item.id === "openai-news" ||
    item.id === "deepmind-blog" ||
    item.id === "huggingface-blog" ||
    item.id === "microsoft-ai-blog" ||
    item.id === "google-ai-blog" ||
    item.id === "nvidia-developer-ai"
  ) {
    return "official";
  }
  if (item.id.startsWith("arxiv-")) return "research";
  if (item.id === "hn-ai") return "high-signal-ai";
  if (
    item.id === "techcrunch-ai" ||
    item.id === "theverge-ai" ||
    item.id === "wired-ai" ||
    item.id === "venturebeat-ai"
  ) {
    return "industry";
  }
  return "high-signal-ai";
}

export default function SourcesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<"all" | SourceScope>("all");
  const [kind, setKind] = useState<SourceKind>("rss");
  const [name, setName] = useState("");
  const [interval, setIntervalSec] = useState(300);
  const [initialDays, setInitialDays] = useState(1);
  const [maxAgeDays, setMaxAgeDays] = useState<number | "">("");
  const [rssUrl, setRssUrl] = useState("https://news.ycombinator.com/rss");
  const [hnQuery, setHnQuery] = useState("");
  const [hnPointsMin, setHnPointsMin] = useState(50);
  const [xHandle, setXHandle] = useState("OpenAI");
  const [xSearchQuery, setXSearchQuery] = useState("OpenAI");
  const [weweFeedUrl, setWeweFeedUrl] = useState("");
  const [weweAccountName, setWeweAccountName] = useState("");
  const [dedupHint, setDedupHint] = useState<SourceRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [importingPreset, setImportingPreset] = useState(false);
  const [presetCenterOpen, setPresetCenterOpen] = useState(false);
  const [presetCatalogLoading, setPresetCatalogLoading] = useState(false);
  const [presetPacks, setPresetPacks] = useState<PresetPack[]>([]);
  const [presetPackFilter, setPresetPackFilter] = useState<string[]>([]);
  const [presetCategoryFilter, setPresetCategoryFilter] = useState<"all" | SourcePresetCategory>("all");
  const [presetSectionFilter, setPresetSectionFilter] = useState<"all" | PresetSection>("all");
  const [presetSearch, setPresetSearch] = useState("");
  const [presetChecked, setPresetChecked] = useState<Record<string, boolean>>({});
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictExisting, setConflictExisting] = useState<SourceRow | null>(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupGroups, setDupGroups] = useState<DupGroup[]>([]);
  const [dupPicks, setDupPicks] = useState<Record<string, string>>({});
  const [merging, setMerging] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearConfirm, setClearConfirm] = useState("");
  const [clearing, setClearing] = useState(false);
  const [drawerSource, setDrawerSource] = useState<SourceRow | null>(null);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);

  const config = useMemo(() => {
    if (kind === "rss") return { feedUrl: rssUrl };
    if (kind === "hn") return { query: hnQuery, pointsMin: hnPointsMin };
    if (kind === "x-rsshub") return { handle: xHandle };
    if (kind === "x-rsshub-search") return { query: xSearchQuery, lang: "en" };
    return { feedUrl: weweFeedUrl, accountName: weweAccountName };
  }, [kind, rssUrl, hnQuery, hnPointsMin, xHandle, xSearchQuery, weweFeedUrl, weweAccountName]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sources");
      const data = await readJsonResponse<SourceRow[]>(res, "/api/sources");
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast(msg);
      setRows([]);
    } finally {
      setLoading(false);
      setBootstrapped(true);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.addEventListener("sources.changed", () => {
      void load();
    });
    return () => es.close();
  }, [load]);

  const checkDedup = useCallback(async () => {
    try {
      const r = await fetch("/api/sources/check-dedup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, config }),
      });
      const j = (await r.json()) as { existing: SourceRow | null };
      setDedupHint(j.existing);
    } catch {
      setDedupHint(null);
    }
  }, [kind, config]);

  async function addSource() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          name: name || `${kindLabels[kind]} ${new Date().toLocaleTimeString()}`,
          scope: "personal",
          config,
          fetchIntervalSec: interval,
          enabled: true,
          initialFetchDays: initialDays,
          maxItemAgeDays: maxAgeDays === "" ? null : maxAgeDays,
        }),
      });
      if (res.status === 409) {
        const j = (await res.json()) as { existing: SourceRow };
        setConflictExisting(j.existing);
        setConflictOpen(true);
        return;
      }
      if (!res.ok) {
        toast("创建失败");
        return;
      }
      setName("");
      setInitialDays(1);
      toast("已添加信源");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function loadPresetCatalog() {
    setPresetCatalogLoading(true);
    try {
      const res = await fetch("/api/sources/import-presets");
      const data = await readJsonResponse<{ packs: PresetPack[] }>(res, "/api/sources/import-presets");
      const packs = Array.isArray(data.packs) ? data.packs : [];
      setPresetPacks(packs);
      if (presetPackFilter.length === 0) {
        setPresetPackFilter(packs.map((x) => x.key));
      }
      const nextChecked: Record<string, boolean> = {};
      for (const pack of packs) {
        for (const item of pack.items) {
          nextChecked[`${pack.key}:${item.id}`] = true;
        }
      }
      setPresetChecked(nextChecked);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setPresetCatalogLoading(false);
    }
  }

  const presetList = useMemo(() => {
    const q = presetSearch.trim().toLowerCase();
    const activePack = new Set(presetPackFilter);
    const out: Array<{
      key: string;
      packKey: string;
      packLabel: string;
      item: PresetItem;
      section: PresetSection;
    }> = [];
    for (const pack of presetPacks) {
      if (activePack.size > 0 && !activePack.has(pack.key)) continue;
      for (const item of pack.items) {
        if (presetCategoryFilter !== "all" && item.category !== presetCategoryFilter) continue;
        const section = getPresetSection(pack.key, item);
        if (presetSectionFilter !== "all" && section !== presetSectionFilter) continue;
        if (q) {
          const haystack = [item.name, item.description ?? "", item.category, ...(item.tags ?? [])]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(q)) continue;
        }
        out.push({
          key: `${pack.key}:${item.id}`,
          packKey: pack.key,
          packLabel: pack.label,
          item,
          section,
        });
      }
    }
    return out.sort((a, b) => (b.item.priority ?? 0) - (a.item.priority ?? 0));
  }, [presetPacks, presetPackFilter, presetCategoryFilter, presetSectionFilter, presetSearch]);

  const selectedPresetItems = useMemo(() => {
    const picked = new Set(Object.entries(presetChecked).filter(([, on]) => on).map(([k]) => k));
    return presetList.filter((row) => picked.has(row.key));
  }, [presetChecked, presetList]);

  const presetSectionRows = useMemo(() => {
    const order: PresetSection[] = ["high-signal-ai", "industry", "official", "research"];
    return order
      .map((section) => ({
        section,
        items: presetList.filter((row) => row.section === section),
      }))
      .filter((group) => group.items.length > 0);
  }, [presetList]);

  async function importSelectedPresetItems() {
    if (selectedPresetItems.length === 0) {
      toast("请先选择至少一个预设信源");
      return;
    }
    setImportingPreset(true);
    try {
      const res = await fetch("/api/sources/import-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: true,
          presetKeys: presetPackFilter,
          selectedItems: selectedPresetItems.map((x) => x.item),
        }),
      });
      const data = await readJsonResponse<PresetImportResult>(res, "/api/sources/import-presets");
      setPresetCenterOpen(false);
      toast(
        `导入完成：请求 ${data.requestedCount ?? selectedPresetItems.length}，新增 ${data.createdCount}，冲突 ${data.conflictCount}，失败 ${data.failedCount}`,
      );
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setImportingPreset(false);
    }
  }

  async function removeSource(id: string) {
    await fetch(`/api/sources/${id}`, { method: "DELETE" });
    await load();
  }

  async function clearSourceLibrary() {
    if (clearConfirm !== "DELETE ALL SOURCES") {
      toast("请输入 DELETE ALL SOURCES 后再清空");
      return;
    }
    setClearing(true);
    try {
      const res = await fetch("/api/sources", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: clearConfirm }),
      });
      const data = await readJsonResponse<{ deletedSources: number; deletedClusters: number }>(res, "/api/sources");
      toast(`已清空：删除 ${data.deletedSources} 个信源，清理 ${data.deletedClusters} 个事件簇`);
      setClearOpen(false);
      setClearConfirm("");
      setDrawerSource(null);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setClearing(false);
    }
  }

  async function openDuplicates() {
    const [r, cr] = await Promise.all([
      fetch("/api/sources/duplicates"),
      fetch("/api/creators/counts"),
    ]);
    const groups = (await r.json()) as DupGroup[];
    const counts = (await cr.json()) as { sourceId: string; count: number }[];
    const countMap = new Map(counts.map((c) => [c.sourceId, c.count]));
    setDupGroups(groups);
    const picks: Record<string, string> = {};
    for (const g of groups) {
      const sorted = [...g.sources].sort(
        (a, b) => (countMap.get(b.id) ?? 0) - (countMap.get(a.id) ?? 0),
      );
      picks[`${g.kind}:${g.dedupKey}`] = sorted[0]?.id ?? "";
    }
    setDupPicks(picks);
    setDupOpen(true);
  }

  async function mergeAllDupes() {
    setMerging(true);
    try {
      for (const g of dupGroups) {
        const key = `${g.kind}:${g.dedupKey}`;
        const keepId = dupPicks[key];
        if (!keepId) continue;
        const dropIds = g.sources.filter((s) => s.id !== keepId).map((s) => s.id);
        if (dropIds.length === 0) continue;
        await fetch("/api/sources/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keepId, dropIds }),
        });
      }
      toast("合并完成");
      setDupOpen(false);
      await load();
    } finally {
      setMerging(false);
    }
  }

  async function openDrawer(row: SourceRow) {
    setDrawerSource(row);
    const r = await fetch(`/api/sources/${row.id}/items?limit=10`);
    setRecentItems(r.ok ? ((await r.json()) as RecentItem[]) : []);
  }

  async function saveDrawerPatch(patch: Partial<SourceRow>) {
    if (!drawerSource) return;
    const res = await fetch(`/api/sources/${drawerSource.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: drawerSource.kind,
          name: patch.name ?? drawerSource.name,
          scope: patch.scope ?? drawerSource.scope,
          config: patch.config ?? drawerSource.config,
          enabled: patch.enabled ?? drawerSource.enabled,
          fetchIntervalSec: patch.fetchIntervalSec ?? drawerSource.fetchIntervalSec,
          initialFetchDays: patch.initialFetchDays ?? drawerSource.initialFetchDays,
        maxItemAgeDays: patch.maxItemAgeDays ?? drawerSource.maxItemAgeDays,
      }),
    });
    if (res.status === 409) {
      toast("与已有信源冲突");
      return;
    }
    if (!res.ok) {
      toast("保存失败");
      return;
    }
    toast("已保存");
    await load();
    const updated = (await res.json()) as SourceRow;
    setDrawerSource(updated);
  }

  const sourceSummary = useMemo(() => {
    const enabled = rows.filter((row) => row.enabled).length;
    const healthy = rows.filter((row) => row.enabled && row.failCount === 0 && !row.lastError).length;
    const failing = rows.filter((row) => row.failCount > 0 || row.lastError).length;
    const rss = rows.filter((row) => row.kind === "rss").length;
    return { total: rows.length, enabled, healthy, failing, rss };
  }, [rows]);

  const qualitySummary = useMemo(() => {
    const high = rows.filter((row) => row.qualityTier === "high").length;
    const consensusLeaders = rows.filter((row) => (row.consensusClusters7d ?? 0) >= 2).length;
    const noisy = rows.filter(
      (row) => (row.noiseRatio7d ?? 0) >= 0.65 && (row.clusters7d ?? 0) >= 3,
    ).length;
    const review = rows.filter(
      (row) => row.qualityTier === "low" || row.failCount > 0 || Boolean(row.lastError),
    ).length;
    const avgScore = rows.length
      ? Math.round(rows.reduce((sum, row) => sum + (row.qualityScore ?? 0), 0) / rows.length)
      : 0;
    return { high, consensusLeaders, noisy, review, avgScore };
  }, [rows]);

  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      if (scopeFilter === "all") return true;
      return row.scope === scopeFilter;
    });
  }, [rows, scopeFilter]);

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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <div className="nm-muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.4 }}>
              信源库
            </div>
            <h1 className="nm-title" style={{ fontSize: 28, marginBottom: 0 }}>信源库</h1>
          </div>
          <Link href="/recommended-sources" style={{ marginLeft: "auto" }}>
            <Button variant="ghost" size="sm">
              推荐信源
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={() => void openDuplicates()}>
            检测重复
          </Button>
          <Button variant="danger" size="sm" onClick={() => setClearOpen(true)} disabled={rows.length === 0}>
            清空信源库
          </Button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { label: "全部", value: "all" },
            { label: "公共雷达", value: "public_seed" },
            { label: "我的源", value: "personal" },
          ].map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={scopeFilter === option.value ? "primary" : "ghost"}
              onClick={() => setScopeFilter(option.value as "all" | SourceScope)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {[
            { label: "总信源", value: sourceSummary.total, note: "已经纳入资料库的来源" },
            { label: "启用中", value: sourceSummary.enabled, note: "当前允许进入抓取链路" },
            { label: "健康源", value: sourceSummary.healthy, note: "最近无失败积压的来源" },
            { label: "异常源", value: sourceSummary.failing, note: "需要复查配置或抓取频率" },
          ].map((metric) => (
            <Card key={metric.label} style={{ padding: 16, display: "grid", gap: 8 }}>
              <div className="nm-muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2 }}>
                {metric.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--fg-0)" }}>{metric.value}</div>
              <div className="nm-muted" style={{ lineHeight: 1.6 }}>{metric.note}</div>
            </Card>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {[
            { label: "高价值源", value: qualitySummary.high, note: "更容易形成共识的来源" },
            { label: "共识贡献", value: qualitySummary.consensusLeaders, note: "7 天内参与过多信源事件" },
            { label: "噪声偏高", value: qualitySummary.noisy, note: "单源簇过多，建议复查" },
            { label: "平均质量分", value: qualitySummary.avgScore, note: "按覆盖、共识与稳定性综合估算" },
          ].map((metric) => (
            <Card key={metric.label} style={{ padding: 16, display: "grid", gap: 8 }}>
              <div className="nm-muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2 }}>
                {metric.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--fg-0)" }}>{metric.value}</div>
              <div className="nm-muted" style={{ lineHeight: 1.6 }}>{metric.note}</div>
            </Card>
          ))}
        </div>
      </section>

      <Card style={{ marginBottom: 0 }}>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h2 className="nm-title" style={{ fontSize: 18, marginTop: 0, marginBottom: 0 }}>新增或导入</h2>
            </div>
            <div className="nm-muted" style={{ fontSize: 12, alignSelf: "flex-end" }}>
              RSS 类来源 {sourceSummary.rss} 个
            </div>
          </div>
          <label className="nm-label">
            类型
            <Select value={kind} onChange={(e) => setKind(e.target.value as SourceKind)}>
              <option value="rss">RSS</option>
              <option value="hn">Hacker News</option>
              <option value="x-rsshub">X (RSSHub)</option>
              <option value="x-rsshub-search">X 搜索</option>
              <option value="wechat-wewe">公众号 (WeWe-RSS)</option>
            </Select>
          </label>
          <label className="nm-label">
            名称
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="nm-label">
            抓取间隔（秒）
            <Input
              type="number"
              min={60}
              value={interval}
              onChange={(e) => setIntervalSec(Number(e.target.value))}
            />
          </label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
              gap: 12,
            }}
          >
            <label className="nm-label">
              首次回溯天数（默认 1 ≈ 24 小时内）
              <Input
                type="number"
                min={1}
                value={initialDays}
                onChange={(e) => setInitialDays(Number(e.target.value))}
              />
            </label>
            <label className="nm-label">
              仅保留最近 N 天（空=不限）
              <Input
                type="number"
                min={1}
                value={maxAgeDays === "" ? "" : maxAgeDays}
                placeholder="可选"
                onChange={(e) =>
                  setMaxAgeDays(e.target.value === "" ? "" : Number(e.target.value))
                }
              />
            </label>
          </div>
          {kind === "rss" && (
            <label className="nm-label">
              Feed URL
              <Input
                value={rssUrl}
                onChange={(e) => setRssUrl(e.target.value)}
                onBlur={() => void checkDedup()}
              />
            </label>
          )}
          {kind === "hn" && (
            <>
              <label className="nm-label">
                Query
                <Input
                  value={hnQuery}
                  onChange={(e) => setHnQuery(e.target.value)}
                  onBlur={() => void checkDedup()}
                />
              </label>
              <label className="nm-label">
                pointsMin
                <Input
                  type="number"
                  min={0}
                  value={hnPointsMin}
                  onChange={(e) => setHnPointsMin(Number(e.target.value))}
                />
              </label>
            </>
          )}
          {kind === "x-rsshub" && (
            <label className="nm-label">
              Handle
              <Input
                value={xHandle}
                onChange={(e) => setXHandle(e.target.value)}
                onBlur={() => void checkDedup()}
              />
            </label>
          )}
          {kind === "x-rsshub-search" && (
            <label className="nm-label">
              Search Query
              <Input
                value={xSearchQuery}
                onChange={(e) => setXSearchQuery(e.target.value)}
                onBlur={() => void checkDedup()}
              />
            </label>
          )}
          {kind === "wechat-wewe" && (
            <>
              <label className="nm-label">
                Feed URL
                <Input
                  value={weweFeedUrl}
                  onChange={(e) => setWeweFeedUrl(e.target.value)}
                  placeholder="http://127.0.0.1:4000/feeds/MP_WXS_xxx.atom（/dash/feeds/ 也可）"
                  onBlur={() => void checkDedup()}
                />
              </label>
              <label className="nm-label">
                账号名
                <Input
                  value={weweAccountName}
                  onChange={(e) => setWeweAccountName(e.target.value)}
                />
              </label>
            </>
          )}
          {dedupHint ? (
            <div
              style={{
                padding: 10,
                borderRadius: 8,
                border: "1px solid var(--border-strong)",
                fontSize: 13,
                color: "var(--fg-1)",
              }}
            >
              已存在类似信源：{dedupHint.name}（{dedupHint.kind}）
              <Button
                variant="ghost"
                size="sm"
                style={{ marginLeft: 8 }}
                onClick={() => void openDrawer(dedupHint)}
              >
                查看
              </Button>
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button
              disabled={importingPreset}
              variant="ghost"
              onClick={() => {
                setPresetCenterOpen(true);
                if (presetPacks.length === 0) void loadPresetCatalog();
              }}
            >
              {importingPreset ? "导入中..." : "导入预设"}
            </Button>
            <Button disabled={submitting} variant="primary" onClick={() => void addSource()}>
              {submitting ? "创建中..." : "新增信源"}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 className="nm-title" style={{ fontSize: 18, marginTop: 0, marginBottom: 0 }}>
              资料库
            </h2>
          </div>
          <div className="nm-muted" style={{ fontSize: 12, alignSelf: "flex-end" }}>
            共 {rows.length} 个来源
          </div>
        </div>
        {!bootstrapped && loading ? (
          <div className="nm-table-wrap" aria-busy="true" aria-label="加载中">
            <table className="nm-table">
              <thead>
                <tr>
                  <th />
                  <th>名称</th>
                  <th>类型</th>
                  <th>间隔</th>
                  <th>画像</th>
                  <th>状态</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td style={{ width: 48 }}>
                      <Skeleton style={{ width: 32, height: 32, borderRadius: 8 }} />
                    </td>
                    <td>
                      <Skeleton style={{ height: 14, width: `${45 + (i % 3) * 12}%` }} />
                    </td>
                    <td>
                      <Skeleton style={{ height: 14, width: 88 }} />
                    </td>
                    <td>
                      <Skeleton style={{ height: 14, width: 40 }} />
                    </td>
                    <td>
                      <Skeleton style={{ height: 14, width: 120 }} />
                    </td>
                    <td>
                      <Skeleton style={{ height: 14, width: 64 }} />
                    </td>
                    <td>
                      <Skeleton style={{ height: 32, width: 52 }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : rows.length === 0 ? (
          <p className="nm-muted">暂无信源</p>
        ) : (
          <div className="nm-table-wrap">
            <table className="nm-table">
              <thead>
                <tr>
                  <th />
                  <th>名称</th>
                  <th>类型</th>
                  <th>范围</th>
                  <th>间隔</th>
                  <th>画像</th>
                  <th>状态</th>
                  <th />
                </tr>
              </thead>
              <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td style={{ width: 48 }}>
                    <SourceAvatar
                      source={{
                        kind: row.kind,
                        name: row.name,
                        config: row.config,
                      }}
                      size={32}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => void openDrawer(row)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--fg-0)",
                        cursor: "pointer",
                        textAlign: "left",
                        padding: 0,
                        font: "inherit",
                      }}
                    >
                      {row.name}
                    </button>
                  </td>
                  <td>{kindLabels[row.kind]}</td>
                  <td>{scopeLabels[row.scope]}</td>
                  <td>{row.fetchIntervalSec}s</td>
                  <td>
                    <div style={{ display: "grid", gap: 4 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-0)" }}>
                        Q{row.qualityScore} · {qualityTierLabels[row.qualityTier]}
                      </div>
                      <div className="nm-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                        共识簇 {formatCount(row.consensusClusters7d)}/{formatCount(row.clusters7d)} ·
                        噪声 {formatRate(row.noiseRatio7d)} · 流水 {formatRate(row.pipeline24hRate)}
                      </div>
                    </div>
                  </td>
                  <td>{row.lastError ? `失败(${row.failCount})` : "正常"}</td>
                  <td>
                    <Button variant="danger" size="sm" onClick={() => void removeSource(row.id)}>
                      删除
                    </Button>
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={conflictOpen} onClose={() => setConflictOpen(false)} title="信源已存在">
        <p style={{ color: "var(--fg-1)", fontSize: 14 }}>
          {conflictExisting?.name}（{conflictExisting?.kind}）已占用同一去重键。请在已有信源上编辑，或先合并重复项。
        </p>
        <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={() => setConflictOpen(false)}>
            关闭
          </Button>
          {conflictExisting ? (
            <Button
              variant="primary"
              onClick={() => {
                setConflictOpen(false);
                void openDrawer(conflictExisting);
              }}
            >
              打开该信源
            </Button>
          ) : null}
        </div>
      </Dialog>

      <Dialog open={presetCenterOpen} onClose={() => setPresetCenterOpen(false)} title="导入预设">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            maxHeight: "78vh",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <div style={{ color: "var(--fg-2)", fontSize: 12, lineHeight: 1.6 }}>
            先从高信号预设里快速起步，再按需要补充手动信源。这里按来源性质分组，方便你快速筛选。
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {presetPacks.map((pack) => {
                const active = presetPackFilter.includes(pack.key);
                return (
                  <button
                    key={pack.key}
                    type="button"
                    onClick={() =>
                      setPresetPackFilter((prev) =>
                        prev.includes(pack.key)
                          ? prev.filter((x) => x !== pack.key)
                          : [...prev, pack.key],
                      )
                    }
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 999,
                      padding: "4px 10px",
                      fontSize: 12,
                      background: active ? "var(--bg-0)" : "var(--bg-1)",
                      color: active ? "var(--fg-0)" : "var(--fg-2)",
                      cursor: "pointer",
                    }}
                    title={pack.description}
                  >
                    {pack.label}（{pack.itemCount}）
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["all", "high-signal-ai", "industry", "official", "research"] as const).map((section) => {
                const active = presetSectionFilter === section;
                const meta = section === "all" ? { label: "全部分组", description: "显示所有预设分组" } : PRESET_SECTION_META[section];
                return (
                  <button
                    key={section}
                    type="button"
                    onClick={() => setPresetSectionFilter(section)}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 999,
                      padding: "4px 10px",
                      fontSize: 12,
                      background: active ? "var(--bg-0)" : "var(--bg-1)",
                      color: active ? "var(--fg-0)" : "var(--fg-2)",
                      cursor: "pointer",
                    }}
                    title={meta.description}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Select
                value={presetCategoryFilter}
                onChange={(e) => setPresetCategoryFilter(e.target.value as "all" | SourcePresetCategory)}
                style={{ maxWidth: 180 }}
              >
                <option value="all">全部类别</option>
                <option value="hotspot">值得关注</option>
                <option value="evidence">循证</option>
                <option value="policy">政策</option>
              </Select>
              <Input
                value={presetSearch}
                onChange={(e) => setPresetSearch(e.target.value)}
                placeholder="搜索名称/描述/标签"
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const next = { ...presetChecked };
                for (const row of presetList) next[row.key] = true;
                setPresetChecked(next);
              }}
            >
              全选当前结果
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const next = { ...presetChecked };
                for (const row of presetList) next[row.key] = false;
                setPresetChecked(next);
              }}
            >
              清空当前结果
            </Button>
            <span className="nm-muted" style={{ fontSize: 12 }}>
              已选 {selectedPresetItems.length} / 当前可见 {presetList.length}
            </span>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 12,
            }}
          >
            {presetCatalogLoading ? (
              <div aria-busy="true" style={{ display: "grid", gap: 8 }}>
                <Skeleton style={{ height: 40 }} />
                <Skeleton style={{ height: 40 }} />
                <Skeleton style={{ height: 40 }} />
              </div>
            ) : presetList.length === 0 ? (
              <p className="nm-muted">当前筛选下无可选预设</p>
            ) : (
              <div style={{ display: "grid", gap: 16, maxHeight: "100%", overflowY: "auto", paddingRight: 4 }}>
                {presetSectionRows.map((group) => {
                  const meta = PRESET_SECTION_META[group.section];
                  return (
                    <section key={group.section} style={{ display: "grid", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 15, color: "var(--fg-0)" }}>{meta.label}</div>
                          <div className="nm-muted" style={{ fontSize: 12 }}>
                            {meta.description}
                          </div>
                        </div>
                        <span className="nm-muted" style={{ fontSize: 12 }}>
                          {group.items.length} 项
                        </span>
                      </div>
                      <div style={{ display: "grid", gap: 8 }}>
                        {group.items.map((row) => (
                          <label
                            key={row.key}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "20px 1fr",
                              gap: 10,
                              alignItems: "start",
                              padding: 10,
                              border: "1px solid var(--border)",
                              borderRadius: 10,
                              background: "var(--bg-1)",
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={!!presetChecked[row.key]}
                              onChange={(e) =>
                                setPresetChecked((prev) => ({ ...prev, [row.key]: e.target.checked }))
                              }
                              style={{ marginTop: 2 }}
                            />
                            <div style={{ display: "grid", gap: 4 }}>
                              <div style={{ fontSize: 13, color: "var(--fg-0)" }}>
                                {row.item.name} <span className="nm-muted">[{row.item.kind}]</span>
                              </div>
                              <div className="nm-muted" style={{ fontSize: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <span>{row.packLabel}</span>
                                <span>·</span>
                                <span>{row.item.category}</span>
                                <span>·</span>
                                <span>{row.item.fetchIntervalSec}s</span>
                              </div>
                              {row.item.description ? (
                                <div className="nm-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                                  {row.item.description}
                                </div>
                              ) : null}
                            </div>
                          </label>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setPresetCenterOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={importingPreset || selectedPresetItems.length === 0}
              onClick={() => void importSelectedPresetItems()}
            >
              {importingPreset ? "导入中..." : `导入所选（${selectedPresetItems.length}）`}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={clearOpen} onClose={() => !clearing && setClearOpen(false)} title="清空信源库">
        <div style={{ display: "grid", gap: 12 }}>
          <p style={{ color: "var(--fg-1)", fontSize: 14, lineHeight: 1.7, margin: 0 }}>
            这个操作会删除全部信源，并级联删除这些信源抓取到的动态、富化结果、收藏关联，同时清理无成员的事件簇。此操作不可撤销。
          </p>
          <div style={{ color: "var(--danger)", fontSize: 13 }}>
            当前将删除 {rows.length} 个信源。确认请输入 <code>DELETE ALL SOURCES</code>。
          </div>
          <Input
            value={clearConfirm}
            onChange={(event) => setClearConfirm(event.target.value)}
            placeholder="DELETE ALL SOURCES"
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" disabled={clearing} onClick={() => setClearOpen(false)}>
              取消
            </Button>
            <Button
              variant="danger"
              disabled={clearing || clearConfirm !== "DELETE ALL SOURCES"}
              onClick={() => void clearSourceLibrary()}
            >
              {clearing ? "清空中..." : "确认清空"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={dupOpen} onClose={() => setDupOpen(false)} title="重复信源">
        {dupGroups.length === 0 ? (
          <p className="nm-muted">没有重复组</p>
        ) : (
          <>
            {dupGroups.map((g) => {
              const key = `${g.kind}:${g.dedupKey}`;
              return (
                <div key={key} style={{ marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
                  <div className="nm-muted" style={{ marginBottom: 8 }}>
                    {g.kind} · {g.dedupKey}
                  </div>
                  <Select
                    value={dupPicks[key] ?? ""}
                    onChange={(e) =>
                      setDupPicks((p) => ({ ...p, [key]: e.target.value }))
                    }
                  >
                    {g.sources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.id.slice(0, 8)}…)
                      </option>
                    ))}
                  </Select>
                </div>
              );
            })}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => setDupOpen(false)}>
                取消
              </Button>
              <Button variant="primary" disabled={merging} onClick={() => void mergeAllDupes()}>
                {merging ? "合并中…" : "合并全部"}
              </Button>
            </div>
          </>
        )}
      </Dialog>

      <Drawer
        open={!!drawerSource}
        onClose={() => setDrawerSource(null)}
        title={drawerSource?.name ?? "信源"}
      >
        {drawerSource ? (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <SourceAvatar
                source={{
                  kind: drawerSource.kind,
                  name: drawerSource.name,
                  config: drawerSource.config,
                }}
                size={48}
              />
              <div>
                <div style={{ fontWeight: 600 }}>{drawerSource.name}</div>
                <div className="nm-muted">{kindLabels[drawerSource.kind]}</div>
              </div>
            </div>
            <label className="nm-label">
              名称
              <Input
                value={drawerSource.name}
                onChange={(e) =>
                  setDrawerSource({ ...drawerSource, name: e.target.value })
                }
              />
            </label>
            <label className="nm-label">
              范围
              <Select
                value={drawerSource.scope}
                onChange={(e) =>
                  setDrawerSource({ ...drawerSource, scope: e.target.value as SourceScope })
                }
              >
                <option value="public_seed">公共雷达</option>
                <option value="personal">我的源</option>
              </Select>
            </label>
            <label className="nm-label" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              启用
              <Switch
                checked={drawerSource.enabled}
                onChange={(on) => setDrawerSource({ ...drawerSource, enabled: on })}
              />
            </label>
            <label className="nm-label">
              抓取间隔（秒）
              <Input
                type="number"
                min={60}
                value={drawerSource.fetchIntervalSec}
                onChange={(e) =>
                  setDrawerSource({
                    ...drawerSource,
                    fetchIntervalSec: Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="nm-label">
              首次回溯天数
              <Input
                type="number"
                min={1}
                value={drawerSource.initialFetchDays ?? 1}
                onChange={(e) =>
                  setDrawerSource({
                    ...drawerSource,
                    initialFetchDays: Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="nm-label">
              仅保留最近 N 天（空=不限）
              <Input
                type="number"
                min={1}
                value={drawerSource.maxItemAgeDays ?? ""}
                placeholder="可选"
                onChange={(e) =>
                  setDrawerSource({
                    ...drawerSource,
                    maxItemAgeDays:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button
                variant="primary"
                onClick={() =>
                  void saveDrawerPatch({
                    name: drawerSource.name,
                    enabled: drawerSource.enabled,
                    fetchIntervalSec: drawerSource.fetchIntervalSec,
                    initialFetchDays: drawerSource.initialFetchDays,
                    maxItemAgeDays: drawerSource.maxItemAgeDays,
                  })
                }
              >
                保存
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  void fetch(`/api/sources/${drawerSource.id}`, { method: "POST" }).then(() =>
                    toast("已加入抓取队列"),
                  )
                }
              >
                立即抓取
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  void fetch(`/api/sources/${drawerSource.id}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ resetFirstFetch: true }),
                  }).then(() => toast("已重置首次抓取并排队"))
                }
                >
                重新首抓
              </Button>
            </div>
            <div
              style={{
                display: "grid",
                gap: 10,
                padding: 12,
                border: "1px solid var(--border)",
                borderRadius: 10,
                background: "var(--bg-1)",
              }}
            >
              <div style={{ fontWeight: 600 }}>质量画像</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                {[
                  { label: "质量分", value: `Q${drawerSource.qualityScore}` },
                  { label: "质量层级", value: qualityTierLabels[drawerSource.qualityTier] },
                  { label: "24h 流水", value: formatRate(drawerSource.pipeline24hRate) },
                  { label: "7d 共识簇", value: formatCount(drawerSource.consensusClusters7d) },
                  { label: "7d 噪声率", value: formatRate(drawerSource.noiseRatio7d) },
                  { label: "平均多源数", value: formatFixed(drawerSource.avgSourcesPerCluster7d, 2) },
                ].map((metric) => (
                  <div
                    key={metric.label}
                    style={{
                      display: "grid",
                      gap: 4,
                      padding: 10,
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                  >
                    <div className="nm-muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.1 }}>
                      {metric.label}
                    </div>
                    <div style={{ fontSize: 15, color: "var(--fg-0)" }}>{metric.value}</div>
                  </div>
                ))}
              </div>
              <div className="nm-muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
                {drawerSource.qualityTier === "high"
                  ? "这个信源已经稳定参与多源事件，适合继续保留并优先观察其首发能力。"
                  : drawerSource.qualityTier === "medium"
                    ? "这个信源可用，但最好结合它的共识贡献和噪声率继续观察。"
                    : "这个信源的单源簇偏多或稳定性一般，建议优先复查去重、频率和配置。"}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>最近条目</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: "var(--fg-2)", fontSize: 13 }}>
                {recentItems.map((it) => (
                  <li key={it.id} style={{ marginBottom: 6 }}>
                    {it.title ?? "(无标题)"}
                  </li>
                ))}
                {recentItems.length === 0 ? <li className="nm-muted">暂无</li> : null}
              </ul>
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}


