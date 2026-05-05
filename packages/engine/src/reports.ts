import {
  createReportRun,
  finishReportRun,
  getHotspotOverview,
  listItems,
  upsertReport,
  type ItemListRow,
} from "@news/db";
import { generateStyledReportForReport } from "./writing-style";

export type ReportAudience = "public" | "personal";
export type ReportRange = "24h" | "72h" | "7d" | "30d" | "90d";

export const reportAudiences = ["public", "personal"] as const;
export const reportRanges = ["24h", "72h", "7d", "30d", "90d"] as const;

export type ReportCluster = {
  id: string;
  title: string;
  summary: string;
  sources: string;
  distinctSources: number;
  itemsWindow: number;
  score: number;
};

export type ReportDraft = {
  reportDate: string;
  title: string;
  generatedAt: string;
  audience: ReportAudience;
  range: ReportRange;
  topN: number;
  minSources: number;
  metrics: {
    itemsWindow: number;
    activeSourcesWindow: number;
    clustersWindow: number;
    attentionIndex: number;
    consensusIndex: number;
    breakingIndex: number;
    crossSourceClusterRate: number;
  };
  clusters: ReportCluster[];
  keywords: Array<{
    keyword: string;
    title: string;
    summary: string;
    mentions: number;
    distinctSources: number;
    attentionScore: number;
  }>;
  items: Array<{
    id: string;
    title: string;
    sourceName: string;
    url: string | null;
    publishedAt: string | null;
    tags: string[];
    summary: string;
  }>;
};

export type RenderedReport = {
  draft: ReportDraft;
  markdown: string;
  wechatHtml: string;
  feishuPayload: unknown;
  obsidianMarkdown: string;
};

export type GenerateReportInput = {
  audience?: ReportAudience;
  range?: ReportRange;
  topN?: number;
  minSources?: number;
  reportDate?: string;
  timezone?: string;
  trigger?: string;
};

function clampInt(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value!), min), max);
}

export function normalizeReportAudience(value: unknown): ReportAudience {
  return value === "public" || value === "personal" ? value : "personal";
}

export function normalizeReportRange(value: unknown): ReportRange {
  return reportRanges.includes(value as ReportRange) ? value as ReportRange : "24h";
}

export function normalizeReportTargets(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const allowed = new Set(["wechat", "feishu", "obsidian"]);
  const targets = value.filter((item): item is "wechat" | "feishu" | "obsidian" =>
    typeof item === "string" && allowed.has(item),
  );
  return targets.length > 0 ? Array.from(new Set(targets)) : undefined;
}

