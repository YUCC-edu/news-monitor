import {
  getActiveWritingStyleProfile,
  getReportWithAttempts,
  listWritingStyleSamples,
  setReportStyledContent,
  type Report,
  type WritingStyleProfile,
} from "@news/db";
import type { ReportDraft } from "./reports";
import { buildWanderImagePrompt } from "./visual-style";

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

function cleanBlock(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueClean(values: unknown) {
  if (!Array.isArray(values)) return [] as string[];
  return Array.from(new Set(values.map((value) => cleanText(value)).filter(Boolean)));
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>|<\/section>|<\/div>|<\/h[1-6]>/gi, "\n")
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
  return Array.from(new Set(title.match(/[：:，,。！？?——《》「」]/g) ?? []));
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
  const preferredSectionCount = Math.max(1, average(signals.map((signal) => signal.headingCount), 3));
  const averageParagraphLength = Math.max(20, average(signals.map((signal) => signal.averageParagraphLength), 80));
  const openingStyle = firstNonEmpty(
    signals.map((signal) => signal.opening),
    "从一个正在发生的 AI 变化切入，先把现象说清楚。",
  );
  const endingStyle = firstNonEmpty(
    signals.map((signal) => signal.ending),
    "最后用一个可持续追踪的问题收束。",
  );
  const dominantNote = imageNotes.join("; ") || "clean editorial technology style, restrained colors, low text density";
  return {
    name: "Default WeChat Style",
    sampleCount: normalized.length,
    rules: {
      summary: `已从 ${normalized.length} 篇历史文章提炼：标题偏判断句，正文按现象、脉络、判断、追踪展开，配图保持克制清晰。`,
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
        htmlSectionStyle: "compact WeChat mobile layout, clear h2 blocks, image placeholders between sections",
      },
      image: {
        coverPrompt: `cover image, ${dominantNote}`,
        inlinePrompt: `section illustration or information diagram, ${dominantNote}`,
        notes: imageNotes,
      },
    },
  };
}

function mainTopic(draft: ReportDraft) {
  return draft.clusters[0]?.title ?? draft.keywords[0]?.title ?? draft.items[0]?.title ?? "今日 AI 信号";
}

function titleFromDraft(draft: ReportDraft) {
  return `从 ${mainTopic(draft)} 看 AI 正在发生什么`;
}

function sourceLine(draft: ReportDraft) {
  const cluster = draft.clusters[0];
  if (!cluster) return `今天窗口里共有 ${draft.metrics.itemsWindow} 条内容进入观察。`;
  return `这不是单条新闻的热闹，而是 ${cluster.distinctSources} 个来源、${cluster.itemsWindow} 条内容同时指向同一个变化：${cluster.summary}`;
}

function representativeLinks(draft: ReportDraft) {
  return draft.items.slice(0, 5).map((item, index) => {
    const link = item.url ? `[${item.title}](${item.url})` : item.title;
    return `${index + 1}. ${link} - ${item.sourceName}${item.summary ? `\n   ${item.summary}` : ""}`;
  });
}

function imageBriefsFor(draft: ReportDraft, profile: LearnedWritingStyleProfile): StyledReportVariant["imageBriefs"] {
  const topic = mainTopic(draft);
  const base = "suitable for image2 generation, mobile WeChat article";
  const coverPrompt = `${buildWanderImagePrompt({
    kind: "cover",
    topic,
    scene: "night workspace, creator at laptop, quiet AI frontier exploration, title-safe area on the left",
  })} ${profile.rules.image.coverPrompt}; ${base}.`;
  const sections = [
    {
      kind: "section" as const,
      topic: "发展脉络",
      prompt: `${buildWanderImagePrompt({
        kind: "section",
        topic,
        scene: "timeline showing LLM brain, Agent executor, Skills modules, and repeatable workflows",
      })} ${profile.rules.image.inlinePrompt}; ${base}.`,
    },
    {
      kind: "section" as const,
      topic: "为什么值得关注",
      prompt: `${buildWanderImagePrompt({
        kind: "section",
        topic,
        scene: "information diagram explaining research, product, workflow, and knowledge impact",
      })} ${profile.rules.image.inlinePrompt}; ${base}.`,
    },
    {
      kind: "section" as const,
      topic: "接下来追踪",
      prompt: `${buildWanderImagePrompt({
        kind: "ending",
        topic,
        scene: "closing postcard and watchlist with paper, product, and workflow branches",
      })} ${profile.rules.image.inlinePrompt}; ${base}.`,
    },
  ];
  return [{ kind: "cover", topic, prompt: coverPrompt }, ...sections];
}

