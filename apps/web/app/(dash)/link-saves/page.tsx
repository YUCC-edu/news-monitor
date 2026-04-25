"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/app/ui/button";
import { Card } from "@/app/ui/card";
import { Input } from "@/app/ui/input";
import { SourceAvatar } from "@/app/ui/source-avatar";
import { Switch } from "@/app/ui/switch";
import { useToast } from "@/app/ui/toast-context";
import { readJsonResponse } from "@/lib/read-json-response";

type LinkSourceRow = {
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

function formatZhDateTime(raw: string | null | undefined) {
  if (!raw) return "从未";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "未知";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function formatAgo(iso: string | null) {
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

function getFeedUrl(config: Record<string, unknown>) {
  return typeof config.feedUrl === "string" ? config.feedUrl : "";
}

function getOriginLabel(config: Record<string, unknown>) {
  if (config.origin === "link-saves") return "博主信源";
  return "信源";
}

function getDisplayName(row: LinkSourceRow) {
  const note = typeof row.config.note === "string" ? row.config.note.trim() : "";
  return note || row.name;
}

export default function LinkSavesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<LinkSourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await readJsonResponse<LinkSourceRow[]>(await fetch("/api/user-links"), "/api/user-links");
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const aTime = a.lastOkAt ? new Date(a.lastOkAt).getTime() : 0;
        const bTime = b.lastOkAt ? new Date(b.lastOkAt).getTime() : 0;
        return bTime - aTime || a.name.localeCompare(b.name, "zh-CN");
      }),
    [rows],
  );

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const nextUrl = url.trim();
    if (!nextUrl) return;
    setSaving(true);
    try {
      const res = await fetch("/api/user-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: nextUrl,
          name: name.trim() || null,
        }),
      });
      if (res.status === 409) {
        const payload = (await res.json()) as { existing?: LinkSourceRow };
        toast(payload.existing ? "这个信源已在库中" : "这个信源已存在");
        await load();
        return;
      }
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "创建信源失败");
      }
      setUrl("");
      setName("");
      toast("已创建信源");
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/user-links/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast("删除失败");
      return;
    }
    toast("已删除信源");
    await load();
  }

  async function runNow(id: string) {
    setRunning(id);
    try {
      const res = await fetch(`/api/sources/${id}`, { method: "POST" });
      if (!res.ok) {
        throw new Error("触发抓取失败");
      }
      toast("已触发抓取");
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <header style={{ display: "grid", gap: 10, maxWidth: 820 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1 className="nm-title">博主信源</h1>
          <span className="nm-muted">保存后直接成为 source，进入抓取、总编台和热点计算</span>
        </div>
        <p className="nm-muted" style={{ margin: 0, lineHeight: 1.7 }}>
          这里不再是纯链接收藏。添加进来的每一条，都会作为真实信源进入数据管线，参与抓取、聚类和热点发现。
        </p>
      </header>

      <Card style={{ display: "grid", gap: 12 }}>
        <form onSubmit={(event) => void add(event)} style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
              gap: 12,
            }}
          >
            <label className="nm-label">
              信源地址
              <Input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/rss.xml"
              />
            </label>
            <label className="nm-label">
              名称（可选）
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：某博主 / 某专栏"
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Button type="submit" variant="primary" disabled={saving || !url.trim()}>
              {saving ? "创建中..." : "创建为 source"}
            </Button>
            <span className="nm-muted" style={{ fontSize: 13 }}>
              也可以先留空名称，系统会按域名自动命名。
            </span>
          </div>
        </form>
      </Card>

      {loading ? (
        <div className="nm-empty-state">加载中...</div>
      ) : sortedRows.length === 0 ? (
        <div className="nm-empty-state">暂无已保存的博主信源</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
            gap: 12,
          }}
        >
          {sortedRows.map((row) => {
            const feedUrl = getFeedUrl(row.config);
            const status = row.lastError
              ? `失败 × ${row.failCount}`
              : row.lastOkAt
                ? "正常"
                : "未抓取";
            return (
              <Card key={row.id} style={{ display: "grid", gap: 12, height: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <SourceAvatar
                    source={{ kind: row.kind, name: row.name, config: row.config }}
                    size={40}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        color: "var(--fg-0)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {getDisplayName(row)}
                    </div>
                    <div className="nm-muted" style={{ fontSize: 12 }}>
                      {getOriginLabel(row.config)} · {status}
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 8, color: "var(--fg-2)", fontSize: 12, lineHeight: 1.6 }}>
                  <div>
                    <span className="nm-muted">信源地址：</span>
                    <a href={feedUrl || "#"} target="_blank" rel="noreferrer" style={{ color: "var(--fg-0)" }}>
                      {feedUrl || "未配置"}
                    </a>
                  </div>
                  <div>
                    <span className="nm-muted">最近成功：</span>
                    {formatZhDateTime(row.lastOkAt)}
                    <span className="nm-muted">（{formatAgo(row.lastOkAt)}）</span>
                  </div>
                  <div>
                    <span className="nm-muted">抓取间隔：</span>
                    {row.fetchIntervalSec}s
                  </div>
                  <div>
                    <span className="nm-muted">回溯：</span>
                    {row.initialFetchDays ?? "默认"} 天
                    <span className="nm-muted"> · 保留：</span>
                    {row.maxItemAgeDays == null ? "不限" : `${row.maxItemAgeDays} 天`}
                  </div>
                  {row.lastError ? (
                    <div
                      title={row.lastError}
                      style={{
                        color: "var(--danger)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.lastError}
                    </div>
                  ) : null}
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--fg-2)" }}>
                    <Switch
                      checked={row.enabled}
                      onChange={async () => {
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
                      }}
                    />
                    启用
                  </label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <Button size="sm" variant="ghost" onClick={() => void runNow(row.id)} disabled={running === row.id}>
                      {running === row.id ? "抓取中..." : "立即抓取"}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => void remove(row.id)}>
                      删除
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="nm-muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
        需要更系统地管理信源，可以去{" "}
        <Link href="/sources" style={{ color: "var(--fg-0)", textDecoration: "underline" }}>
          信源库
        </Link>
        。
      </div>
    </div>
  );
}
