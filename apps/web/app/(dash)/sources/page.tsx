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
          <Button disabled={submitting} variant="primary" onClick={() => void addSource()}>
            {submitting ? "创建中..." : "新增信源"}
          </Button>
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
