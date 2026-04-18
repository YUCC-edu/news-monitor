"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Skeleton } from "@/app/ui/skeleton";

type SettingsResp = {
  version: string;
  values: {
    DATABASE_URL: string;
    REDIS_URL: string;
    RSSHUB_BASE: string;
    WEWE_RSS_BASE: string;
    WEWE_RSS_AUTH_CODE: string;
    LLM_BASE_URL: string;
    LLM_CHAT_MODEL: string;
    LLM_EMBEDDING_MODEL: string;
  };
  secure: { llmApiKeySet: boolean; llmApiKeyMasked: string };
};

type QueueCounts = {
  waiting?: number;
  active?: number;
  completed?: number;
  failed?: number;
  delayed?: number;
  paused?: number;
} | null;

type SystemData = {
  env: {
    redis: { ok: boolean };
    rsshub: { ok: boolean };
    wewe: { ok: boolean };
  };
  queues: Record<string, QueueCounts>;
  backups: Array<{ name: string; sizeKB: number; mtime: string }>;
  node: { version: string; platform: string; uptimeSec: number };
};

type FormValues = SettingsResp["values"] & {
  LLM_API_KEY: string;
  clearLlmApiKey: boolean;
};

const EMPTY_FORM: FormValues = {
  DATABASE_URL: "",
  REDIS_URL: "",
  RSSHUB_BASE: "",
  WEWE_RSS_BASE: "",
  WEWE_RSS_AUTH_CODE: "",
  LLM_BASE_URL: "",
  LLM_CHAT_MODEL: "",
  LLM_EMBEDDING_MODEL: "",
  LLM_API_KEY: "",
  clearLlmApiKey: false,
};

function dot(ok: boolean | undefined, label?: string) {
  const color = ok ? "#2ba245" : ok === false ? "#ef4444" : "#5b6478";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
      {label ?? (ok ? "OK" : ok === false ? "FAIL" : "—")}
    </span>
  );
}

