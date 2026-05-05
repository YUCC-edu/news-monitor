"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/app/ui/button";
import { Card } from "@/app/ui/card";
import { Select } from "@/app/ui/select";
import { Textarea } from "@/app/ui/textarea";

type Attempt = {
  id: string;
  targetKind: "wechat" | "feishu" | "obsidian";
  status: "running" | "ok" | "error" | "skipped";
  trigger: string;
  externalId: string | null;
  externalUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
};

type ImageBrief = {
  kind: "cover" | "section";
  topic: string;
  prompt: string;
};

type Report = {
  id: string;
  reportDate: string;
  title: string;
  audience: "public" | "personal";
  range: "24h" | "72h" | "7d" | "30d" | "90d";
  topN: number;
  minSources: number;
  status: "draft" | "published" | "partial" | "failed";
  markdown: string;
  wechatHtml: string;
  obsidianMarkdown: string;
  feishuPayload: unknown;
  styledTitle: string | null;
  styledMarkdown: string | null;
  styledWechatHtml: string | null;
  styleImageBriefs: ImageBrief[];
  styledAt: string | null;
  edited: boolean;
  generatedAt: string;
  updatedAt: string;
  attempts: Attempt[];
};

type StyleProfile = {
  id: string;
  name: string;
  description: string | null;
  sampleCount: number;
  rules: {
    summary?: string;
    image?: {
      notes?: string[];
    };
  };
  updatedAt: string;
};

type StyleSample = {
  id: string;
  title: string;
  sourceUrl: string | null;
  createdAt: string;
};

type WechatPreview = {
  title: string;
  author: string;
  digest: string;
  content: string;
  markdown: string;
  contentSource: "styled" | "factual";
  contentLength: number;
  markdownLength: number;
};

const targetLabels: Record<Attempt["targetKind"], string> = {
  wechat: "公众号草稿",
  feishu: "飞书",
  obsidian: "Obsidian",
};

const statusTone: Record<string, string> = {
  draft: "var(--fg-2)",
  published: "var(--ok)",
  partial: "#ffbe7a",
  failed: "var(--danger)",
  running: "#ffbe7a",
  ok: "var(--ok)",
  error: "var(--danger)",
};

function latestAttempts(attempts: Attempt[]) {
  const map = new Map<Attempt["targetKind"], Attempt>();
  for (const attempt of attempts) {
    if (!map.has(attempt.targetKind)) map.set(attempt.targetKind, attempt);
  }
  return [...map.values()];
}