export function reportDateInTimezone(now = new Date(), timezone = "Asia/Shanghai") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return `${map.get("year")}-${map.get("month")}-${map.get("day")}`;
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeMarkdown(value: string) {
  return value.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

export function topicSlug(title: string) {
  return title
    .normalize("NFKD")
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled";
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function asReportCluster(row: Record<string, unknown>): ReportCluster {
  const title = text(row.displayTitle, text(row.topic, "未命名事件"));
  const why = Array.isArray(row.whyAttention)
    ? row.whyAttention.filter((item): item is string => typeof item === "string")
    : [];
  return {
    id: text(row.id, title),
    title,
    summary: why.length > 0 ? why.join("；") : "多来源信号进入日报候选。",
    sources: text(row.sourceNames, ""),
    distinctSources: numberValue(row.distinctSources, numberValue(row.distinct_sources, 0)),
    itemsWindow: numberValue(row.itemsWindow, numberValue(row.items_window, 0)),
    score: numberValue(row.attentionScore, numberValue(row.consensusScore, 0)),
  };
}

function itemTitle(row: ItemListRow) {
  return row.titleZh || row.title || row.url || row.id.slice(0, 8);
}

function itemSummary(row: ItemListRow) {
  return row.eventSummary || row.contentSummaryZh || row.contentZh || row.contentText || "";
}

function itemMarkdownLink(item: ReportDraft["items"][number]) {
  return item.url ? `[${escapeMarkdown(item.title)}](${item.url})` : escapeMarkdown(item.title);
}

function isPaperLike(item: ReportDraft["items"][number]) {
  const haystack = `${item.title} ${item.url ?? ""} ${item.sourceName} ${item.tags.join(" ")}`.toLowerCase();
  return /\barxiv\b|paper|论文|research|neurips|iclr|icml|acl|cvpr|openreview|huggingface\.co\/papers/.test(haystack);
}

function isProductLike(item: ReportDraft["items"][number]) {
  const haystack = `${item.title} ${item.summary} ${item.sourceName} ${item.tags.join(" ")}`.toLowerCase();
  return /launch|release|update|product|api|agent|model|tool|browser|app|github|发布|更新|产品|工具|模型|开源/.test(haystack);
}

function firstOrFallback<T>(values: T[], fallback: T[]) {
  return values.length ? values : fallback;
}

function renderFactualMarkdown(draft: ReportDraft) {
  const metricLines = [
    `- 窗口条目：${draft.metrics.itemsWindow}`,
    `- 活跃信源：${draft.metrics.activeSourcesWindow}`,
    `- 事件簇：${draft.metrics.clustersWindow}`,
    `- 关注指数：${draft.metrics.attentionIndex.toFixed(2)}`,
    `- 跨源事件率：${formatPercent(draft.metrics.crossSourceClusterRate)}`,
  ];
  const clusterLines = draft.clusters.map((cluster, index) => {
    const sourceText = cluster.sources ? ` 来源：${cluster.sources}` : "";
    return `${index + 1}. ${cluster.title}\n   ${cluster.summary}\n   ${cluster.distinctSources} 个来源，${cluster.itemsWindow} 条，分数 ${cluster.score.toFixed(2)}。${sourceText}`;
  });
  const keywordLines = draft.keywords.map(
    (keyword, index) =>
      `${index + 1}. ${keyword.title}：${keyword.mentions} 次提及，${keyword.distinctSources} 个来源，分数 ${keyword.attentionScore.toFixed(2)}。${keyword.summary}`,
  );
  const itemLines = draft.items.map((item, index) =>
    `${index + 1}. ${itemMarkdownLink(item)} - ${item.sourceName}${item.summary ? `\n   ${item.summary.slice(0, 180)}` : ""}`,
  );

  return [
    `# ${draft.title}`,
    "",
    `生成时间：${draft.generatedAt}`,
    `范围：${draft.range} / ${draft.audience}`,
    "",
    "## 今日概览",
    ...metricLines,
    "",
    "## 热点事件",
    ...(clusterLines.length ? clusterLines : ["暂无进入阈值的热点事件。"]),
    "",
    "## 高频关键词",
    ...(keywordLines.length ? keywordLines : ["暂无关键词。"]),
    "",
    "## 代表文章",
    ...(itemLines.length ? itemLines : ["暂无代表文章。"]),
    "",
  ].join("\n");
}

function renderWechatHtml(draft: ReportDraft) {
  const metricLines = [
    `窗口条目：${draft.metrics.itemsWindow}`,
    `活跃信源：${draft.metrics.activeSourcesWindow}`,
    `事件簇：${draft.metrics.clustersWindow}`,
    `关注指数：${draft.metrics.attentionIndex.toFixed(2)}`,
  ];
  return [
    `<h1>${escapeHtml(draft.title)}</h1>`,
    `<p><strong>生成时间：</strong>${escapeHtml(draft.generatedAt)}</p>`,
    "<h2>今日概览</h2>",
    "<ul>",
    ...metricLines.map((line) => `<li>${escapeHtml(line)}</li>`),
    "</ul>",
    "<h2>热点事件</h2>",
    ...draft.clusters.map(
      (cluster, index) =>
        `<section><h3>${index + 1}. ${escapeHtml(cluster.title)}</h3><p>${escapeHtml(cluster.summary)}</p><p>${cluster.distinctSources} 个来源，${cluster.itemsWindow} 条，分数 ${cluster.score.toFixed(2)}</p><p>${escapeHtml(cluster.sources)}</p></section>`,
    ),
    "<h2>代表文章</h2>",
    "<ol>",
    ...draft.items.map((item) => {
      const title = escapeHtml(item.title);
      const href = item.url ? ` href="${escapeHtml(item.url)}"` : "";
      return `<li><a${href}>${title}</a> - ${escapeHtml(item.sourceName)}</li>`;
    }),
    "</ol>",
  ].join("\n");
}

function renderFeishuRadar(draft: ReportDraft) {
  const papers = firstOrFallback(draft.items.filter(isPaperLike), draft.items).slice(0, 5);
  const productItems = firstOrFallback(draft.items.filter(isProductLike), draft.items).slice(0, 5);
  return {
    msg_type: "post",
    content: {
      post: {
        zh_cn: {
          title: `今日 AI 雷达 ${draft.reportDate}`,
          content: [
            [{ tag: "text", text: `概览：窗口条目 ${draft.metrics.itemsWindow}，活跃信源 ${draft.metrics.activeSourcesWindow}，事件簇 ${draft.metrics.clustersWindow}，关注指数 ${draft.metrics.attentionIndex.toFixed(2)}\n` }],
            [{ tag: "text", text: "最受关注\n" }],
            ...draft.clusters.slice(0, 3).map((cluster, index) => [
              { tag: "text", text: `${index + 1}. ${cluster.title} - ${cluster.summary}\n` },
            ]),
            [{ tag: "text", text: "最新研究/论文\n" }],
            ...papers.map((item, index) => [
              item.url
                ? { tag: "a", text: `${index + 1}. ${item.title}`, href: item.url }
                : { tag: "text", text: `${index + 1}. ${item.title}` },
              { tag: "text", text: ` - ${item.sourceName}\n` },
            ]),
            [{ tag: "text", text: "工程/产品动态\n" }],
            ...productItems.map((item, index) => [
              item.url
                ? { tag: "a", text: `${index + 1}. ${item.title}`, href: item.url }
                : { tag: "text", text: `${index + 1}. ${item.title}` },
              { tag: "text", text: ` - ${item.sourceName}\n` },
            ]),
            [{ tag: "text", text: "值得继续追踪：优先看跨源信号、论文链接、能改变工作流的 Agent/工具动态。\n" }],
          ],
        },
      },
    },
  };
}

function renderObsidianLedger(draft: ReportDraft) {
  const papers = firstOrFallback(draft.items.filter(isPaperLike), draft.items).slice(0, 8);
  const productItems = firstOrFallback(draft.items.filter(isProductLike), draft.items).slice(0, 8);
  const oddIdeas = draft.clusters.filter((cluster) => cluster.score >= 0.8).slice(0, 5);
  return [
    "---",
    `date: ${draft.reportDate}`,
    "type: ai-knowledge-ledger",
    `range: ${draft.range}`,
    `audience: ${draft.audience}`,
    `items: ${draft.metrics.itemsWindow}`,
    `clusters: ${draft.metrics.clustersWindow}`,
    "---",
    "",
    `# AI Knowledge Ledger - ${draft.reportDate}`,
    "",
    "## 今日概览",
    `- 窗口条目：${draft.metrics.itemsWindow}`,
    `- 活跃信源：${draft.metrics.activeSourcesWindow}`,
    `- 关注指数：${draft.metrics.attentionIndex.toFixed(2)}`,
    "",
    "## 最新论文与研究",
    ...(papers.length
      ? papers.map((item) => `- ${itemMarkdownLink(item)}\n  - 来源：${item.sourceName}\n  - 摘要：${item.summary || "待补充阅读笔记"}`)
      : ["- 今天没有识别到强论文候选。"]),
    "",
    "## 新奇想法",
    ...(oddIdeas.length
      ? oddIdeas.map((cluster) => `- ${cluster.title}\n  - ${cluster.summary}\n  - 为什么新奇：跨源出现且关注分数 ${cluster.score.toFixed(2)}，值得后续人工判断。`)
      : ["- 暂无显著的新奇想法。"]),
    "",
    "## 工程与产品动态",
    ...(productItems.length
      ? productItems.map((item) => `- ${itemMarkdownLink(item)} - ${item.sourceName}\n  - ${item.summary || "待补充影响判断"}`)
      : ["- 暂无明显工程/产品动态。"]),
    "",
    "## 可沉淀的知识卡片",
    ...renderTopicCards(draft).map((card) => `- [[Topics/${card.slug}|${card.title}]]`),
    "",
    "## 原始链接",
    ...draft.items.map((item) => `- ${itemMarkdownLink(item)} - ${item.sourceName}`),
    "",
  ].join("\n");
}

export function renderReport(draft: ReportDraft): RenderedReport {
  return {
    draft,
    markdown: renderFactualMarkdown(draft),
    wechatHtml: renderWechatHtml(draft),
    feishuPayload: renderFeishuRadar(draft),
    obsidianMarkdown: renderObsidianLedger(draft),
  };
}

export function renderTopicCards(draft: ReportDraft) {
  return draft.clusters.map((cluster) => ({
    slug: topicSlug(cluster.title),
    title: cluster.title,
    markdown: [
      `## ${draft.reportDate} - ${cluster.title}`,
      "",
      cluster.summary,
      "",
      `- 日报：[[${draft.reportDate}]]`,
      `- 来源数：${cluster.distinctSources}`,
      `- 条目数：${cluster.itemsWindow}`,
      `- 分数：${cluster.score.toFixed(2)}`,
      cluster.sources ? `- 来源：${cluster.sources}` : "",
      "",
      "### 后续阅读问题",
      "- 这是真变化，还是单日噪声？",
      "- 它会改变研究、产品还是工作流？",
      "- 是否需要单独写成公众号解读？",
      "",
    ].filter(Boolean).join("\n"),
  }));
}

export async function buildDailyReport(input: GenerateReportInput = {}): Promise<RenderedReport> {
  const audience = input.audience ?? "personal";
  const range = input.range ?? "24h";
  const topN = clampInt(input.topN, 10, 1, 30);
  const minSources = clampInt(input.minSources, 1, 1, 20);
  const reportDate = input.reportDate ?? reportDateInTimezone(new Date(), input.timezone ?? "Asia/Shanghai");
  const overview = await getHotspotOverview({
    range,
    audience,
    topN,
    minSources,
    compare: false,
  });
  const items = await listItems({
    feed: "all",
    audience,
    limit: topN,
    publishedSince: new Date(Date.now() - 24 * 3600 * 1000),
    sortBy: "published",
  });
  const clustersRaw = (overview.consensusClusters ?? overview.topClusters ?? []) as Array<Record<string, unknown>>;
  const keywordsRaw = (overview.keywordGroups ?? []) as Array<Record<string, unknown>>;
  const draft: ReportDraft = {
    reportDate,
    title: `News Monitor 日报 ${reportDate}`,
    generatedAt: new Date().toISOString(),
    audience,
    range,
    topN,
    minSources,
    metrics: {
      itemsWindow: overview.totals.items_window,
      activeSourcesWindow: overview.totals.active_sources_window,
      clustersWindow: overview.totals.clusters_window,
      attentionIndex: numberValue(overview.hotspot.attentionIndex, numberValue(overview.hotspot.hotspotIndex, 0)),
      consensusIndex: numberValue(overview.hotspot.consensusHotspotIndex, 0),
      breakingIndex: numberValue(overview.hotspot.breakingHotspotIndex, 0),
      crossSourceClusterRate: numberValue(overview.hotspot.crossSourceClusterRate, 0),
    },
    clusters: clustersRaw.slice(0, topN).map(asReportCluster),
    keywords: keywordsRaw.slice(0, topN).map((keyword) => ({
      keyword: text(keyword.keyword, ""),
      title: text(keyword.displayTitle, text(keyword.keyword, "未命名关键词")),
      summary: text(keyword.summary, ""),
      mentions: numberValue(keyword.mentions, 0),
      distinctSources: numberValue(keyword.distinctSources, 0),
      attentionScore: numberValue(keyword.attentionScore, 0),
    })),
    items: items.map((item) => ({
      id: item.id,
      title: itemTitle(item),
      sourceName: item.sourceName,
      url: item.url,
      publishedAt: (item.publishedAt ?? item.fetchedAt)?.toISOString() ?? null,
      tags: item.tags ?? [],
      summary: itemSummary(item).slice(0, 240),
    })),
  };
  return renderReport(draft);
}

export async function generateAndSaveDailyReport(input: GenerateReportInput = {}) {
  const run = await createReportRun({
    trigger: input.trigger ?? "manual",
    params: input,
  });
  try {
    const rendered = await buildDailyReport(input);
    const report = await upsertReport({
      reportDate: rendered.draft.reportDate,
      title: rendered.draft.title,
      audience: rendered.draft.audience,
      range: rendered.draft.range,
      topN: rendered.draft.topN,
      minSources: rendered.draft.minSources,
      draft: rendered.draft,
      markdown: rendered.markdown,
      wechatHtml: rendered.wechatHtml,
      feishuPayload: rendered.feishuPayload,
      obsidianMarkdown: rendered.obsidianMarkdown,
      status: "draft",
    });
    let finalReport = report;
    if (report?.id) {
      try {
        finalReport = await generateStyledReportForReport(report.id) ?? report;
      } catch {
        finalReport = report;
      }
    }
    if (run) {
      await finishReportRun({ id: run.id, reportId: finalReport?.id ?? report?.id ?? null, status: "ok" });
    }
    return finalReport;
  } catch (error) {
    if (run) {
      await finishReportRun({
        id: run.id,
        status: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }
}
