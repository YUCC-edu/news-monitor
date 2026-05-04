import {
  getActiveWritingStyleProfile,
  getReportWithAttempts,
  listWritingStyleSamples,
  setReportStyledContent,
  type Report,
  type WritingStyleProfile,
} from "@news/db";
import type { ReportDraft } from "./reports";

export type WritingStyleSampleInput = {
  title: string;
  sourceUrl?: string | null;
  contentMarkdown?: string | null;
  wechatHtml?: string | null;
  coverImageUrl?: string | null;
  inlineImages?: string[] | null;
  imageNotes?: string | null;
};

export type NormalizedWritingStyleSample = {
  title: string;
  sourceUrl: string | null;
  contentMarkdown: string;
  wechatHtml: string;
  bodyText: string;
  coverImageUrl: string | null;
  inlineImages: string[];
  imageNotes: string;
};

export type WritingStyleSignals = {
  titlePunctuation: string[];
  headingCount: number;
  paragraphCount: number;
  averageParagraphLength: number;
  opening: string;
  ending: string;
  imageCount: number;
  imageNotes: string[];
};

export type WritingStyleProfileRules = {
  summary: string;
  title: {
    patterns: string[];
    punctuation: string[];
  };
  structure: {
    preferredSectionCount: number;
    averageParagraphLength: number;
    openingStyle: string;
    endingStyle: string;
  };
  layout: {
    headingPrefix: string;
    paragraphTone: string;
    htmlSectionStyle: string;
  };
  image: {
    coverPrompt: string;
    inlinePrompt: string;
    notes: string[];
  };
};

export type LearnedWritingStyleProfile = {
  id?: string;
  name: string;
  sampleCount: number;
  rules: WritingStyleProfileRules;
  updatedAt?: string;
};