function fmtTime(raw: string | null) {
  if (!raw) return "未完成";
  return new Date(raw).toLocaleString("zh-CN");
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [audience, setAudience] = useState<"personal" | "public">("personal");
  const [range, setRange] = useState<Report["range"]>("24h");
  const [topN, setTopN] = useState(10);
  const [minSources, setMinSources] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [wechatPreview, setWechatPreview] = useState<WechatPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewMode, setPreviewMode] = useState<"rendered" | "html" | "markdown">("rendered");
  const [styleProfile, setStyleProfile] = useState<StyleProfile | null>(null);
  const [styleSamples, setStyleSamples] = useState<StyleSample[]>([]);
  const [sampleForm, setSampleForm] = useState({
    title: "",
    sourceUrl: "",
    contentMarkdown: "",
    wechatHtml: "",
    coverImageUrl: "",
    inlineImages: "",
    imageNotes: "",
  });
  const [edit, setEdit] = useState({
    title: "",
    markdown: "",
    wechatHtml: "",
    obsidianMarkdown: "",
    styledTitle: "",
    styledMarkdown: "",
    styledWechatHtml: "",
  });

  const selected = useMemo(
    () => reports.find((report) => report.id === selectedId) ?? reports[0] ?? null,
    [reports, selectedId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetch("/api/reports?limit=50", { cache: "no-store" }).then((r) => r.json()) as { reports: Report[] };
      setReports(data.reports ?? []);
      setSelectedId((old) => old ?? data.reports?.[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载日报失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStyle = useCallback(async () => {
    try {
      const data = await fetch("/api/writing-style/profile", { cache: "no-store" }).then((r) => r.json()) as {
        profile: StyleProfile | null;
        samples: StyleSample[];
      };
      setStyleProfile(data.profile ?? null);
      setStyleSamples(data.samples ?? []);
    } catch {
      setStyleProfile(null);
      setStyleSamples([]);
    }
  }, []);

  const loadWechatPreview = useCallback(async (reportId: string) => {
    setPreviewLoading(true);
    try {
      const data = await fetch(`/api/reports/${reportId}/wechat-preview`, { cache: "no-store" }).then((r) => r.json()) as {
        article?: WechatPreview;
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setWechatPreview(data.article ?? null);
    } catch (previewError) {
      setWechatPreview(null);
      setError(previewError instanceof Error ? previewError.message : "加载公众号草稿预览失败");
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadStyle();
  }, [load, loadStyle]);

  useEffect(() => {
    if (!selected?.id) {
      setWechatPreview(null);
      return;
    }
    void loadWechatPreview(selected.id);
  }, [loadWechatPreview, selected?.id, selected?.styledWechatHtml, selected?.wechatHtml]);

  useEffect(() => {
    if (!selected) return;
    setEdit({
      title: selected.title,
      markdown: selected.markdown,
      wechatHtml: selected.wechatHtml,
      obsidianMarkdown: selected.obsidianMarkdown,
      styledTitle: selected.styledTitle ?? "",
      styledMarkdown: selected.styledMarkdown ?? "",
      styledWechatHtml: selected.styledWechatHtml ?? "",
    });
  }, [selected]);

  async function mutate(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    setSaved(null);
    try {
      await fn();
      await load();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : `${label}失败`);
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    await mutate("生成", async () => {
      const resp = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audience, range, topN, minSources }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "生成失败");
      setSelectedId(data.report?.id ?? null);
      setSaved("日报已生成");
    });
  }

  async function save() {
    if (!selected) return;
    await mutate("保存", async () => {
      const resp = await fetch(`/api/reports/${selected.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(edit),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "保存失败");
      setSaved("日报已保存");
    });
  }

  async function importSample() {
    await mutate("导入样例", async () => {
      const inlineImages = sampleForm.inlineImages
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
      const resp = await fetch("/api/writing-style/samples", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: sampleForm.title,
          sourceUrl: sampleForm.sourceUrl || null,
          contentMarkdown: sampleForm.contentMarkdown,
          wechatHtml: sampleForm.wechatHtml,
          coverImageUrl: sampleForm.coverImageUrl || null,
          inlineImages,
          imageNotes: sampleForm.imageNotes,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "导入样例失败");
      setSampleForm({
        title: "",
        sourceUrl: "",
        contentMarkdown: "",
        wechatHtml: "",
        coverImageUrl: "",
        inlineImages: "",
        imageNotes: "",
      });
      await loadStyle();
      setSaved("风格样例已导入，风格档案已刷新");
    });
  }

  async function regenerateStyle() {
    if (!selected) return;
    await mutate("生成风格稿", async () => {
      const resp = await fetch(`/api/reports/${selected.id}/style`, { method: "POST" });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "生成风格稿失败");
      setSaved("公众号风格稿已生成");
    });
  }

  async function publish(targetKinds?: Array<Attempt["targetKind"]>) {
    if (!selected) return;
    await mutate("推送", async () => {
      const resp = await fetch(`/api/reports/${selected.id}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetKinds }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "推送入队失败");
      setSaved("发布任务已入队，稍后刷新状态");
    });
  }

  async function retry(attempt: Attempt) {
    if (!selected) return;
    await mutate("重试", async () => {
      const resp = await fetch(`/api/reports/${selected.id}/attempts/${attempt.id}/retry`, { method: "POST" });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "重试入队失败");
      setSaved(`${targetLabels[attempt.targetKind]} 重试已入队`);
    });
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ margin: 0, color: "var(--fg-0)", fontSize: 28 }}>日报发布</h1>
            <div className="nm-muted" style={{ marginTop: 6 }}>
              生成中文日报，编辑公众号草稿、飞书摘要和本地 Obsidian 内容。
            </div>
          </div>
          <Button onClick={() => void generate()} disabled={Boolean(busy)} variant="primary">
            {busy === "生成" ? "生成中..." : "生成日报"}
          </Button>
        </div>
        <div style={generationGrid}>
          <label style={field}>
            <span>内容范围</span>
            <Select value={audience} onChange={(event) => setAudience(event.target.value as "personal" | "public")}>
              <option value="personal">个人信源优先</option>
              <option value="public">公共信源</option>
            </Select>
          </label>
          <label style={field}>
            <span>时间窗口</span>
            <Select value={range} onChange={(event) => setRange(event.target.value as Report["range"])}>
              <option value="24h">24H</option>
              <option value="72h">72H</option>
              <option value="7d">7D</option>
              <option value="30d">30D</option>
              <option value="90d">90D</option>
            </Select>
          </label>
          <label style={field}>
            <span>候选条数</span>
            <input aria-label="Top N" type="number" min={1} max={30} value={topN} onChange={(event) => setTopN(Number(event.target.value) || 10)} style={numberInput} />
          </label>
          <label style={field}>
            <span>最少来源</span>
            <input aria-label="Minimum sources" type="number" min={1} max={20} value={minSources} onChange={(event) => setMinSources(Number(event.target.value) || 1)} style={numberInput} />
          </label>
        </div>
      </section>

      {error ? <div style={alertDanger}>{error}</div> : null}
      {saved ? <div style={alertOk}>{saved}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 14 }}>
        <Card style={{ padding: 14, display: "grid", alignContent: "start", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ color: "var(--fg-0)" }}>发布历史</strong>
            <Button onClick={() => void load()} disabled={loading}>刷新</Button>
          </div>
          {loading ? <div className="nm-muted">加载中...</div> : null}
          {!loading && reports.length === 0 ? <div className="nm-muted">暂无日报</div> : null}
          {reports.map((report) => (
            <button
              key={report.id}
              type="button"
              onClick={() => setSelectedId(report.id)}
              style={{
                textAlign: "left",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 10,
                background: selected?.id === report.id ? "rgba(255,255,255,0.06)" : "transparent",
                color: "var(--fg-1)",
                cursor: "pointer",
              }}
            >
              <div style={{ color: "var(--fg-0)", fontWeight: 650 }}>{report.styledTitle || report.title}</div>
              <div className="nm-muted" style={{ fontSize: 12, marginTop: 4 }}>
                {report.audience} / {report.range} / {fmtTime(report.generatedAt)}
              </div>
              <div style={{ color: statusTone[report.status], fontSize: 12, marginTop: 6 }}>
                {report.status}{report.styledAt ? " / 已生成风格稿" : ""}
              </div>
            </button>
          ))}
        </Card>

        {!selected ? (
          <Card style={{ padding: 16 }}>
            <div className="nm-muted">先生成一份日报。</div>
          </Card>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            <Card style={{ padding: 16, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ color: "var(--fg-0)", fontWeight: 750, fontSize: 20 }}>{selected.styledTitle || selected.title}</div>
                  <div className="nm-muted" style={{ marginTop: 4, fontSize: 12 }}>
                    {selected.reportDate} / {selected.edited ? "已编辑" : "自动生成"} / 状态{" "}
                    <span style={{ color: statusTone[selected.status] }}>{selected.status}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button onClick={() => void save()} disabled={Boolean(busy)}>保存编辑</Button>
                  <Button onClick={() => void regenerateStyle()} disabled={Boolean(busy) || !styleProfile || styleProfile.sampleCount === 0}>生成公众号风格稿</Button>
                  <Button onClick={() => void publish()} disabled={Boolean(busy)}>一键推送</Button>
                  <Button onClick={() => void publish(["wechat"])} disabled={Boolean(busy)}>公众号草稿</Button>
                  <Button onClick={() => void publish(["feishu"])} disabled={Boolean(busy)}>飞书</Button>
                  <Button onClick={() => void publish(["obsidian"])} disabled={Boolean(busy)}>Obsidian</Button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                {latestAttempts(selected.attempts).map((attempt) => (
                  <div key={attempt.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
                    <div style={{ color: "var(--fg-0)", fontWeight: 650 }}>{targetLabels[attempt.targetKind]}</div>
                    <div style={{ color: statusTone[attempt.status], fontSize: 12, marginTop: 4 }}>{attempt.status}</div>
                    <div className="nm-muted" style={{ fontSize: 12, marginTop: 4 }}>{fmtTime(attempt.finishedAt ?? attempt.createdAt)}</div>
                    {attempt.externalUrl ? <div className="nm-muted" style={{ fontSize: 12, marginTop: 4, wordBreak: "break-all" }}>{attempt.externalUrl}</div> : null}
                    {attempt.errorMessage ? <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 6 }}>{attempt.errorMessage}</div> : null}
                    {attempt.status === "error" ? <button type="button" style={smallButton} onClick={() => void retry(attempt)}>重试</button> : null}
                  </div>
                ))}
              </div>
            </Card>

            <Card style={{ padding: 16, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ color: "var(--fg-0)", fontWeight: 750, fontSize: 18 }}>公众号草稿预览</div>
                  <div className="nm-muted" style={{ marginTop: 4, fontSize: 12 }}>
                    这里渲染的是接口实际发送到微信草稿箱的同一份 HTML。
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <Button size="sm" onClick={() => setPreviewMode("rendered")} disabled={previewMode === "rendered"}>渲染</Button>
                  <Button size="sm" onClick={() => setPreviewMode("html")} disabled={previewMode === "html"}>HTML</Button>
                  <Button size="sm" onClick={() => setPreviewMode("markdown")} disabled={previewMode === "markdown"}>Markdown</Button>
                  <Button size="sm" onClick={() => selected?.id && void loadWechatPreview(selected.id)} disabled={previewLoading}>刷新预览</Button>
                </div>
              </div>
              {wechatPreview ? (
                <>
                  <div style={previewMetaGrid}>
                    <div style={previewMetaItem}>
                      <span>标题</span>
                      <strong>{wechatPreview.title}</strong>
                    </div>
                    <div style={previewMetaItem}>
                      <span>内容来源</span>
                      <strong>{wechatPreview.contentSource === "styled" ? "公众号风格稿" : "事实稿"}</strong>
                    </div>
                    <div style={previewMetaItem}>
                      <span>HTML 长度</span>
                      <strong>{wechatPreview.contentLength}</strong>
                    </div>
                    <div style={previewMetaItem}>
                      <span>摘要</span>
                      <strong>{wechatPreview.digest || "无摘要"}</strong>
                    </div>
                  </div>
                  {previewMode === "rendered" ? (
                    <iframe
                      title="公众号草稿实际发送预览"
                      sandbox=""
                      srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:20px;background:#fff;color:#111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;} img{max-width:100%;height:auto;} a{color:#2563eb;}</style></head><body>${wechatPreview.content}</body></html>`}
                      style={previewFrame}
                    />
                  ) : (
                    <Textarea
                      readOnly
                      value={previewMode === "html" ? wechatPreview.content : wechatPreview.markdown}
                      style={{ ...textareaStyle, minHeight: 320 }}
                    />
                  )}
                </>
              ) : (
                <div className="nm-muted">{previewLoading ? "正在生成预览..." : "暂无公众号预览"}</div>
              )}
            </Card>

            <Card style={{ padding: 16, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ color: "var(--fg-0)", fontWeight: 750, fontSize: 18 }}>公众号风格档案</div>
                  <div className="nm-muted" style={{ marginTop: 4, fontSize: 12 }}>
                    {styleProfile ? `${styleProfile.name} / ${styleProfile.sampleCount} 篇样例` : "尚未创建风格档案"}
                  </div>
                </div>
                <Button onClick={() => void loadStyle()} disabled={Boolean(busy)}>刷新风格</Button>
              </div>
              {styleProfile?.rules?.summary ? (
                <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, color: "var(--fg-1)", lineHeight: 1.7 }}>
                  {styleProfile.rules.summary}
                </div>
              ) : (
                <div className="nm-muted">导入已发布文章后，系统会提炼标题、结构、语气、排版和配图风格。</div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 10 }}>
                <label style={field}>
                  <span>样例标题</span>
                  <input value={sampleForm.title} onChange={(event) => setSampleForm((old) => ({ ...old, title: event.target.value }))} style={textInput} />
                </label>
                <label style={field}>
                  <span>原文链接</span>
                  <input value={sampleForm.sourceUrl} onChange={(event) => setSampleForm((old) => ({ ...old, sourceUrl: event.target.value }))} style={textInput} />
                </label>
                <label style={field}>
                  <span>封面图 URL</span>
                  <input value={sampleForm.coverImageUrl} onChange={(event) => setSampleForm((old) => ({ ...old, coverImageUrl: event.target.value }))} style={textInput} />
                </label>
              </div>
              <label style={field}>
                <span>样例正文 Markdown</span>
                <Textarea value={sampleForm.contentMarkdown} onChange={(event) => setSampleForm((old) => ({ ...old, contentMarkdown: event.target.value }))} style={{ ...textareaStyle, minHeight: 120 }} />
              </label>
              <label style={field}>
                <span>公众号 HTML（可选）</span>
                <Textarea value={sampleForm.wechatHtml} onChange={(event) => setSampleForm((old) => ({ ...old, wechatHtml: event.target.value }))} style={{ ...textareaStyle, minHeight: 100 }} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 10 }}>
                <label style={field}>
                  <span>正文配图 URL（一行一个）</span>
                  <Textarea value={sampleForm.inlineImages} onChange={(event) => setSampleForm((old) => ({ ...old, inlineImages: event.target.value }))} style={{ ...textareaStyle, minHeight: 90 }} />
                </label>
                <label style={field}>
                  <span>配图风格备注</span>
                  <Textarea value={sampleForm.imageNotes} onChange={(event) => setSampleForm((old) => ({ ...old, imageNotes: event.target.value }))} style={{ ...textareaStyle, minHeight: 90 }} />
                </label>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <Button onClick={() => void importSample()} disabled={Boolean(busy) || !sampleForm.title.trim() || !(sampleForm.contentMarkdown.trim() || sampleForm.wechatHtml.trim())}>
                  导入样例并学习
                </Button>
                <div className="nm-muted" style={{ fontSize: 12 }}>
                  最近样例：{styleSamples.slice(0, 3).map((sample) => sample.title).join(" / ") || "暂无"}
                </div>
              </div>
            </Card>

            <Card style={{ padding: 16, display: "grid", gap: 12 }}>
              <label style={field}>
                <span>标题</span>
                <input value={edit.title} onChange={(event) => setEdit((old) => ({ ...old, title: event.target.value }))} style={textInput} />
              </label>
              <label style={field}>
                <span>Markdown / 飞书摘要源</span>
                <Textarea value={edit.markdown} onChange={(event) => setEdit((old) => ({ ...old, markdown: event.target.value }))} style={textareaStyle} />
              </label>
              <label style={field}>
                <span>公众号 HTML（事实版）</span>
                <Textarea value={edit.wechatHtml} onChange={(event) => setEdit((old) => ({ ...old, wechatHtml: event.target.value }))} style={textareaStyle} />
              </label>
              <label style={field}>
                <span>公众号风格标题</span>
                <input value={edit.styledTitle} onChange={(event) => setEdit((old) => ({ ...old, styledTitle: event.target.value }))} style={textInput} />
              </label>
              <label style={field}>
                <span>公众号风格 Markdown</span>
                <Textarea value={edit.styledMarkdown} onChange={(event) => setEdit((old) => ({ ...old, styledMarkdown: event.target.value }))} style={textareaStyle} />
              </label>
              <label style={field}>
                <span>公众号风格 HTML（微信草稿优先使用）</span>
                <Textarea value={edit.styledWechatHtml} onChange={(event) => setEdit((old) => ({ ...old, styledWechatHtml: event.target.value }))} style={textareaStyle} />
              </label>
              {selected.styleImageBriefs?.length ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <span style={{ color: "var(--fg-1)", fontSize: 13 }}>配图 brief</span>
                  {selected.styleImageBriefs.map((brief, index) => (
                    <div key={`${brief.kind}-${index}`} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
                      <div style={{ color: "var(--fg-0)", fontWeight: 650 }}>{brief.kind} / {brief.topic}</div>
                      <div className="nm-muted" style={{ marginTop: 4, lineHeight: 1.6 }}>{brief.prompt}</div>
                    </div>
                  ))}
                </div>
              ) : null}
              <label style={field}>
                <span>Obsidian Markdown</span>
                <Textarea value={edit.obsidianMarkdown} onChange={(event) => setEdit((old) => ({ ...old, obsidianMarkdown: event.target.value }))} style={textareaStyle} />
              </label>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

