"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useAppearance } from "@/app/ui/appearance-provider";
import { Skeleton } from "@/app/ui/skeleton";

type SettingsResp = {
  version: string;
  values: {
    DATABASE_URL: string;
    REDIS_URL: string;
    RSSHUB_BASE: string;
    WEWE_RSS_BASE: string;
    WEWE_RSS_AUTH_CODE: string;
    AI_MODE: "core" | "llm" | "agent";
    LLM_BASE_URL: string;
    LLM_CHAT_MODEL: string;
    LLM_EMBEDDING_MODEL: string;
    LLM_CONCURRENCY: string;
    LLM_DAILY_REQUEST_BUDGET: string;
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
    llm: {
      mode: "core" | "llm" | "agent";
      enabled: boolean;
      hasKey: boolean;
      concurrency: number;
      dailyRequestBudget: number;
    };
  };
  queues: Record<string, QueueCounts>;
  queueLatestFailed?: Record<
    string,
    { jobId: string; failedReason: string; attemptsMade: number; finishedOn: number | null } | null
  >;
  queueLatestCompleted?: Record<
    string,
    { jobId: string; returnvalue: unknown; finishedOn: number | null } | null
  >;
  dataHealth: {
    sources: number;
    enabledSources: number;
    items: number;
    enrichments: number;
    clusters: number;
    orphanClusters: number;
  } | null;
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
  AI_MODE: "core",
  LLM_BASE_URL: "",
  LLM_CHAT_MODEL: "",
  LLM_EMBEDDING_MODEL: "",
  LLM_CONCURRENCY: "2",
  LLM_DAILY_REQUEST_BUDGET: "500",
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

function inferAdvice(data: SystemData | null, previous: SystemData | null): string[] {
  if (!data) return [];
  const advice: string[] = [];
  if (!data.env.redis.ok) advice.push("Redis 不可用：先检查 REDIS_URL 与容器状态。");
  if (!data.env.rsshub.ok) advice.push("RSSHub 不可用：检查 RSSHUB_BASE、网络与服务日志。");
  if (!data.env.wewe.ok) advice.push("WeWe 不可用：检查 WEWE_RSS_BASE 与 AUTH_CODE。");
  if ((data.dataHealth?.orphanClusters ?? 0) > 0) {
    advice.push(
      `数据清理需关注：当前有 ${data.dataHealth?.orphanClusters ?? 0} 个孤立聚类。可执行 retention 任务或 cleanupOrphanClusters 清理。`,
    );
  }
  const queueIssues = Object.entries(data.queues).filter(([name, c]) => {
    const waiting = c?.waiting ?? 0;
    const failed = c?.failed ?? 0;
    const prevFailed = previous?.queues?.[name]?.failed ?? 0;
    const increasingFast = failed > prevFailed;
    return waiting > 100 || failed >= 10 || increasingFast;
  });
  if (queueIssues.length > 0) {
    const detail = queueIssues
      .map(([name, c]) => {
        const bits: string[] = [];
        if ((c?.waiting ?? 0) > 100) bits.push(`waiting=${c?.waiting ?? 0}（积压）`);
        const prevFailed = previous?.queues?.[name]?.failed ?? 0;
        if ((c?.failed ?? 0) > 0) {
          const delta = (c?.failed ?? 0) - prevFailed;
          bits.push(`failed=${c?.failed ?? 0}${delta > 0 ? `（+${delta}）` : ""}`);
        }
        return `${name}（${bits.join("，")}）`;
      })
      .join("；");
    advice.push(
      `队列需关注：${detail}。判断策略：waiting>100、failed>=10、或 failed 相比上次轮询仍在增长。请先执行 pnpm run queue:inspect（必要时加 -- --recent-minutes 30）查看实时失败聚类；完整步骤见 docs/runbooks/queue-failed-jobs.md。修正后重启 Worker，再执行 pnpm run queue:retry-fetch / queue:retry-enrich；仅清历史可用 scripts/clean-failed-jobs.ts --queue <名> --apply。Redis 绿灯只代表连通，不代表队列无故障增长。`,
    );
  }
  return advice;
}

export default function SettingsPage() {
  const { locale, theme, setLocale, setTheme, copy } = useAppearance();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [llmApiKeySet, setLlmApiKeySet] = useState(false);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [system, setSystem] = useState<SystemData | null>(null);
  const [prevSystem, setPrevSystem] = useState<SystemData | null>(null);
  const systemRef = useRef<SystemData | null>(null);

  const advice = useMemo(() => inferAdvice(system, prevSystem), [system, prevSystem]);
  const failureHighlights = useMemo(() => {
    if (!system?.queueLatestFailed) return [];
    return Object.entries(system.queueLatestFailed)
      .filter(([, v]) => !!v)
      .map(([name, v]) => ({ name, row: v! }))
      .slice(0, 4);
  }, [system]);

  const loadSettings = useCallback(async () => {
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
  }, []);

  const loadSystem = useCallback(async () => {
    try {
      const data = (await fetch("/api/system").then((r) => r.json())) as SystemData;
      setPrevSystem(systemRef.current);
      systemRef.current = data;
      setSystem(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadSettings();
    void loadSystem();
  }, [loadSettings, loadSystem]);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void loadSystem();
    }, 30000);
    return () => clearInterval(t);
  }, [loadSystem]);

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
        AI_MODE: form.AI_MODE,
        LLM_BASE_URL: form.LLM_BASE_URL,
        LLM_CHAT_MODEL: form.LLM_CHAT_MODEL,
        LLM_EMBEDDING_MODEL: form.LLM_EMBEDDING_MODEL,
        LLM_CONCURRENCY: form.LLM_CONCURRENCY,
        LLM_DAILY_REQUEST_BUDGET: form.LLM_DAILY_REQUEST_BUDGET,
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
            <h2 style={sectionTitle}>{copy.appearanceLabel}</h2>
            <div style={{ ...muted, marginBottom: 10, fontSize: 13 }}>
              {locale === "zh-CN"
                ? "这里控制界面语言和主题。中文模式优先显示 titleZh/contentZh，英文模式优先显示原文。"
                : "Control interface language and theme here. Chinese mode prefers titleZh/contentZh, English mode prefers the original text."}
            </div>
            <div style={gridStyle}>
              <label style={field}>
                <div style={fieldLabel}>{copy.languageLabel}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" style={locale === "zh-CN" ? solidBtn : ghostBtn} onClick={() => setLocale("zh-CN")}>
                    {copy.languageChinese}
                  </button>
                  <button type="button" style={locale === "en-US" ? solidBtn : ghostBtn} onClick={() => setLocale("en-US")}>
                    {copy.languageEnglish}
                  </button>
                </div>
              </label>
              <label style={field}>
                <div style={fieldLabel}>{copy.themeLabel}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" style={theme === "dark" ? solidBtn : ghostBtn} onClick={() => setTheme("dark")}>
                    {copy.themeDark}
                  </button>
                  <button type="button" style={theme === "light" ? solidBtn : ghostBtn} onClick={() => setTheme("light")}>
                    {copy.themeLight}
                  </button>
                  <button type="button" style={theme === "paper" ? solidBtn : ghostBtn} onClick={() => setTheme("paper")}>
                    {copy.themePaper}
                  </button>
                </div>
              </label>
            </div>
          </section>

          <section style={{ ...cardStyle, marginBottom: 16 }}>
            <h2 style={sectionTitle}>LLM</h2>
            {system ? (
              <div style={{ ...muted, marginBottom: 10, fontSize: 13 }}>
                AI_MODE={system.env.llm.mode} · LLM {system.env.llm.enabled ? "enabled" : "optional/off"} · budget{" "}
                {system.env.llm.dailyRequestBudget}/day
              </div>
            ) : null}
            <div style={gridStyle}>
              <label style={field}>
                <div style={fieldLabel}>AI_MODE</div>
                <select
                  value={form.AI_MODE}
                  onChange={(e) => update("AI_MODE", e.target.value as FormValues["AI_MODE"])}
                  style={fieldInput}
                >
                  <option value="core">core - no LLM required</option>
                  <option value="llm">llm - use configured LLM</option>
                  <option value="agent">agent - external Agent handles AI</option>
                </select>
              </label>
              <Field label="LLM_BASE_URL" value={form.LLM_BASE_URL} onChange={(v) => update("LLM_BASE_URL", v)} />
              <Field label="LLM_CHAT_MODEL" value={form.LLM_CHAT_MODEL} onChange={(v) => update("LLM_CHAT_MODEL", v)} />
              <Field
                label="LLM_EMBEDDING_MODEL"
                value={form.LLM_EMBEDDING_MODEL}
                onChange={(v) => update("LLM_EMBEDDING_MODEL", v)}
              />
              <Field
                label="LLM_CONCURRENCY"
                value={form.LLM_CONCURRENCY}
                onChange={(v) => update("LLM_CONCURRENCY", v)}
              />
              <Field
                label="LLM_DAILY_REQUEST_BUDGET"
                value={form.LLM_DAILY_REQUEST_BUDGET}
                onChange={(v) => update("LLM_DAILY_REQUEST_BUDGET", v)}
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
            <details style={{ marginTop: 8, maxWidth: 760 }}>
              <summary style={{ cursor: "pointer", color: "#8fa1c3", fontSize: 12 }}>查看 WeWe 常见报错说明</summary>
              <p style={{ ...muted, marginTop: 8 }}>
                与 news-monitor 的 <code style={{ fontSize: 12 }}>.env</code> 不同，WeWe 网页会把登录码存进<strong>该域名下的</strong>{" "}
                <code style={{ fontSize: 12 }}>localStorage.authCode</code>，并在每个请求里作为{" "}
                <code style={{ fontSize: 12 }}>Authorization</code> 头发给后端；其中只要混入 BOM、中文、弯引号等就会整页报错。处理：在 WeWe
                打开的页面上按 F12 → Application（应用）→ Local Storage → 选中 WeWe 的源站 → 删除键{" "}
                <code style={{ fontSize: 12 }}>authCode</code> 或「清除站点数据」→ 刷新后重新登录，且口令必须与容器一致、仅 ASCII。本页保存的{" "}
                <code style={{ fontSize: 12 }}>WEWE_RSS_AUTH_CODE</code> 只影响 Worker 拉 Atom，不会自动改掉浏览器里的 WeWe 缓存。
              </p>
            </details>
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
                {failureHighlights.length > 0 ? (
                  <div style={{ ...errorStyle, marginBottom: 10 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>最近失败摘要（优先处理）</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {failureHighlights.map((f) => (
                        <li key={`${f.name}:${f.row.jobId}`}>
                          <strong>{f.name}</strong>：{f.row.failedReason || "unknown error"}（job={f.row.jobId || "n/a"}）
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
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
                {system.dataHealth ? (
                  <div style={{ marginTop: 6, color: "#cdd2dc", fontSize: 13 }}>
                    数据：{system.dataHealth.items} items · {system.dataHealth.enrichments} enrichments ·{" "}
                    {system.dataHealth.clusters} clusters · 孤立聚类{" "}
                    <span style={{ color: system.dataHealth.orphanClusters > 0 ? "#ffbe7a" : "#b8f2ca" }}>
                      {system.dataHealth.orphanClusters}
                    </span>
                  </div>
                ) : null}
                {system.queueLatestCompleted?.retention ? (
                  <div style={{ marginTop: 6, color: "#73809b", fontSize: 12 }}>
                    最近 retention：job={system.queueLatestCompleted.retention.jobId || "n/a"} ·{" "}
                    {system.queueLatestCompleted.retention.finishedOn
                      ? new Date(system.queueLatestCompleted.retention.finishedOn).toLocaleString("zh-CN")
                      : "时间未知"}
                  </div>
                ) : null}
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
  background: "var(--bg-1)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: 14,
};
const sectionTitle: CSSProperties = { margin: "0 0 12px", fontSize: 14, color: "var(--fg-0)" };
const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
  gap: 10,
};
const field: CSSProperties = { display: "grid", gap: 4 };
const fieldLabel: CSSProperties = { color: "var(--fg-2)", fontSize: 12 };
const fieldInput: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "8px 10px",
  background: "var(--bg-0)",
  color: "var(--fg-0)",
  fontSize: 13,
};
const checkboxLine: CSSProperties = { color: "var(--fg-1)", fontSize: 13, display: "flex", gap: 6, alignItems: "center" };
const saveBtn: CSSProperties = {
  border: "1px solid var(--fg-0)",
  borderRadius: 6,
  padding: "8px 14px",
  background: "var(--fg-0)",
  color: "var(--bg-0)",
  cursor: "pointer",
  fontSize: 12,
};
const ghostBtn: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "8px 14px",
  background: "transparent",
  color: "var(--fg-1)",
  cursor: "pointer",
  fontSize: 12,
};
const solidBtn: CSSProperties = {
  ...ghostBtn,
  background: "var(--fg-0)",
  color: "var(--bg-0)",
  border: "1px solid var(--fg-0)",
};
const linkBtn: CSSProperties = {
  ...ghostBtn,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};
const statusRow: CSSProperties = { display: "flex", gap: 16, flexWrap: "wrap", color: "var(--fg-1)", fontSize: 13 };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid var(--border)",
  color: "var(--fg-2)",
  fontSize: 12,
  fontWeight: 500,
};
const tdStyle: CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid var(--border)",
  color: "var(--fg-1)",
  fontSize: 13,
};
const muted: CSSProperties = { color: "var(--fg-2)" };
const errorStyle: CSSProperties = {
  marginBottom: 12,
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  padding: "8px 10px",
  background: "var(--danger-bg)",
  color: "var(--danger)",
  fontSize: 13,
};
const okStyle: CSSProperties = {
  marginBottom: 12,
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  padding: "8px 10px",
  background: "rgba(255,255,255,0.05)",
  color: "var(--fg-0)",
  fontSize: 13,
};