function inferAdvice(data: SystemData | null): string[] {
  if (!data) return [];
  const advice: string[] = [];
  if (!data.env.redis.ok) advice.push("Redis 不可用：先检查 REDIS_URL 与容器状态。");
  if (!data.env.rsshub.ok) advice.push("RSSHub 不可用：检查 RSSHUB_BASE、网络与服务日志。");
  if (!data.env.wewe.ok) advice.push("WeWe 不可用：检查 WEWE_RSS_BASE 与 AUTH_CODE。");
  const blocked = Object.entries(data.queues).filter(([, c]) => (c?.waiting ?? 0) > 100 || (c?.failed ?? 0) > 0);
  if (blocked.length > 0) advice.push("检测到队列积压或失败，请查看 worker 日志并确认 Redis 连通。");
  return advice;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [llmApiKeySet, setLlmApiKeySet] = useState(false);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [system, setSystem] = useState<SystemData | null>(null);

  const advice = useMemo(() => inferAdvice(system), [system]);

  async function loadSettings() {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/settings");
      if (!resp.ok) throw new Error(`加载设置失败（${resp.status}）`);
      const data = (await resp.json()) as SettingsResp;
      setVersion(data.version);
      setLlmApiKeySet(data.secure.llmApiKeySet);
      setForm({
        ...data.values,
        LLM_API_KEY: "",
        clearLlmApiKey: false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载设置失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadSystem() {
    try {
      const data = (await fetch("/api/system").then((r) => r.json())) as SystemData;
      setSystem(data);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void loadSettings();
    void loadSystem();
    const t = setInterval(() => void loadSystem(), 15000);
    return () => clearInterval(t);
  }, []);

  async function saveAll() {
    setSaving(true);
    setSaved(null);
    setError(null);
    try {
      const values = {
        DATABASE_URL: form.DATABASE_URL,
        REDIS_URL: form.REDIS_URL,
        RSSHUB_BASE: form.RSSHUB_BASE,
        WEWE_RSS_BASE: form.WEWE_RSS_BASE,
        WEWE_RSS_AUTH_CODE: form.WEWE_RSS_AUTH_CODE,
        LLM_BASE_URL: form.LLM_BASE_URL,
        LLM_CHAT_MODEL: form.LLM_CHAT_MODEL,
        LLM_EMBEDDING_MODEL: form.LLM_EMBEDDING_MODEL,
        ...(form.LLM_API_KEY.trim() ? { LLM_API_KEY: form.LLM_API_KEY.trim() } : {}),
      };
      const resp = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          values,
          version,
          clearLlmApiKey: form.clearLlmApiKey,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? `保存失败（${resp.status}）`);
      setVersion(data.version);
      setSaved("已保存到根目录 .env。请重启 web/worker 使新配置生效。");
      setForm((old) => ({ ...old, LLM_API_KEY: "", clearLlmApiKey: false }));
      setLlmApiKeySet(!form.clearLlmApiKey || !!form.LLM_API_KEY.trim());
      await loadSystem();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm((old) => ({ ...old, [key]: value }));
  }

  return (
    <div>
      <header style={{ display: "flex", alignItems: "baseline", marginBottom: 16 }}>
        <h1 className="nm-title">设置</h1>
        <span style={{ marginLeft: 12, color: "#5b6478", fontSize: 12 }}>
          Web 配置中心（保存到根目录 .env）
        </span>
        <button style={{ ...ghostBtn, marginLeft: "auto" }} onClick={() => void loadSystem()}>
          立即复测
        </button>
      </header>

      {loading ? (
        <div aria-busy="true" aria-label="加载中">
          <section style={{ ...cardStyle, marginBottom: 16 }}>
            <Skeleton style={{ height: 16, width: 56, marginBottom: 14 }} />
            <div style={gridStyle}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{ display: "grid", gap: 6 }}>
                  <Skeleton style={{ height: 12, width: 120 }} />
                  <Skeleton style={{ height: 40, width: "100%" }} />
                </div>
              ))}
            </div>
          </section>
          <section style={{ ...cardStyle, marginBottom: 16 }}>
            <Skeleton style={{ height: 16, width: 96, marginBottom: 14 }} />
            <div style={gridStyle}>
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} style={{ display: "grid", gap: 6 }}>
                  <Skeleton style={{ height: 12, width: 100 }} />
                  <Skeleton style={{ height: 40, width: "100%" }} />
                </div>
              ))}
            </div>
          </section>
          <section style={cardStyle}>
            <Skeleton style={{ height: 16, width: 120, marginBottom: 14 }} />
            <div style={gridStyle}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ display: "grid", gap: 6 }}>
                  <Skeleton style={{ height: 12, width: 140 }} />
                  <Skeleton style={{ height: 40, width: "100%" }} />
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <>
          {error && <div style={errorStyle}>{error}</div>}
          {saved && <div style={okStyle}>{saved}</div>}

          <section style={{ ...cardStyle, marginBottom: 16 }}>
            <h2 style={sectionTitle}>LLM</h2>
            <div style={gridStyle}>
              <Field label="LLM_BASE_URL" value={form.LLM_BASE_URL} onChange={(v) => update("LLM_BASE_URL", v)} />
              <Field label="LLM_CHAT_MODEL" value={form.LLM_CHAT_MODEL} onChange={(v) => update("LLM_CHAT_MODEL", v)} />
              <Field
                label="LLM_EMBEDDING_MODEL"
                value={form.LLM_EMBEDDING_MODEL}
                onChange={(v) => update("LLM_EMBEDDING_MODEL", v)}
              />
              <Field
                label={`LLM_API_KEY (${llmApiKeySet ? "已配置" : "未配置"})`}
                value={form.LLM_API_KEY}
                onChange={(v) => update("LLM_API_KEY", v)}
                type="password"
                placeholder="留空则不修改"
              />
              <label style={checkboxLine}>
                <input
                  type="checkbox"
                  checked={form.clearLlmApiKey}
                  onChange={(e) => update("clearLlmApiKey", e.target.checked)}
                />
                清空现有 LLM_API_KEY
              </label>
            </div>
          </section>

          <section style={{ ...cardStyle, marginBottom: 16 }}>
            <h2 style={sectionTitle}>队列与存储</h2>
            <div style={gridStyle}>
              <Field label="REDIS_URL" value={form.REDIS_URL} onChange={(v) => update("REDIS_URL", v)} />
              <Field label="DATABASE_URL" value={form.DATABASE_URL} onChange={(v) => update("DATABASE_URL", v)} />
            </div>
          </section>

          <section style={{ ...cardStyle, marginBottom: 16 }}>
            <h2 style={sectionTitle}>RSS 与公众号</h2>
            <div style={gridStyle}>
              <Field label="RSSHUB_BASE" value={form.RSSHUB_BASE} onChange={(v) => update("RSSHUB_BASE", v)} />
              <Field label="WEWE_RSS_BASE" value={form.WEWE_RSS_BASE} onChange={(v) => update("WEWE_RSS_BASE", v)} />
              <Field
                label="WEWE_RSS_AUTH_CODE"
                value={form.WEWE_RSS_AUTH_CODE}
                onChange={(v) => update("WEWE_RSS_AUTH_CODE", v)}
              />
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {form.RSSHUB_BASE && (
                <a href={form.RSSHUB_BASE} target="_blank" rel="noreferrer" style={linkBtn}>
                  打开 RSSHub
                </a>
              )}
              {form.WEWE_RSS_BASE && (
                <a href={`${form.WEWE_RSS_BASE.replace(/\/$/, "")}/dash`} target="_blank" rel="noreferrer" style={linkBtn}>
                  打开 WeWe 面板
                </a>
              )}
            </div>
          </section>

          <section style={{ ...cardStyle, marginBottom: 16 }}>
            <h2 style={sectionTitle}>运行情况</h2>
            {!system ? (
              <div style={muted}>暂无运行数据</div>
            ) : (
              <>
                <div style={statusRow}>
                  <div>Redis: {dot(system.env.redis.ok)}</div>
                  <div>RSSHub: {dot(system.env.rsshub.ok)}</div>
                  <div>WeWe: {dot(system.env.wewe.ok)}</div>
                </div>
                <div className="nm-table-wrap">
                  <table style={{ ...tableStyle, marginTop: 10 }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>队列</th>
                        <th style={thStyle}>waiting</th>
                        <th style={thStyle}>active</th>
                        <th style={thStyle}>failed</th>
                        <th style={thStyle}>delayed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(system.queues).map(([name, c]) => (
                        <tr key={name}>
                          <td style={tdStyle}>{name}</td>
                          <td style={tdStyle}>{c?.waiting ?? "—"}</td>
                          <td style={tdStyle}>{c?.active ?? "—"}</td>
                          <td style={{ ...tdStyle, color: (c?.failed ?? 0) > 0 ? "#ff8f8f" : "#cdd2dc" }}>{c?.failed ?? "—"}</td>
                          <td style={tdStyle}>{c?.delayed ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 10, color: "#cdd2dc", fontSize: 13 }}>
                  Node {system.node.version} · {system.node.platform} · 已运行 {Math.floor(system.node.uptimeSec / 60)} 分钟
                </div>
                {system.backups[0] && (
                  <div style={{ marginTop: 6, color: "#73809b", fontSize: 12 }}>
                    最近备份：{system.backups[0].name} · {system.backups[0].sizeKB} KB ·{" "}
                    {new Date(system.backups[0].mtime).toLocaleString("zh-CN")}
                  </div>
                )}
                {advice.length > 0 && (
                  <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "#ffbe7a", fontSize: 13 }}>
                    {advice.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button style={ghostBtn} onClick={() => void loadSettings()}>
              重载表单
            </button>
            <button style={saveBtn} disabled={saving} onClick={() => void saveAll()}>
              {saving ? "保存中..." : "保存全部"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label style={field}>
      <div style={fieldLabel}>{props.label}</div>
      <input
        type={props.type ?? "text"}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        style={fieldInput}
      />
    </label>
  );
}

const cardStyle: CSSProperties = {
  background: "#0f1522",
  border: "1px solid #252c3d",
  borderRadius: 10,
  padding: 14,
};
const sectionTitle: CSSProperties = { margin: "0 0 12px", fontSize: 14, color: "#cdd2dc" };
const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
  gap: 10,
};
const field: CSSProperties = { display: "grid", gap: 4 };
const fieldLabel: CSSProperties = { color: "#8fa1c3", fontSize: 12 };
const fieldInput: CSSProperties = {
  border: "1px solid #2a2f3d",
  borderRadius: 6,
  padding: "8px 10px",
  background: "#0c1019",
  color: "#d8deea",
  fontSize: 13,
};
const checkboxLine: CSSProperties = { color: "#cdd2dc", fontSize: 13, display: "flex", gap: 6, alignItems: "center" };
const saveBtn: CSSProperties = {
  border: "1px solid #3b82f6",
  borderRadius: 6,
  padding: "8px 14px",
  background: "#3b82f6",
  color: "#fff",
  cursor: "pointer",
  fontSize: 12,
};
const ghostBtn: CSSProperties = {
  border: "1px solid #2a2f3d",
  borderRadius: 6,
  padding: "8px 14px",
  background: "transparent",
  color: "#cdd2dc",
  cursor: "pointer",
  fontSize: 12,
};
const linkBtn: CSSProperties = {
  ...ghostBtn,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};
const statusRow: CSSProperties = { display: "flex", gap: 16, flexWrap: "wrap", color: "#cdd2dc", fontSize: 13 };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid #20283a",
  color: "#73809b",
  fontSize: 12,
  fontWeight: 500,
};
const tdStyle: CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #1d2333",
  color: "#cdd2dc",
  fontSize: 13,
};
const muted: CSSProperties = { color: "#5b6478" };
const errorStyle: CSSProperties = {
  marginBottom: 12,
  border: "1px solid #6b2b2b",
  borderRadius: 8,
  padding: "8px 10px",
  background: "rgba(128, 43, 43, 0.25)",
  color: "#ffc9c9",
  fontSize: 13,
};
const okStyle: CSSProperties = {
  marginBottom: 12,
  border: "1px solid #285f3c",
  borderRadius: 8,
  padding: "8px 10px",
  background: "rgba(35, 88, 57, 0.25)",
  color: "#b8f2ca",
  fontSize: 13,
};
