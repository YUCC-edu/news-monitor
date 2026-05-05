"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { ReactNode } from "react";
import { useAppearance } from "@/app/ui/appearance-provider";
import { Button } from "@/app/ui/button";
import { Card } from "@/app/ui/card";
import { Select } from "@/app/ui/select";
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
    WECHAT_MP_APP_ID: string;
    WECHAT_MP_DEFAULT_THUMB_MEDIA_ID: string;
    FEISHU_WEBHOOK_URL: string;
    OBSIDIAN_VAULT_PATH: string;
    REPORT_DAILY_TIME: string;
    REPORT_TIMEZONE: string;
  };
  secure: {
    llmApiKeySet: boolean;
    llmApiKeyMasked: string;
    wechatAppSecretSet?: boolean;
    feishuWebhookSecretSet?: boolean;
  };
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
  WECHAT_MP_APP_SECRET: string;
  FEISHU_WEBHOOK_SECRET: string;
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
  WECHAT_MP_APP_ID: "",
  WECHAT_MP_DEFAULT_THUMB_MEDIA_ID: "",
  FEISHU_WEBHOOK_URL: "",
  OBSIDIAN_VAULT_PATH: "",
  REPORT_DAILY_TIME: "08:30",
  REPORT_TIMEZONE: "Asia/Shanghai",
  LLM_API_KEY: "",
  WECHAT_MP_APP_SECRET: "",
  FEISHU_WEBHOOK_SECRET: "",
  clearLlmApiKey: false,
};

function statusColor(ok: boolean | undefined) {
  if (ok) return "var(--ok)";
  if (ok === false) return "var(--danger)";
  return "var(--fg-2)";
}

function StatusPill({ ok, label }: { ok?: boolean; label: string }) {
  return (
    <span style={{ ...pillStyle, borderColor: statusColor(ok), color: statusColor(ok) }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: statusColor(ok) }} />
      {label}
    </span>
  );
}

