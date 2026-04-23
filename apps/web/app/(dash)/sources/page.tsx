"use client";

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

type SourceKind = "rss" | "hn" | "x-rsshub" | "wechat-wewe";

type SourceRow = {
  id: string;
  kind: SourceKind;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  fetchIntervalSec: number;
  initialFetchDays: number | null;
  maxItemAgeDays: number | null;
  lastOkAt: string | null;
  lastError: string | null;
  failCount: number;
};

const kindLabels: Record<SourceKind, string> = {
  rss: "RSS",
  hn: "Hacker News",
  "x-rsshub": "X (RSSHub)",
  "wechat-wewe": "公众号 (WeWe-RSS)",
};

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

type SourcePresetCategory = "hotspot" | "research" | "nursing" | "evidence" | "policy";

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

export default function SourcesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [kind, setKind] = useState<SourceKind>("rss");
  const [name, setName] = useState("");
  const [interval, setIntervalSec] = useState(300);
  const [initialDays, setInitialDays] = useState(1);
  const [maxAgeDays, setMaxAgeDays] = useState<number | "">("");
  const [rssUrl, setRssUrl] = useState("https://news.ycombinator.com/rss");
  const [hnQuery, setHnQuery] = useState("");
  const [hnPointsMin, setHnPointsMin] = useState(50);
  const [xHandle, setXHandle] = useState("OpenAI");
  const [weweFeedUrl, setWeweFeedUrl] = useState("");
  const [weweAccountName, setWeweAccountName] = useState("");
  const [dedupHint, setDedupHint] = useState<SourceRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [importingPreset, setImportingPreset] = useState(false);
  const [lastImportResult, setLastImportResult] = useState<PresetImportResult | null>(null);
  const [importResultOpen, setImportResultOpen] = useState(false);
  const [presetCenterOpen, setPresetCenterOpen] = useState(false);
  const [presetCatalogLoading, setPresetCatalogLoading] = useState(false);
  const [presetPacks, setPresetPacks] = useState<PresetPack[]>([]);
  const [presetPackFilter, setPresetPackFilter] = useState<string[]>([]);
  const [presetCategoryFilter, setPresetCategoryFilter] = useState<"all" | SourcePresetCategory>("all");
  const [presetSearch, setPresetSearch] = useState("");
  const [presetChecked, setPresetChecked] = useState<Record<string, boolean>>({});
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictExisting, setConflictExisting] = useState<SourceRow | null>(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupGroups, setDupGroups] = useState<DupGroup[]>([]);
  const [dupPicks, setDupPicks] = useState<Record<string, string>>({});
  const [merging, setMerging] = useState(false);
  const [drawerSource, setDrawerSource] = useState<SourceRow | null>(null);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);

  const config = useMemo(() => {
    if (kind === "rss") return { feedUrl: rssUrl };
    if (kind === "hn") return { query: hnQuery, pointsMin: hnPointsMin };
    if (kind === "x-rsshub") return { handle: xHandle };
    return { feedUrl: weweFeedUrl, accountName: weweAccountName };
  }, [kind, rssUrl, hnQuery, hnPointsMin, xHandle, weweFeedUrl, weweAccountName]);

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

  async function importPresetSources() {
    setImportingPreset(true);
    try {
      const res = await fetch("/api/sources/import-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetKey: "ai-hotspot-research", enabled: true }),
      });
      const data = await readJsonResponse<PresetImportResult>(res, "/api/sources/import-presets");
      setLastImportResult(data);
      setImportResultOpen(true);
      toast(
        `预设导入完成：新增 ${data.createdCount}，已存在 ${data.conflictCount}，失败 ${data.failedCount}`,
      );
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setImportingPreset(false);
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
    const out: Array<{ key: string; packKey: string; packLabel: string; item: PresetItem }> = [];
    for (const pack of presetPacks) {
      if (activePack.size > 0 && !activePack.has(pack.key)) continue;
      for (const item of pack.items) {
        if (presetCategoryFilter !== "all" && item.category !== presetCategoryFilter) continue;
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
        });
      }
    }
    return out.sort((a, b) => (b.item.priority ?? 0) - (a.item.priority ?? 0));
  }, [presetPacks, presetPackFilter, presetCategoryFilter, presetSearch]);

  const selectedPresetItems = useMemo(() => {
    const picked = new Set(Object.entries(presetChecked).filter(([, on]) => on).map(([k]) => k));
    return presetList.filter((row) => picked.has(row.key));
  }, [presetChecked, presetList]);

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
      setLastImportResult(data);
      setImportResultOpen(true);
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

  return (
    <div>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <h1 className="nm-title">信源管理</h1>
        <span className="nm-muted">RSS / HN / X / 公众号</span>
        <Button variant="ghost" size="sm" style={{ marginLeft: "auto" }} onClick={() => void openDuplicates()}>
          检测重复
        </Button>
      </header>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gap: 12 }}>
          <label className="nm-label">
            类型
            <Select value={kind} onChange={(e) => setKind(e.target.value as SourceKind)}>
              <option value="rss">RSS</option>
              <option value="hn">Hacker News</option>
              <option value="x-rsshub">X (RSSHub)</option>
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
              onClick={() => void importPresetSources()}
            >
              {importingPreset ? "导入中..." : "导入 AI 热点+科研预设"}
            </Button>
            <Button
              disabled={importingPreset}
              variant="ghost"
              onClick={() => {
                setPresetCenterOpen(true);
                if (presetPacks.length === 0) void loadPresetCatalog();
              }}
            >
              选择导入预设（推荐）
            </Button>
            <Button
              disabled={!lastImportResult}
              variant="ghost"
              onClick={() => setImportResultOpen(true)}
            >
              查看最近导入结果
            </Button>
            <Button disabled={submitting} variant="primary" onClick={() => void addSource()}>
              {submitting ? "创建中..." : "新增信源"}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="nm-title" style={{ fontSize: 16, marginTop: 0 }}>
          已有信源
        </h2>
        {!bootstrapped && loading ? (
          <div className="nm-table-wrap" aria-busy="true" aria-label="加载中">
            <table className="nm-table">
              <thead>
                <tr>
                  <th />
                  <th>名称</th>
                  <th>类型</th>
                  <th>间隔</th>
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
                <th>间隔</th>
                <th>状态</th>
                <th />
              </tr>
              </thead>
              <tbody>
              {rows.map((row) => (
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
                  <td>{row.fetchIntervalSec}s</td>
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

      <Dialog open={presetCenterOpen} onClose={() => setPresetCenterOpen(false)} title="预设导入中心">
        <div style={{ display: "grid", gap: 12, maxHeight: "72vh", overflow: "auto" }}>
          <div style={{ color: "var(--fg-2)", fontSize: 12 }}>
            可按预设包、类别和关键词筛选，再导入你需要的信源。
          </div>
          <div style={{ display: "grid", gap: 8 }}>
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
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Select
                value={presetCategoryFilter}
                onChange={(e) => setPresetCategoryFilter(e.target.value as "all" | SourcePresetCategory)}
                style={{ maxWidth: 180 }}
              >
                <option value="all">全部类别</option>
                <option value="hotspot">热点</option>
                <option value="research">科研</option>
                <option value="nursing">护理</option>
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

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const next = { ...presetChecked };
                for (const row of presetList) next[row.key] = true;
                setPresetChecked(next);
              }}
            >
              全选当前列表
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
              清空当前列表
            </Button>
            <span className="nm-muted" style={{ fontSize: 12, alignSelf: "center" }}>
              已选 {selectedPresetItems.length} / 当前可见 {presetList.length}
            </span>
          </div>

          <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 8 }}>
            {presetCatalogLoading ? (
              <div aria-busy="true">
                <Skeleton style={{ height: 40, marginBottom: 8 }} />
                <Skeleton style={{ height: 40, marginBottom: 8 }} />
                <Skeleton style={{ height: 40 }} />
              </div>
            ) : presetList.length === 0 ? (
              <p className="nm-muted">当前筛选下无可选预设</p>
            ) : (
              <div style={{ display: "grid", gap: 8, maxHeight: "36vh", overflow: "auto" }}>
                {presetList.map((row) => (
                  <label
                    key={row.key}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "20px 1fr",
                      gap: 8,
                      alignItems: "start",
                      borderBottom: "1px solid var(--border)",
                      paddingBottom: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!presetChecked[row.key]}
                      onChange={(e) =>
                        setPresetChecked((prev) => ({ ...prev, [row.key]: e.target.checked }))
                      }
                    />
                    <div>
                      <div style={{ fontSize: 13, color: "var(--fg-0)" }}>
                        {row.item.name} <span className="nm-muted">[{row.item.kind}]</span>
                      </div>
                      <div className="nm-muted" style={{ fontSize: 12 }}>
                        {row.packLabel} · {row.item.category} · {row.item.fetchIntervalSec}s
                      </div>
                      {row.item.description ? (
                        <div className="nm-muted" style={{ fontSize: 12 }}>
                          {row.item.description}
                        </div>
                      ) : null}
                    </div>
                  </label>
                ))}
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

      <Dialog open={importResultOpen} onClose={() => setImportResultOpen(false)} title="导入结果明细">
        {!lastImportResult ? (
          <p className="nm-muted">暂无导入记录</p>
        ) : (
          <div style={{ display: "grid", gap: 12, maxHeight: "70vh", overflow: "auto" }}>
            <div className="nm-muted" style={{ fontSize: 13 }}>
              请求 {lastImportResult.requestedCount ?? "-"} · 来源{" "}
              {lastImportResult.importedFrom === "manual-selection" ? "手动选择" : "整包导入"} ·
              新增 {lastImportResult.createdCount} · 已存在 {lastImportResult.conflictCount} · 失败{" "}
              {lastImportResult.failedCount}
            </div>
            <section>
              <h3 style={{ margin: "0 0 6px", fontSize: 14 }}>新增成功</h3>
              {lastImportResult.created.length === 0 ? (
                <p className="nm-muted">无</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                  {lastImportResult.created.map((x) => (
                    <li key={`created-${x.id}`}>{x.name}（{x.kind}，{x.id.slice(0, 8)}…）</li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 style={{ margin: "0 0 6px", fontSize: 14 }}>已存在（冲突）</h3>
              {lastImportResult.conflicts.length === 0 ? (
                <p className="nm-muted">无</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                  {lastImportResult.conflicts.map((x) => (
                    <li key={`conflict-${x.id}`}>{x.name}（{x.kind}，{x.id.slice(0, 8)}…）</li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 style={{ margin: "0 0 6px", fontSize: 14 }}>失败明细</h3>
              {lastImportResult.failed.length === 0 ? (
                <p className="nm-muted">无</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                  {lastImportResult.failed.map((x, idx) => (
                    <li key={`failed-${idx}`}>{x.name}：{x.reason}</li>
                  ))}
                </ul>
              )}
            </section>
          </div>
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
