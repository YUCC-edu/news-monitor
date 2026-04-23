"use client";

import { useEffect, useState } from "react";
import { Select } from "@/app/ui/select";

type SourceRow = { id: string; name: string; kind: string };
type QueueCounts = {
  waiting?: number;
  active?: number;
  completed?: number;
  failed?: number;
  delayed?: number;
  paused?: number;
} | null;
type SystemSummary = {
  queues: Record<string, QueueCounts>;
  env: { redis: { ok: boolean }; rsshub: { ok: boolean }; wewe: { ok: boolean } };
};
type HealthSummary = Array<{ failCount: number; pipeline24hRate: number | null }>;

export default function OpsPage() {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [scope, setScope] = useState<"source" | "window" | "item">("source");
  const [sourceId, setSourceId] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [itemId, setItemId] = useState("");
  const [limit, setLimit] = useState("200");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sys, setSys] = useState<SystemSummary | null>(null);
  const [health, setHealth] = useState<HealthSummary>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sources")
      .then((r) => r.json())
      .then((list: SourceRow[]) => {
        if (!cancelled && Array.isArray(list)) {
          setSources(list);
          setSourceId((prev) => prev || list[0]?.id || "");
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/system").then((r) => r.json()), fetch("/api/health").then((r) => r.json())])
      .then(([s, h]) => {
        if (cancelled) return;
        setSys(s as SystemSummary);
        setHealth((Array.isArray(h) ? h : []) as HealthSummary);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const lim = Number.parseInt(limit, 10);
      const res = await fetch("/api/ops/re-enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          sourceId: scope === "source" ? sourceId : undefined,
          since: since || undefined,
          until: until || undefined,
          itemId: scope === "item" ? itemId.trim() : undefined,
          limit: Number.isFinite(lim) ? lim : 200,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; queued?: number; error?: string };
      if (!res.ok) {
        setMsg(data.error ?? `请求失败 (${res.status})`);
        return;
      }
      setMsg(`已入队 enrich：${data.queued ?? 0} 条`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "请求失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <h1 className="nm-title">运维</h1>
        <p className="nm-muted" style={{ fontSize: 13, marginTop: 8, maxWidth: 640 }}>
          按设计 §7.4 提供三粒度「重新 enrich」入队（单次最多 500 条）。队列失败重试仍可用根目录脚本{" "}
          <code style={{ fontSize: 12 }}>scripts/retry-enrich-failed.ts</code>。
        </p>
      </header>

      <div
        style={{
          maxWidth: 520,
          display: "grid",
          gap: 12,
          padding: 16,
          border: "1px solid var(--border)",
          borderRadius: 10,
          background: "var(--bg-1)",
        }}
      >
        <label style={{ fontSize: 12, color: "var(--fg-2)" }}>
          粒度
          <Select
            aria-label="粒度"
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
            style={{ marginTop: 6, width: "100%" }}
          >
            <option value="source">按信源</option>
            <option value="window">按时间窗（COALESCE 发布时间, 抓取时间)）</option>
            <option value="item">单条 item</option>
          </Select>
        </label>

        {scope === "source" ? (
          <label style={{ fontSize: 12, color: "var(--fg-2)" }}>
            信源
            <Select
              aria-label="信源"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              style={{ marginTop: 6, width: "100%" }}
            >
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.kind})
                </option>
              ))}
            </Select>
          </label>
        ) : null}

        {scope === "window" ? (
          <>
            <label style={{ fontSize: 12, color: "var(--fg-2)" }}>
              since（ISO 可选）
              <input
                value={since}
                onChange={(e) => setSince(e.target.value)}
                placeholder="2026-04-01T00:00:00.000Z"
                style={field}
              />
            </label>
            <label style={{ fontSize: 12, color: "var(--fg-2)" }}>
              until（ISO 可选）
              <input
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                placeholder="2026-04-19T23:59:59.999Z"
                style={field}
              />
            </label>
          </>
        ) : null}

        {scope === "item" ? (
          <label style={{ fontSize: 12, color: "var(--fg-2)" }}>
            item UUID
            <input
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              placeholder="条目 id"
              style={field}
            />
          </label>
        ) : null}

        <label style={{ fontSize: 12, color: "var(--fg-2)" }}>
          最大条数（1–500）
          <input
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            style={field}
          />
        </label>

        <button type="button" disabled={busy} onClick={() => void submit()} style={btn}>
          {busy ? "提交中…" : "确认入队"}
        </button>
        {msg ? <div style={{ fontSize: 13, color: "var(--fg-1)" }}>{msg}</div> : null}
      </div>

      <section style={{ marginTop: 16, border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 15 }}>异常处理路径（发现 → 定位 → 修复）</h2>
        <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8, fontSize: 13, color: "var(--fg-1)" }}>
          <li>
            发现：先看 settings/health 红点，关注队列 <code>failed/waiting</code> 是否增长。
          </li>
          <li>
            定位：仓库根目录执行 <code>pnpm run queue:inspect -- --recent-minutes 30</code>，看 category 与 remediation。
          </li>
          <li>
            修复：按 runbook 修配置后重启 Worker，再执行 <code>pnpm run queue:retry-fetch</code> /{" "}
            <code>pnpm run queue:retry-enrich</code>。
          </li>
          <li>
            验证：再次 <code>queue:inspect</code>，确认 failed 不增长；health 页查看 pipeline24hRate 回升。
          </li>
        </ol>
      </section>

      <section style={{ marginTop: 16, border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 15 }}>SLO 基线（当前快照）</h2>
        <div style={{ fontSize: 13, color: "var(--fg-1)", display: "grid", gap: 6 }}>
          <div>
            依赖可达：Redis {sys?.env.redis.ok ? "OK" : "FAIL"} / RSSHub {sys?.env.rsshub.ok ? "OK" : "FAIL"} / WeWe{" "}
            {sys?.env.wewe.ok ? "OK" : "FAIL"}
          </div>
          <div>
            队列失败总量：{" "}
            {sys
              ? Object.values(sys.queues).reduce((acc, q) => acc + (q?.failed ?? 0), 0)
              : "—"}
          </div>
          <div>
            队列积压总量（waiting）：{" "}
            {sys
              ? Object.values(sys.queues).reduce((acc, q) => acc + (q?.waiting ?? 0), 0)
              : "—"}
          </div>
          <div>
            抓取后 24h 富化率均值：{" "}
            {health.length
              ? `${Math.round(
                  (health.reduce((acc, r) => acc + (r.pipeline24hRate ?? 0), 0) / health.length) * 1000,
                ) / 10}%`
              : "—"}
          </div>
          <div>演练清单：Redis断连 / LLM404 / WeWe401 / RSSHub超时 / 历史failed残留（每周至少一次）。</div>
        </div>
      </section>

      <section style={{ marginTop: 16, border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 15 }}>聚类/分类质量巡检</h2>
        <div style={{ fontSize: 13, color: "var(--fg-1)", display: "grid", gap: 8 }}>
          <div>
            每日执行：<code>pnpm run quality:eval -- --days 7</code>
          </div>
          <div>
            重点关注：多信源簇占比、splitRiskClusters、taxonomyCoverage、named_cluster_ratio。
          </div>
          <div>
            处理策略：先调 taxonomy（词典/黑名单）→ 再调 Hybrid Score 权重（<code>CLUSTER_SCORE_W_*</code>）→ 最后调聚类阈值。
          </div>
        </div>
      </section>
    </div>
  );
}

const field: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 6,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-0)",
  color: "var(--fg-0)",
};

const btn: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "1px solid #2f4573",
  background: "#1c2a4a",
  color: "#dbeafe",
  cursor: "pointer",
};