export type StyledReportVariant = {
  title: string;
  markdown: string;
  wechatHtml: string;
  imageBriefs: Array<{
    kind: "cover" | "section";
    topic: string;
    prompt: string;
  }>;
  styleSummary: string;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function uniqueClean(values: unknown) {
  if (!Array.isArray(values)) return [] as string[];
  return Array.from(
    new Set(values.map((value) => cleanText(value)).filter(Boolean)),
  );
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function markdownBody(markdown: string) {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.replace(/^#{1,6}\s+/, "").trim())
    .filter(Boolean)
    .join("\n");
}

function paragraphsFrom(text: string) {
  return text
    .split(/\n{2,}|\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^#{1,6}\s+/.test(line));
}

function headingsFrom(markdown: string, html: string) {
  const markdownHeadings = markdown.match(/^#{1,6}\s+.+$/gm) ?? [];
  const htmlHeadings = html.match(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi) ?? [];
  return markdownHeadings.length + htmlHeadings.length;
}

function titlePunctuation(title: string) {
  return Array.from(new Set(title.match(/[：:，,。！？!?、|｜-]/g) ?? []));
}

function average(values: number[], fallback = 0) {
  if (values.length === 0) return fallback;
  return Math.round(values.reduce((acc, value) => acc + value, 0) / values.length);
}

function firstNonEmpty(values: string[], fallback: string) {
  return values.find((value) => value.trim()) ?? fallback;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function normalizeWritingStyleSample(input: WritingStyleSampleInput): NormalizedWritingStyleSample {
  const title = cleanText(input.title);
  const contentMarkdown = typeof input.contentMarkdown === "string" ? input.contentMarkdown.trim() : "";
  const wechatHtml = typeof input.wechatHtml === "string" ? input.wechatHtml.trim() : "";
  const markdownText = markdownBody(contentMarkdown);
  const htmlText = stripHtml(wechatHtml);
  return {
    title,
    sourceUrl: cleanText(input.sourceUrl) || null,
    contentMarkdown,
    wechatHtml,
    bodyText: markdownText || htmlText,
    coverImageUrl: cleanText(input.coverImageUrl) || null,
    inlineImages: uniqueClean(input.inlineImages),
    imageNotes: cleanText(input.imageNotes),
  };
}

export function extractWritingStyleSignals(sample: NormalizedWritingStyleSample): WritingStyleSignals {
  const paragraphs = paragraphsFrom(sample.contentMarkdown || sample.bodyText);
  const imageNotes = sample.imageNotes ? [sample.imageNotes] : [];
  return {
    titlePunctuation: titlePunctuation(sample.title),
    headingCount: headingsFrom(sample.contentMarkdown, sample.wechatHtml),
    paragraphCount: paragraphs.length,
    averageParagraphLength: average(paragraphs.map((paragraph) => paragraph.length), sample.bodyText.length),
    opening: paragraphs[0] ?? sample.bodyText.slice(0, 80),
    ending: paragraphs[paragraphs.length - 1] ?? sample.bodyText.slice(-80),
    imageCount: (sample.coverImageUrl ? 1 : 0) + sample.inlineImages.length,
    imageNotes,
  };
}

export function learnWritingStyleFromSamples(samples: WritingStyleSampleInput[]): LearnedWritingStyleProfile {
  const normalized = samples
    .map(normalizeWritingStyleSample)
    .filter((sample) => sample.title && sample.bodyText);
  const signals = normalized.map(extractWritingStyleSignals);
  const punctuation = Array.from(new Set(signals.flatMap((signal) => signal.titlePunctuation)));
  const imageNotes = Array.from(new Set(signals.flatMap((signal) => signal.imageNotes)));
  const preferredSectionCount = Math.max(1, average(signals.map((signal) => signal.headingCount), 2));
  const averageParagraphLength = Math.max(20, average(signals.map((signal) => signal.averageParagraphLength), 80));
  const openingStyle = firstNonEmpty(
    signals.map((signal) => signal.opening),
    "从一个具体变化切入，再给出判断。",
  );
  const endingStyle = firstNonEmpty(
    signals.map((signal) => signal.ending),
    "用一句可持续跟踪的判断收束。",
  );
  const dominantNote = imageNotes.join("；") || "clean editorial technology style, restrained colors, low text density";
  return {
    name: "Default WeChat Style",
    sampleCount: normalized.length,
    rules: {
      summary: `已从 ${normalized.length} 篇历史文章提炼：标题偏判断句，正文按信号、判断、影响展开，配图保持克制清晰。`,
      title: {
        patterns: normalized.slice(0, 5).map((sample) => sample.title),
        punctuation,
      },
      structure: {
        preferredSectionCount,
        averageParagraphLength,
        openingStyle,
        endingStyle,
      },
      layout: {
        headingPrefix: "##",
        paragraphTone: "克制、判断明确、少形容词、先事实后观点",
        htmlSectionStyle: "border-left accent, compact paragraph spacing, readable mobile width",
      },
      image: {
        coverPrompt: `cover image, ${dominantNote}`,
        inlinePrompt: `section illustration or information diagram, ${dominantNote}`,
        notes: imageNotes,
      },
    },
  };
}

function titleFromDraft(draft: ReportDraft) {
  const first = draft.clusters[0]?.title ?? draft.keywords[0]?.title ?? "今日信号";
  return `${first}：今天值得单独看`;
}

function renderOpening(draft: ReportDraft, profile: LearnedWritingStyleProfile) {
  const clusterCount = draft.clusters.length;
  const itemCount = draft.metrics.itemsWindow;
  return `今天的重点不在信息数量，而在 ${clusterCount} 个信号已经从 ${itemCount} 条内容里浮出来。按「${profile.rules.layout.paragraphTone}」的方式看，最值得先看的是下面这些变化。`;
}

function renderMarkdownSections(draft: ReportDraft) {
  const clusterLines = draft.clusters.slice(0, 6).flatMap((cluster, index) => [
    `## ${index + 1}. ${cluster.title}`,
    "",
    cluster.summary,
    "",
    `信号强度：${cluster.distinctSources} 个来源，${cluster.itemsWindow} 条内容，分数 ${cluster.score.toFixed(2)}。`,
    cluster.sources ? `来源：${cluster.sources}` : "",
    "",
  ].filter(Boolean));
  const itemLines = draft.items.slice(0, 5).map((item, index) => {
    const link = item.url ? `[${item.title}](${item.url})` : item.title;
    return `${index + 1}. ${link} - ${item.sourceName}${item.summary ? `\n   ${item.summary}` : ""}`;
  });
  return [
    ...clusterLines,
    "## 可以继续跟踪的线索",
    "",
    ...(itemLines.length ? itemLines : ["暂无代表文章。"]),
  ];
}

function imageBriefsFor(draft: ReportDraft, profile: LearnedWritingStyleProfile): StyledReportVariant["imageBriefs"] {
  const firstTopic = draft.clusters[0]?.title ?? draft.title;
  const coverPrompt = `${profile.rules.image.coverPrompt}; topic: ${firstTopic}; no dense text, suitable for WeChat cover.`;
  const sectionBriefs = draft.clusters.slice(0, 3).map((cluster) => ({
    kind: "section" as const,
    topic: cluster.title,
    prompt: `${profile.rules.image.inlinePrompt}; visualize ${cluster.title}; keep it clear for mobile reading.`,
  }));
  return [
    { kind: "cover", topic: firstTopic, prompt: coverPrompt },
    ...sectionBriefs,
  ];
}

export function renderStyledReport(draft: ReportDraft, profile: LearnedWritingStyleProfile): StyledReportVariant {
  const title = titleFromDraft(draft);
  const markdownLines = [
    `# ${title}`,
    "",
    renderOpening(draft, profile),
    "",
    ...renderMarkdownSections(draft),
    "",
    "## 最后",
    "",
    profile.rules.structure.endingStyle,
    "",
  ];
  const markdown = markdownLines.join("\n");
  const sectionHtml = draft.clusters.slice(0, 6).map((cluster, index) => [
    `<section style="margin:20px 0;padding:14px 16px;border-left:4px solid #2f6fed;background:#f7f9fc;border-radius:6px;">`,
    `<h2 style="margin:0 0 8px;font-size:18px;line-height:1.45;">${index + 1}. ${escapeHtml(cluster.title)}</h2>`,
    `<p style="margin:0 0 8px;line-height:1.8;color:#1f2937;">${escapeHtml(cluster.summary)}</p>`,
    `<p style="margin:0;color:#64748b;font-size:13px;">${cluster.distinctSources} 个来源，${cluster.itemsWindow} 条内容，分数 ${cluster.score.toFixed(2)}</p>`,
    `</section>`,
  ].join(""));
  const itemsHtml = draft.items.slice(0, 5).map((item) => {
    const titleHtml = item.url
      ? `<a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a>`
      : escapeHtml(item.title);
    return `<li style="margin:8px 0;line-height:1.7;">${titleHtml} <span style="color:#64748b;">- ${escapeHtml(item.sourceName)}</span></li>`;
  }).join("");
  const wechatHtml = [
    `<h1 style="font-size:22px;line-height:1.35;margin:0 0 16px;">${escapeHtml(title)}</h1>`,
    `<p style="line-height:1.9;color:#1f2937;">${escapeHtml(renderOpening(draft, profile))}</p>`,
    sectionHtml,
    `<h2 style="font-size:18px;margin:24px 0 8px;">可以继续跟踪的线索</h2>`,
    `<ol style="padding-left:20px;">${itemsHtml || "<li>暂无代表文章。</li>"}</ol>`,
    `<p style="line-height:1.9;color:#1f2937;">${escapeHtml(profile.rules.structure.endingStyle)}</p>`,
  ].join("\n");
  return {
    title,
    markdown,
    wechatHtml,
    imageBriefs: imageBriefsFor(draft, profile),
    styleSummary: profile.rules.summary,
  };
}

function learnedProfileFromDb(profile: WritingStyleProfile): LearnedWritingStyleProfile | null {
  const rules = profile.rules as WritingStyleProfileRules | null;
  if (!rules || typeof rules !== "object") return null;
  return {
    id: profile.id,
    name: profile.name,
    sampleCount: profile.sampleCount,
    rules,
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export function hasUsableWritingStyleProfile(profile: Pick<WritingStyleProfile, "sampleCount" | "rules"> | null | undefined) {
  return Boolean(profile && profile.sampleCount > 0 && profile.rules && typeof profile.rules === "object");
}

export async function generateStyledReportForReport(reportId: string, profileId?: string) {
  const report = await getReportWithAttempts(reportId);
  if (!report) throw new Error("report not found");
  const activeProfile = await getActiveWritingStyleProfile(profileId);
  const learnedProfile = activeProfile ? learnedProfileFromDb(activeProfile) : null;
  if (!learnedProfile || learnedProfile.sampleCount <= 0) {
    return null;
  }
  const variant = renderStyledReport(report.draft as ReportDraft, learnedProfile);
  return setReportStyledContent({
    id: report.id,
    styleProfileId: learnedProfile.id ?? null,
    styledTitle: variant.title,
    styledMarkdown: variant.markdown,
    styledWechatHtml: variant.wechatHtml,
    styleImageBriefs: variant.imageBriefs,
  });
}

export async function learnActiveWritingStyleFromStoredSamples(profileId?: string) {
  const samples = await listWritingStyleSamples(200, profileId);
  return learnWritingStyleFromSamples(samples.map((sample) => ({
    title: sample.title,
    sourceUrl: sample.sourceUrl,
    contentMarkdown: sample.contentMarkdown,
    wechatHtml: sample.wechatHtml,
    coverImageUrl: sample.coverImageUrl,
    inlineImages: Array.isArray(sample.inlineImages) ? sample.inlineImages as string[] : [],
    imageNotes: sample.imageNotes,
  })));
}

export type ReportWithStyledFields = Pick<Report, "title" | "markdown" | "wechatHtml"> & {
  styledTitle?: string | null;
  styledMarkdown?: string | null;
  styledWechatHtml?: string | null;
};

export function selectWechatArticleFields(report: ReportWithStyledFields) {
  return {
    title: cleanText(report.styledTitle) || report.title,
    markdown: cleanText(report.styledMarkdown) || report.markdown,
    wechatHtml: cleanText(report.styledWechatHtml) || report.wechatHtml,
  };
}
