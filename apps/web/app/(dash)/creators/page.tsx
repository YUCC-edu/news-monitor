"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/app/ui/button";
import { Card } from "@/app/ui/card";
import { Dialog } from "@/app/ui/dialog";
import { Input } from "@/app/ui/input";
import { Select } from "@/app/ui/select";
import { SourceAvatar } from "@/app/ui/source-avatar";
import { Tabs } from "@/app/ui/tabs";
import { Switch } from "@/app/ui/switch";
import { Skeleton } from "@/app/ui/skeleton";
import { useToast } from "@/app/ui/toast-context";
import { readJsonResponse } from "@/lib/read-json-response";

type CreatorKind = "x-rsshub" | "wechat-wewe";

type SourceRow = {
  id: string;
  kind: string;
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

type ItemCount = { sourceId: string; count: number };

const PLATFORM_LABEL: Record<CreatorKind, string> = {
  "x-rsshub": "X 博主",
  "wechat-wewe": "公众号",
};

function formatZhDateTime(raw: string | null | undefined) {
  if (!raw) return "从未";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "从未";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function wechatSubtitle(cfg: Record<string, unknown>): string {
  const feedUrl = typeof cfg.feedUrl === "string" ? cfg.feedUrl.trim() : "";
  const mpId = typeof cfg.mpId === "string" ? cfg.mpId.trim() : "";
  const s = feedUrl || mpId;
  if (!s) return "公众号";
  return s.length > 44 ? `${s.slice(0, 42)}…` : s;
}

/** Human-readable "time since last successful fetch" for diagnostics. */
function formatAgo(iso: string | null): string {
  if (!iso) return "尚无";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "未知";
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return "刚刚";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} 小时前`;
  const days = Math.floor(h / 24);
  return `${days} 天前`;
}

export default function CreatorsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  /** After first fetch (success or fail); avoids full-page skeleton on background refresh. */
  const [bootstrapped, setBootstrapped] = useState(false);
  const [tab, setTab] = useState<"all" | CreatorKind>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [addKind, setAddKind] = useState<CreatorKind>("x-rsshub");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [weweFeedUrl, setWeweFeedUrl] = useState("");
  const [accountName, setAccountName] = useState("");
  const [intervalSec, setIntervalSec] = useState(300);
  const [initialDays, setInitialDays] = useState(1);
  const [maxAgeDays, setMaxAgeDays] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictExisting, setConflictExisting] = useState<SourceRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sourcesRes, countsRes] = await Promise.all([
        readJsonResponse<SourceRow[]>(await fetch("/api/sources"), "/api/sources"),
        readJsonResponse<ItemCount[]>(
          await fetch("/api/creators/counts"),
          "/api/creators/counts",
        ),
      ]);
      setRows(Array.isArray(sourcesRes) ? sourcesRes : []);
      const map: Record<string, number> = {};
      if (Array.isArray(countsRes)) {
        for (const c of countsRes) map[c.sourceId] = c.count;
      }
      setCounts(map);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast(msg);
      setRows([]);
      setCounts({});
    } finally {
      setLoading(false);
      setBootstrapped(true);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => {
      reloadTimer.current = null;
      void load();
    }, 600);
  }, [load]);

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.addEventListener("sources.changed", () => {
      void load();
    });
    es.addEventListener("item.created", () => {
      scheduleReload();
    });
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    const interval = window.setInterval(() => void load(), 45_000);
    return () => {
      es.close();
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(interval);
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    };
  }, [load, scheduleReload]);

  const creators = useMemo(
    () =>
      rows.filter(
        (r) => r.kind === "x-rsshub" || r.kind === "wechat-wewe",
      ) as (SourceRow & { kind: CreatorKind })[],
    [rows],
  );

  const filtered = useMemo(() => {
    if (tab === "all") return creators;
    return creators.filter((c) => c.kind === tab);
  }, [creators, tab]);

  const countByKind = useMemo(() => {
    const m: Record<string, number> = { "x-rsshub": 0, "wechat-wewe": 0 };
    for (const c of creators) m[c.kind] = (m[c.kind] ?? 0) + 1;
    return m;
  }, [creators]);

  const otherSourceCount = useMemo(
    () => rows.filter((r) => r.kind !== "x-rsshub" && r.kind !== "wechat-wewe").length,
    [rows],
  );

  async function checkDedupForAdd() {
    const config =
      addKind === "x-rsshub"
        ? { handle: handle.replace(/^@/, "").trim(), displayName: displayName.trim() || undefined }
        : { feedUrl: weweFeedUrl.trim(), accountName: accountName.trim() || undefined };
    const r = await fetch("/api/sources/check-dedup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: addKind, config }),
    });
    const j = (await r.json()) as { existing: SourceRow | null };
    return j.existing;
  }

  async function addCreator() {
    setSubmitting(true);
    try {
      let name: string;
      let config: Record<string, unknown>;
      if (addKind === "x-rsshub") {
        const h = handle.replace(/^@/, "").trim();
        if (!h) return;
        name = displayName.trim() || `@${h}`;
        config = { handle: h, displayName: displayName.trim() || undefined };
      } else {
        if (!weweFeedUrl.trim()) return;
        name = accountName.trim() || "公众号";
        config = {
          feedUrl: weweFeedUrl.trim(),
          accountName: accountName.trim() || undefined,
        };
      }
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: addKind,
          name,
          config,
          fetchIntervalSec: intervalSec,
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
      setHandle("");
      setDisplayName("");
      setWeweFeedUrl("");
      setAccountName("");
      setInitialDays(1);
      setShowAdd(false);
      toast("已添加订阅");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleEnabled(row: SourceRow) {
    await fetch(`/api/sources/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: row.kind,
        name: row.name,
        config: row.config,
        enabled: !row.enabled,
        fetchIntervalSec: row.fetchIntervalSec,
        initialFetchDays: row.initialFetchDays,
        maxItemAgeDays: row.maxItemAgeDays,
      }),
    });
    await load();
  }

  async function runNow(id: string) {
    await fetch(`/api/sources/${id}`, { method: "POST" });
    toast("已排队抓取");
  }

  async function remove(id: string) {
    if (!confirm("确认删除该博主订阅？")) return;
    await fetch(`/api/sources/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1 className="nm-title">博主订阅</h1>
          <span className="nm-muted">X · 公众号</span>
        </div>
        <Button variant="primary" onClick={() => setShowAdd(true)}>
          + 新增
        </Button>
      </header>

      <Tabs
        tabs={[
          { id: "all", label: `全部 ${creators.length}` },
          { id: "x-rsshub", label: `X ${countByKind["x-rsshub"] ?? 0}` },
          { id: "wechat-wewe", label: `公众号 ${countByKind["wechat-wewe"] ?? 0}` },
        ]}
        value={tab}
        onChange={(id) => setTab(id as typeof tab)}
      />

      <div style={{ height: 16 }} />

      {showAdd && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gap: 12 }}>
            <label className="nm-label">
              平台
              <Select value={addKind} onChange={(e) => setAddKind(e.target.value as CreatorKind)}>
                <option value="x-rsshub">X（RSSHub）</option>
                <option value="wechat-wewe">公众号（WeWe-RSS）</option>
              </Select>
            </label>
            {addKind === "x-rsshub" ? (
              <>
                <label className="nm-label">
                账号
                  <Input
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="@OpenAI 或 OpenAI"
                    onBlur={() => void checkDedupForAdd()}
                  />
                </label>
                <label className="nm-label">
                  展示名（可选）
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="OpenAI 官方"
                  />
                </label>
              </>
            ) : (
              <>
                <label className="nm-label">
                  订阅地址
                  <Input
                    value={weweFeedUrl}
                    onChange={(e) => setWeweFeedUrl(e.target.value)}
                    placeholder="http://127.0.0.1:4000/feeds/MP_WXS_xxxx.atom"
                    onBlur={() => void checkDedupForAdd()}
                  />
                  <span className="nm-muted" style={{ fontSize: 12, marginTop: 4, display: "block" }}>
                    控制台里的「/dash/feeds/MP_…」是页面地址；WeWe 服务端 Atom 在「/feeds/MP_….atom」。你可任填其一，抓取时会统一成后者（与 Wander 等阅读器后台实际请求一致）。
                  </span>
                </label>
                <label className="nm-label">
                  账号名
                  <Input
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="量子位"
                  />
                </label>
              </>
            )}
            <label className="nm-label">
              抓取间隔（秒）
              <Input
                type="number"
                min={60}
                value={intervalSec}
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
                仅保留最近 N 天
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
            {addKind === "wechat-wewe" ? (
              <p className="nm-muted" style={{ fontSize: 12, margin: "0 0 8px", lineHeight: 1.5 }}>
                说明：新公众号若回溯设得较短、而文章发布时间略旧，会出现「能拉取但 0
                条入库」；早期添加的博主（如回溯更大）则正常。Worker 在公众号 / RSS
                首次成功拉取时，若有效回溯小于 7 天且条目全被时间窗滤掉，会自动按 7
                天再算一次。
              </p>
            ) : null}
            <div style={{ display: "flex", gap: 8 }}>
              <Button disabled={submitting} variant="primary" onClick={() => void addCreator()}>
                {submitting ? "创建中..." : "确认订阅"}
              </Button>
              <Button variant="ghost" onClick={() => setShowAdd(false)}>
                取消
              </Button>
            </div>
          </div>
        </Card>
      )}

      {!bootstrapped && loading ? (
        <div aria-busy="true" aria-label="加载中">
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <Skeleton style={{ height: 36, width: 100, borderRadius: 8 }} />
            <Skeleton style={{ height: 36, width: 72, borderRadius: 8 }} />
            <Skeleton style={{ height: 36, width: 96, borderRadius: 8 }} />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
              gap: 12,
            }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} style={{ width: "100%", justifySelf: "stretch" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Skeleton style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Skeleton style={{ height: 16, width: "72%", marginBottom: 8 }} />
                    <Skeleton style={{ height: 12, width: "55%" }} />
                  </div>
                  <Skeleton style={{ height: 22, width: 44, flexShrink: 0 }} />
                </div>
                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                  }}
                >
                  <Skeleton style={{ height: 12 }} />
                  <Skeleton style={{ height: 12 }} />
                  <Skeleton style={{ height: 12 }} />
                  <Skeleton style={{ height: 12 }} />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <Skeleton style={{ height: 32, flex: 1, maxWidth: 120 }} />
                  <Skeleton style={{ height: 32, width: 56 }} />
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : creators.length === 0 && otherSourceCount > 0 ? (
        <div
          className="nm-card"
          style={{
            textAlign: "left",
            color: "var(--fg-2)",
            padding: "20px 16px",
            lineHeight: 1.6,
          }}
        >
          <p style={{ margin: "0 0 12px" }}>
            博主订阅仅包含 <strong>X（RSSHub）</strong> 与 <strong>公众号（WeWe）</strong>。
            你当前还有 {otherSourceCount} 个其它类型信源（如 RSS/HN），不会出现在本页。
          </p>
          <Link href="/sources" style={{ color: "var(--fg-0)", textDecoration: "underline" }}>
            前往信源管理
          </Link>
          <span style={{ color: "var(--fg-3)", margin: "0 8px" }}>·</span>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            style={{
              background: "none",
              border: 0,
              color: "var(--fg-0)",
              cursor: "pointer",
              textDecoration: "underline",
              padding: 0,
              font: "inherit",
            }}
          >
            在此添加博主
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="nm-empty-state">
          {creators.length === 0
            ? "还没有订阅，点右上角「新增」"
            : "当前标签下暂无订阅"}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
            gap: 12,
          }}
        >
          {filtered.map((row) => {
            const kind = row.kind as CreatorKind;
            const displayNameVal =
              (row.config as { displayName?: string; accountName?: string })?.displayName ??
              (row.config as { accountName?: string })?.accountName ??
              row.name;
            const subTitle =
              kind === "x-rsshub"
                ? `@${(row.config as { handle?: string })?.handle ?? ""}`
                : wechatSubtitle(row.config as Record<string, unknown>);
            const status = row.lastError
              ? `失败 ×${row.failCount}`
              : row.lastOkAt
                ? "正常"
                : "未抓取";
            return (
              <Card key={row.id} style={{ width: "100%", justifySelf: "stretch" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <SourceAvatar
                    source={{
                      kind: row.kind,
                      name: row.name,
                      config: row.config,
                    }}
                    size={40}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        color: "var(--fg-0)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {displayNameVal}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--fg-2)" }}>
                      {PLATFORM_LABEL[kind]} · {subTitle}
                    </div>
                  </div>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 11,
                      color: "var(--fg-2)",
                    }}
                  >
                    <Switch checked={row.enabled} onChange={() => void toggleEnabled(row)} />
                    启用
                  </label>
                </div>
                <div
                  style={{
                    marginTop: 10,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 6,
                    fontSize: 12,
                    color: "var(--fg-2)",
                  }}
                >
                  <div>最近成功：{formatZhDateTime(row.lastOkAt)}</div>
                  <div>距今：{formatAgo(row.lastOkAt)}</div>
                  <div>条数：{counts[row.id] ?? 0}</div>
                  <div>间隔：{row.fetchIntervalSec}s</div>
                  <div>状态：{status}</div>
                  <div>
                    回溯 {row.initialFetchDays ?? "默认"} 天 · 保留{" "}
                    {row.maxItemAgeDays == null ? "不限" : `${row.maxItemAgeDays} 天`}
                  </div>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--fg-3)", lineHeight: 1.5 }}>
                  长期无新条请查 WeWe / RSSHub 是否已同步；抓取失败请看{" "}
                  <Link href="/health" style={{ color: "var(--fg-1)", textDecoration: "underline" }}>
                    信源健康
                  </Link>
                  。
                </div>
                {row.lastError && (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 11,
                      color: "var(--danger)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={row.lastError}
                  >
                    {row.lastError}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <Button size="sm" variant="ghost" onClick={() => void runNow(row.id)}>
                    立即抓一次
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void remove(row.id)}>
                    删除
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={conflictOpen} onClose={() => setConflictOpen(false)} title="已存在">
        <p style={{ color: "var(--fg-1)", fontSize: 14 }}>
          {conflictExisting?.name} 已订阅同一账号/Feed。
        </p>
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
          <Button variant="primary" onClick={() => setConflictOpen(false)}>
            知道了
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