export function renderStyledReport(draft: ReportDraft, profile: LearnedWritingStyleProfile): StyledReportVariant {
  const title = titleFromDraft(draft);
  const topic = mainTopic(draft);
  const links = representativeLinks(draft);
  const markdownLines = [
    `# ${title}`,
    "",
    "[[image2:cover]]",
    "",
    "大家好，我是云上。",
    "",
    `今天这个信号值得单独拿出来看：${topic}。`,
    "",
    sourceLine(draft),
    "",
    "它真正有意思的地方，不在于某个产品又更新了一次，而在于 AI 的能力正在从“模型回答问题”，继续往“系统完成任务”移动。",
    "",
    "[[image2:section-1]]",
    "",
    "## 发展脉络",
    "",
    "如果把这条线拆开，大概可以看到三个层次：",
    "",
    "第一层是模型能力本身。LLM 负责理解、生成、推理，是整个系统的大脑。",
    "",
    "第二层是 Agent。它把模型放进一个可以调用工具、观察结果、继续行动的任务框架里。",
    "",
    "第三层是 Skill 或固定工作流。它把经验沉淀成可复用的动作，让模型不只是会聊天，而是能稳定交付。",
    "",
    "[[image2:section-2]]",
    "",
    "## 为什么值得关注",
    "",
    `这次窗口里出现了 ${draft.metrics.itemsWindow} 条内容、${draft.metrics.clustersWindow} 个事件簇，说明它不是一个孤立噪声。`,
    "",
    "我的判断是：接下来真正拉开差距的，可能不是谁的模型名字更响，而是谁能把模型、上下文、工具和工作流组织得更稳定。",
    "",
    "这也是我会持续追踪 AI 论文、产品动态和工程实践的原因。论文给方向，产品给验证，工作流给落地。",
    "",
    "[[image2:section-3]]",
    "",
    "## 接下来追踪",
    "",
    "接下来我会重点看三件事：",
    "",
    "1. 有没有新的论文把这类能力讲得更清楚。",
    "2. 有没有产品真的把它做成可重复使用的工作流。",
    "3. 有没有新奇但还没有被充分讨论的想法冒出来。",
    "",
    "## 代表线索",
    "",
    ...(links.length ? links : ["暂无代表线索。"]),
    "",
    "## 最后",
    "",
    profile.rules.structure.endingStyle,
    "",
  ];
  const markdown = markdownLines.join("\n");
  const section = (heading: string, body: string) => [
    `<section style="margin:24px 0;">`,
    `<h2 style="margin:0 0 10px;font-size:20px;line-height:1.5;font-weight:700;">${escapeHtml(heading)}</h2>`,
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.9;letter-spacing:1px;color:#1f2937;">${escapeHtml(body)}</p>`,
    `</section>`,
  ].join("");
  const itemsHtml = draft.items.slice(0, 5).map((item) => {
    const titleHtml = item.url
      ? `<a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a>`
      : escapeHtml(item.title);
    return `<li style="margin:8px 0;line-height:1.7;">${titleHtml} <span style="color:#64748b;">- ${escapeHtml(item.sourceName)}</span></li>`;
  }).join("");
  const wechatHtml = [
    `<h1 style="font-size:22px;line-height:1.35;margin:0 0 16px;">${escapeHtml(title)}</h1>`,
    `<p style="text-align:center;color:#64748b;">image2: cover</p>`,
    `<p style="font-size:15px;line-height:1.9;letter-spacing:1px;">大家好，我是云上。今天这个信号值得单独拿出来看：${escapeHtml(topic)}。</p>`,
    `<p style="font-size:15px;line-height:1.9;letter-spacing:1px;">${escapeHtml(sourceLine(draft))}</p>`,
    `<p style="text-align:center;color:#64748b;">image2: section-1</p>`,
    section("发展脉络", "LLM 是大脑，Agent 是任务框架，Skill 和固定工作流则把经验沉淀成可复用动作。"),
    `<p style="text-align:center;color:#64748b;">image2: section-2</p>`,
    section("为什么值得关注", `这次窗口里出现了 ${draft.metrics.itemsWindow} 条内容、${draft.metrics.clustersWindow} 个事件簇，说明它不是一个孤立噪声。`),
    `<p style="text-align:center;color:#64748b;">image2: section-3</p>`,
    section("接下来追踪", "接下来重点看论文方向、产品验证、以及能不能沉淀成稳定工作流。"),
    `<h2 style="font-size:20px;line-height:1.5;">代表线索</h2>`,
    `<ol style="padding-left:20px;">${itemsHtml || "<li>暂无代表线索。</li>"}</ol>`,
    `<p style="font-size:15px;line-height:1.9;letter-spacing:1px;">${escapeHtml(profile.rules.structure.endingStyle)}</p>`,
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

function cleanWechatDigest(markdown: string) {
  return markdown
    .replace(/[#*_`>\-[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function markdownToWechatHtml(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const html: string[] = [];
  let listOpen = false;
  const closeList = () => {
    if (listOpen) {
      html.push("</ol>");
      listOpen = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }
    const imageMatch = line.match(/^\[\[image2:([^\]]+)]]$/);
    if (imageMatch) {
      closeList();
      html.push(`<p style="text-align:center;color:#64748b;margin:18px 0;">image2: ${escapeHtml(imageMatch[1] ?? "section")}</p>`);
      continue;
    }
    if (line.startsWith("# ")) {
      closeList();
      html.push(`<h1 style="font-size:22px;line-height:1.35;margin:0 0 16px;">${escapeHtml(line.slice(2))}</h1>`);
      continue;
    }
    if (line.startsWith("## ")) {
      closeList();
      html.push(`<h2 style="margin:24px 0 10px;font-size:20px;line-height:1.5;font-weight:700;">${escapeHtml(line.slice(3))}</h2>`);
      continue;
    }
    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      if (!listOpen) {
        html.push(`<ol style="padding-left:20px;margin:10px 0;">`);
        listOpen = true;
      }
      html.push(`<li style="margin:8px 0;line-height:1.8;">${escapeHtml(ordered[1] ?? "")}</li>`);
      continue;
    }
    closeList();
    html.push(`<p style="font-size:15px;line-height:1.9;letter-spacing:1px;margin:0 0 12px;color:#1f2937;">${escapeHtml(line)}</p>`);
  }

  closeList();
  return html.join("\n");
}

export function selectWechatArticleFields(report: ReportWithStyledFields) {
  return {
    title: cleanText(report.styledTitle) || report.title,
    markdown: cleanBlock(report.styledMarkdown) || report.markdown,
    wechatHtml: cleanBlock(report.styledWechatHtml) || report.wechatHtml,
  };
}

export function buildWechatDraftArticle(report: ReportWithStyledFields) {
  const article = selectWechatArticleFields(report);
  const styledMarkdown = cleanBlock(report.styledMarkdown);
  const styledHtml = cleanBlock(report.styledWechatHtml);
  const usingStyledContent = Boolean(styledHtml || styledMarkdown);
  const content = styledHtml || (styledMarkdown ? markdownToWechatHtml(report.styledMarkdown ?? "") : article.wechatHtml);
  return {
    title: article.title.slice(0, 64),
    author: "News Monitor",
    digest: cleanWechatDigest(article.markdown),
    content,
    markdown: article.markdown,
    contentSource: usingStyledContent ? "styled" as const : "factual" as const,
  };
}