function inferAdvice(data: SystemData | null, previous: SystemData | null): string[] {
  if (!data) return [];
  const advice: string[] = [];
  if (!data.env.redis.ok) advice.push("Redis 不可用，队列不会继续执行。先检查 REDIS_URL 和容器状态。");
  if (!data.env.rsshub.ok) advice.push("RSSHub 不可用，检查 RSSHUB_BASE、网络连通和服务日志。");
  if (!data.env.wewe.ok) advice.push("WeWe RSS 不可用，检查 WEWE_RSS_BASE 与 AUTH_CODE。");
  if ((data.dataHealth?.orphanClusters ?? 0) > 0) {
    advice.push(`当前有 ${data.dataHealth?.orphanClusters ?? 0} 个孤立聚类，可在空闲时执行 retention 或 cleanupOrphanClusters。`);
  }
  const queueIssues = Object.entries(data.queues).filter(([name, counts]) => {
    const failed = counts?.failed ?? 0;
    const waiting = counts?.waiting ?? 0;
    const previousFailed = previous?.queues?.[name]?.failed ?? 0;
    return waiting > 100 || failed >= 10 || failed > previousFailed;
  });
  if (queueIssues.length > 0) {
    advice.push("队列有积压或失败增长，优先运行 pnpm run queue:inspect 查看最近失败原因，再决定是否 retry。");
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
  const [wechatAppSecretSet, setWechatAppSecretSet] = useState(false);
  const [feishuWebhookSecretSet, setFeishuWebhookSecretSet] = useState(false);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [system, setSystem] = useState<SystemData | null>(null);
  const [prevSystem, setPrevSystem] = useState<SystemData | null>(null);
  const systemRef = useRef<SystemData | null>(null);

  const advice = useMemo(() => inferAdvice(system, prevSystem), [system, prevSystem]);
  const failureHighlights = useMemo(() => {
    if (!system?.queueLatestFailed) return [];
    return Object.entries(system.queueLatestFailed)
      .filter(([, row]) => Boolean(row))
      .map(([name, row]) => ({ name, row: row! }))
      .slice(0, 4);
  }, [system]);

  const llmMissingBaseUrl = form.AI_MODE === "llm" && !form.LLM_BASE_URL.trim();
  const llmMissingApiKey =
    form.AI_MODE === "llm" && !form.LLM_API_KEY.trim() && (!llmApiKeySet || form.clearLlmApiKey);
  const llmModeChanged = Boolean(system && system.env.llm.mode !== form.AI_MODE);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/settings");
      if (!resp.ok) throw new Error(`加载设置失败：${resp.status}`);
      const data = (await resp.json()) as SettingsResp;
      setVersion(data.version);
      setLlmApiKeySet(data.secure.llmApiKeySet);
      setWechatAppSecretSet(Boolean(data.secure.wechatAppSecretSet));
      setFeishuWebhookSecretSet(Boolean(data.secure.feishuWebhookSecretSet));
      setForm({
        ...data.values,
        LLM_API_KEY: "",
        WECHAT_MP_APP_SECRET: "",
        FEISHU_WEBHOOK_SECRET: "",
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
      // System health is advisory; settings can still be edited.
    }
  }, []);

  useEffect(() => {
    void loadSettings();
    void loadSystem();
  }, [loadSettings, loadSystem]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void loadSystem();
    }, 30000);
    return () => clearInterval(timer);
  }, [loadSystem]);

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm((old) => ({ ...old, [key]: value }));
  }

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
        WECHAT_MP_APP_ID: form.WECHAT_MP_APP_ID,
        WECHAT_MP_DEFAULT_THUMB_MEDIA_ID: form.WECHAT_MP_DEFAULT_THUMB_MEDIA_ID,
        FEISHU_WEBHOOK_URL: form.FEISHU_WEBHOOK_URL,
        OBSIDIAN_VAULT_PATH: form.OBSIDIAN_VAULT_PATH,
        REPORT_DAILY_TIME: form.REPORT_DAILY_TIME,
        REPORT_TIMEZONE: form.REPORT_TIMEZONE,
        ...(form.LLM_API_KEY.trim() ? { LLM_API_KEY: form.LLM_API_KEY.trim() } : {}),
        ...(form.WECHAT_MP_APP_SECRET.trim() ? { WECHAT_MP_APP_SECRET: form.WECHAT_MP_APP_SECRET.trim() } : {}),
        ...(form.FEISHU_WEBHOOK_SECRET.trim() ? { FEISHU_WEBHOOK_SECRET: form.FEISHU_WEBHOOK_SECRET.trim() } : {}),
      };
      const resp = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values, version, clearLlmApiKey: form.clearLlmApiKey }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? `保存失败：${resp.status}`);
      setVersion(data.version);
      setSaved(`已保存到根目录 .env。AI_MODE=${form.AI_MODE}，重启 web/worker 后完全生效。`);
      setForm((old) => ({
        ...old,
        LLM_API_KEY: "",
        WECHAT_MP_APP_SECRET: "",
        FEISHU_WEBHOOK_SECRET: "",
        clearLlmApiKey: false,
      }));
      setLlmApiKeySet(form.clearLlmApiKey ? Boolean(form.LLM_API_KEY.trim()) : llmApiKeySet || Boolean(form.LLM_API_KEY.trim()));
      setWechatAppSecretSet(wechatAppSecretSet || Boolean(form.WECHAT_MP_APP_SECRET.trim()));
      setFeishuWebhookSecretSet(feishuWebhookSecretSet || Boolean(form.FEISHU_WEBHOOK_SECRET.trim()));
      await loadSystem();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: "grid", gap: 16 }} aria-busy="true" aria-label="加载中">
        <Skeleton style={{ height: 34, width: 160 }} />
        <div style={layoutStyle}>
          <Skeleton style={{ height: 420, width: "100%" }} />
          <Skeleton style={{ height: 620, width: "100%" }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <header style={headerStyle}>
        <div>
          <h1 className="nm-title">设置</h1>
          <div className="nm-muted" style={{ marginTop: 6 }}>
            配置模型、采集、发布通道和运行诊断。密钥留空表示不修改现有值。
          </div>
        </div>
        <Button onClick={() => void loadSystem()} disabled={saving}>立即复测</Button>
      </header>

      {error ? <div style={errorStyle}>{error}</div> : null}
      {saved ? <div style={okStyle}>{saved}</div> : null}

      <div style={layoutStyle}>
        <aside style={sideStyle}>
          <Card style={{ padding: 16, display: "grid", gap: 14 }}>
            <div>
              <div style={sectionTitle}>运行概览</div>
              <div className="nm-muted" style={{ fontSize: 12 }}>每 30 秒自动刷新</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <StatusPill ok={system?.env.redis.ok} label="Redis" />
              <StatusPill ok={system?.env.rsshub.ok} label="RSSHub" />
              <StatusPill ok={system?.env.wewe.ok} label="WeWe" />
            </div>
            <div style={metricGrid}>
              <Metric label="AI 模式" value={system?.env.llm.mode ?? form.AI_MODE} />
              <Metric label="预算/天" value={String(system?.env.llm.dailyRequestBudget ?? form.LLM_DAILY_REQUEST_BUDGET)} />
              <Metric label="信源" value={String(system?.dataHealth?.enabledSources ?? "-")} />
              <Metric label="条目" value={String(system?.dataHealth?.items ?? "-")} />
            </div>
            {system ? (
              <div className="nm-muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
                Node {system.node.version} / {system.node.platform} / 已运行 {Math.floor(system.node.uptimeSec / 60)} 分钟
              </div>
            ) : (
              <div className="nm-muted" style={{ fontSize: 12 }}>暂无运行数据</div>
            )}
            {advice.length ? (
              <div style={warningBox}>
                {advice.map((item) => (
                  <div key={item}>{item}</div>
                ))}
              </div>
            ) : null}
          </Card>
        </aside>

        <main style={{ display: "grid", gap: 14, minWidth: 0 }}>
          <Section title="外观">
            <div style={gridStyle}>
              <div style={fieldStyle}>
                <div style={labelStyle}>{copy.languageLabel}</div>
                <div style={buttonRow}>
                  <Button size="sm" variant={locale === "zh-CN" ? "primary" : "ghost"} onClick={() => setLocale("zh-CN")}>
                    {copy.languageChinese}
                  </Button>
                  <Button size="sm" variant={locale === "en-US" ? "primary" : "ghost"} onClick={() => setLocale("en-US")}>
                    {copy.languageEnglish}
                  </Button>
                </div>
              </div>
              <div style={fieldStyle}>
                <div style={labelStyle}>{copy.themeLabel}</div>
                <div style={buttonRow}>
                  <Button size="sm" variant={theme === "dark" ? "primary" : "ghost"} onClick={() => setTheme("dark")}>
                    {copy.themeDark}
                  </Button>
                  <Button size="sm" variant={theme === "light" ? "primary" : "ghost"} onClick={() => setTheme("light")}>
                    {copy.themeLight}
                  </Button>
                  <Button size="sm" variant={theme === "paper" ? "primary" : "ghost"} onClick={() => setTheme("paper")}>
                    {copy.themePaper}
                  </Button>
                </div>
              </div>
            </div>
          </Section>

          <Section title="AI 与 LLM">
            <div style={gridStyle}>
              <label style={fieldStyle}>
                <div style={labelStyle}>AI_MODE</div>
                <Select value={form.AI_MODE} onChange={(e) => update("AI_MODE", e.target.value as FormValues["AI_MODE"])}>
                  <option value="core">core - 不依赖 LLM</option>
                  <option value="llm">llm - 使用本地配置模型</option>
                  <option value="agent">agent - 外部 Agent 接管</option>
                </Select>
                {llmMissingBaseUrl || llmMissingApiKey ? (
                  <div style={warningText}>LLM 模式缺少 {[
                    llmMissingBaseUrl ? "LLM_BASE_URL" : "",
                    llmMissingApiKey ? "LLM_API_KEY" : "",
                  ].filter(Boolean).join("、")}。</div>
                ) : null}
                {llmModeChanged ? <div style={helpText}>当前运行中的模式仍是 {system?.env.llm.mode}，保存后需重启生效。</div> : null}
              </label>
              <Field label="LLM_BASE_URL" value={form.LLM_BASE_URL} onChange={(v) => update("LLM_BASE_URL", v)} />
              <Field label="LLM_CHAT_MODEL" value={form.LLM_CHAT_MODEL} onChange={(v) => update("LLM_CHAT_MODEL", v)} />
              <Field label="LLM_EMBEDDING_MODEL" value={form.LLM_EMBEDDING_MODEL} onChange={(v) => update("LLM_EMBEDDING_MODEL", v)} />
              <Field label="LLM_CONCURRENCY" value={form.LLM_CONCURRENCY} onChange={(v) => update("LLM_CONCURRENCY", v)} />
              <Field label="LLM_DAILY_REQUEST_BUDGET" value={form.LLM_DAILY_REQUEST_BUDGET} onChange={(v) => update("LLM_DAILY_REQUEST_BUDGET", v)} />
              <Field
                label={`LLM_API_KEY (${llmApiKeySet ? "已配置" : "未配置"})`}
                value={form.LLM_API_KEY}
                onChange={(v) => update("LLM_API_KEY", v)}
                type="password"
                placeholder="留空不修改"
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
          </Section>

          <Section title="日报与发布通道">
            <div style={gridStyle}>
              <Field label="REPORT_DAILY_TIME" value={form.REPORT_DAILY_TIME} onChange={(v) => update("REPORT_DAILY_TIME", v)} />
              <Field label="REPORT_TIMEZONE" value={form.REPORT_TIMEZONE} onChange={(v) => update("REPORT_TIMEZONE", v)} />
              <Field label="WECHAT_MP_APP_ID" value={form.WECHAT_MP_APP_ID} onChange={(v) => update("WECHAT_MP_APP_ID", v)} />
              <Field
                label={`WECHAT_MP_APP_SECRET (${wechatAppSecretSet ? "已配置" : "未配置"})`}
                value={form.WECHAT_MP_APP_SECRET}
                onChange={(v) => update("WECHAT_MP_APP_SECRET", v)}
                type="password"
                placeholder="留空不修改"
              />
              <Field
                label="WECHAT_MP_DEFAULT_THUMB_MEDIA_ID"
                value={form.WECHAT_MP_DEFAULT_THUMB_MEDIA_ID}
                onChange={(v) => update("WECHAT_MP_DEFAULT_THUMB_MEDIA_ID", v)}
                placeholder="留空时自动使用风格样例封面上传"
              />
              <Field label="FEISHU_WEBHOOK_URL" value={form.FEISHU_WEBHOOK_URL} onChange={(v) => update("FEISHU_WEBHOOK_URL", v)} />
              <Field
                label={`FEISHU_WEBHOOK_SECRET (${feishuWebhookSecretSet ? "已配置" : "未配置"})`}
                value={form.FEISHU_WEBHOOK_SECRET}
                onChange={(v) => update("FEISHU_WEBHOOK_SECRET", v)}
                type="password"
                placeholder="留空不修改"
              />
              <Field label="OBSIDIAN_VAULT_PATH" value={form.OBSIDIAN_VAULT_PATH} onChange={(v) => update("OBSIDIAN_VAULT_PATH", v)} />
            </div>
          </Section>

          <Section title="数据与采集">
            <div style={gridStyle}>
              <Field label="REDIS_URL" value={form.REDIS_URL} onChange={(v) => update("REDIS_URL", v)} />
              <Field label="DATABASE_URL" value={form.DATABASE_URL} onChange={(v) => update("DATABASE_URL", v)} />
              <Field label="RSSHUB_BASE" value={form.RSSHUB_BASE} onChange={(v) => update("RSSHUB_BASE", v)} />
              <Field label="WEWE_RSS_BASE" value={form.WEWE_RSS_BASE} onChange={(v) => update("WEWE_RSS_BASE", v)} />
              <Field label="WEWE_RSS_AUTH_CODE" value={form.WEWE_RSS_AUTH_CODE} onChange={(v) => update("WEWE_RSS_AUTH_CODE", v)} />
            </div>
            <div style={buttonRow}>
              {form.RSSHUB_BASE ? <a href={form.RSSHUB_BASE} target="_blank" rel="noreferrer" style={linkBtn}>打开 RSSHub</a> : null}
              {form.WEWE_RSS_BASE ? (
                <a href={`${form.WEWE_RSS_BASE.replace(/\/$/, "")}/dash`} target="_blank" rel="noreferrer" style={linkBtn}>
                  打开 WeWe 面板
                </a>
              ) : null}
            </div>
          </Section>

          <Section title="运行队列">
            {failureHighlights.length ? (
              <div style={errorStyle}>
                <strong>最近失败摘要</strong>
                {failureHighlights.map((failure) => (
                  <div key={`${failure.name}:${failure.row.jobId}`} style={{ marginTop: 6 }}>
                    {failure.name}: {failure.row.failedReason || "unknown error"} (job={failure.row.jobId || "n/a"})
                  </div>
                ))}
              </div>
            ) : null}
            {system ? (
              <div className="nm-table-wrap">
                <table style={tableStyle}>
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
                    {Object.entries(system.queues).map(([name, counts]) => (
                      <tr key={name}>
                        <td style={tdStyle}>{name}</td>
                        <td style={tdStyle}>{counts?.waiting ?? "-"}</td>
                        <td style={tdStyle}>{counts?.active ?? "-"}</td>
                        <td style={{ ...tdStyle, color: (counts?.failed ?? 0) > 0 ? "var(--danger)" : "var(--fg-1)" }}>{counts?.failed ?? "-"}</td>
                        <td style={tdStyle}>{counts?.delayed ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="nm-muted">暂无运行队列数据</div>
            )}
          </Section>
        </main>
      </div>

      <div style={saveBar}>
        <div className="nm-muted" style={{ fontSize: 12 }}>当前配置版本：{version || "-"}</div>
        <div style={buttonRow}>
          <Button onClick={() => void loadSettings()} disabled={saving}>重载表单</Button>
          <Button variant="primary" disabled={saving} onClick={() => void saveAll()}>
            {saving ? "保存中..." : "保存全部"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card style={{ padding: 16, display: "grid", gap: 12 }}>
      <h2 style={sectionTitle}>{title}</h2>
      {children}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={metricStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
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
    <label style={fieldStyle}>
      <div style={labelStyle}>{props.label}</div>
      <input
        type={props.type ?? "text"}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        style={inputStyle}
      />
    </label>
  );
}

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const layoutStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
  gap: 14,
  alignItems: "start",
};

const sideStyle: CSSProperties = {
  position: "sticky",
  top: 12,
};

const sectionTitle: CSSProperties = {
  margin: 0,
  color: "var(--fg-0)",
  fontSize: 16,
  fontWeight: 750,
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
  gap: 12,
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  minWidth: 0,
};

const labelStyle: CSSProperties = {
  color: "var(--fg-2)",
  fontSize: 12,
};

const inputStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "9px 10px",
  background: "var(--bg-0)",
  color: "var(--fg-0)",
  fontSize: 13,
  minWidth: 0,
};

const buttonRow: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const checkboxLine: CSSProperties = {
  color: "var(--fg-1)",
  fontSize: 13,
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const metricGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
};

const metricStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: 10,
  color: "var(--fg-2)",
  fontSize: 12,
};

const pillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: "1px solid var(--border)",
  borderRadius: 999,
  padding: "5px 9px",
  fontSize: 12,
};

const warningBox: CSSProperties = {
  display: "grid",
  gap: 6,
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  padding: 10,
  color: "#ffbe7a",
  background: "rgba(255,190,122,0.08)",
  fontSize: 12,
  lineHeight: 1.6,
};

const warningText: CSSProperties = {
  color: "#ffbe7a",
  fontSize: 12,
  lineHeight: 1.5,
};

const helpText: CSSProperties = {
  color: "var(--fg-2)",
  fontSize: 12,
  lineHeight: 1.5,
};

const linkBtn: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "8px 12px",
  background: "transparent",
  color: "var(--fg-1)",
  cursor: "pointer",
  fontSize: 12,
  textDecoration: "none",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

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

const saveBar: CSSProperties = {
  position: "sticky",
  bottom: 12,
  zIndex: 2,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: 12,
  background: "var(--bg-1)",
};

const errorStyle: CSSProperties = {
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  padding: "8px 10px",
  background: "var(--danger-bg)",
  color: "var(--danger)",
  fontSize: 13,
};

const okStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
  background: "rgba(255,255,255,0.05)",
  color: "var(--fg-0)",
  fontSize: 13,
};