const panelStyle = {
  display: "grid",
  gap: 14,
  padding: 18,
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--bg-1)",
} as const;

const numberInput = {
  width: "100%",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "8px 10px",
  background: "var(--bg-0)",
  color: "var(--fg-0)",
} as const;

const generationGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))",
  gap: 10,
} as const;

const textInput = {
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "9px 10px",
  background: "var(--bg-0)",
  color: "var(--fg-0)",
} as const;

const textareaStyle = {
  minHeight: 220,
  fontFamily: "var(--font-mono)",
  fontSize: 12,
} as const;

const previewMetaGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
  gap: 8,
} as const;

const previewMetaItem = {
  display: "grid",
  gap: 4,
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: 10,
  color: "var(--fg-2)",
  fontSize: 12,
} as const;

const previewFrame = {
  width: "100%",
  minHeight: 520,
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "#fff",
} as const;

const field = {
  display: "grid",
  gap: 6,
  color: "var(--fg-1)",
  fontSize: 13,
} as const;

const smallButton = {
  marginTop: 8,
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "transparent",
  color: "var(--fg-1)",
  padding: "5px 8px",
  cursor: "pointer",
} as const;

const alertDanger = {
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  padding: "8px 10px",
  color: "var(--danger)",
  background: "var(--danger-bg)",
} as const;

const alertOk = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
  color: "var(--fg-0)",
  background: "rgba(255,255,255,0.04)",
} as const;
