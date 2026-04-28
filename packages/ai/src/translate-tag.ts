import {
  CONTROLLED_TAGS,
  aiMode,
  deriveTaxonomyWithMeta,
  detectLangSimple,
  isControlledTag,
} from "@news/shared";
import { z } from "zod";
import { getLlmClient, type LlmClient } from "./llm-client";

const OutputSchema = z.object({
  lang: z.enum(["zh", "en"]).default("en"),
  title_zh: z.string().optional(),
  content_zh: z.string().optional(),
  content_summary_zh: z.string().optional(),
  event_summary: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  tags: z.array(z.string()).default([]),
  category_domain: z.array(z.string()).optional(),
  category_topic: z.array(z.string()).optional(),
  category_entity: z.array(z.string()).optional(),
});

function normalizeStringArray(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(/[\n,，;；|]/g)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

export type TranslateTagInput = {
  title?: string | null;
  contentText?: string | null;
  fullContentText?: string | null;
};

export type TranslateTagOutput = {
  lang: "zh" | "en";
  titleZh?: string;
  contentZh?: string;
  contentSummaryZh?: string;
  eventSummary?: string;
  llmKeywords: string[];
  tags: string[];
  categoryDomain: string[];
  categoryTopic: string[];
  categoryEntity: string[];
  categoryMeta: {
    confidence: { domain: number; topic: number; entity: number };
    source: {
      domain: "rule" | "llm" | "mixed";
      topic: "rule" | "llm" | "mixed";
      entity: "rule" | "llm" | "mixed";
    };
  };
};

function clampTags(tags: string[]) {
  const controlled = tags.filter((tag) => isControlledTag(tag));
  const free = tags.filter((tag) => !isControlledTag(tag)).slice(0, 2);
  return [...new Set([...controlled, ...free])].slice(0, 6);
}

function normalizeKeywordList(keywords: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of keywords) {
    const value = raw.replace(/\s+/g, " ").trim();
    if (!value || value.length > 48) continue;
    const key = value.normalize("NFKC").toLowerCase().replace(/[\s._-]+/g, "");
    if (key.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= 8) break;
  }
  return out;
}

export async function translateAndTag(
  input: TranslateTagInput,
  client?: LlmClient,
): Promise<TranslateTagOutput> {
  const title = input.title?.trim() ?? "";
  const feedContent = input.contentText?.trim() ?? "";
  const fullContent = input.fullContentText?.trim() ?? "";
  const content = fullContent || feedContent;
  const merged = `${title}\n${content}`.trim();
  const lang = detectLangSimple(merged);
  const bounded = content.slice(0, 4000);
  const mode = aiMode();
  if (!client && mode !== "llm") {
    return buildFallbackOutput({ title, content, lang });
  }

  const system = [
    "You are an AI news enrichment assistant.",
    "Return strictly JSON with keys: lang, title_zh, content_zh, content_summary_zh, event_summary, keywords, tags, category_domain, category_topic, category_entity.",
    "content_summary_zh should summarize the article/post in 1-2 concise Chinese sentences.",
    "event_summary should describe the concrete event or development in one short Chinese sentence.",
    "keywords should contain 3-8 important entities/products/topics, preserving product casing such as OpenAI, GPT-5, Claude, Gemini, DeepSeek.",
    `Prefer tags from controlled list: ${CONTROLLED_TAGS.join(", ")}`,
    "You may add at most 2 free-form tags.",
  ].join("\n");

  const user = JSON.stringify(
    {
      title,
      content_text: bounded,
      feed_summary: feedContent.slice(0, 800),
      source_lang_guess: lang,
      needs_translation: lang !== "zh",
    },
    null,
    2,
  );

  let parsed: z.infer<typeof OutputSchema>;
  try {
    const raw = await (client ?? getLlmClient()).chatJson({ system, user });
    const parsedJson = JSON.parse(raw) as Record<string, unknown>;
    parsed = OutputSchema.parse({
      ...parsedJson,
      keywords: normalizeStringArray(parsedJson.keywords),
      tags: normalizeStringArray(parsedJson.tags),
      category_domain: normalizeStringArray(parsedJson.category_domain),
      category_topic: normalizeStringArray(parsedJson.category_topic),
      category_entity: normalizeStringArray(parsedJson.category_entity),
    });
  } catch (err) {
    console.warn(
      "[translateAndTag] LLM enrichment failed; using rule-based fallback",
      err instanceof Error ? err.message : err,
    );
    return buildFallbackOutput({ title, content, lang });
  }
  const categories = deriveTaxonomyWithMeta({
    title: title,
    content: content,
    tags: parsed.tags,
    llmDomain: parsed.category_domain,
    llmTopic: parsed.category_topic,
    llmEntity: parsed.category_entity,
  });
  const minCategoryConfidence = parseFloat(process.env.TAXONOMY_MIN_CONFIDENCE ?? "0.45");
  const domain =
    categories.confidence.domain >= minCategoryConfidence ? categories.domain : parsed.category_domain ?? [];
  const topic =
    categories.confidence.topic >= minCategoryConfidence ? categories.topic : parsed.category_topic ?? [];
  const entity =
    categories.confidence.entity >= minCategoryConfidence ? categories.entity : parsed.category_entity ?? [];

  return {
    lang: parsed.lang,
    titleZh: parsed.title_zh,
    contentZh: parsed.content_zh,
    contentSummaryZh: parsed.content_summary_zh,
    eventSummary: parsed.event_summary,
    llmKeywords: normalizeKeywordList(parsed.keywords ?? []),
    tags: clampTags(parsed.tags),
    categoryDomain: domain,
    categoryTopic: topic,
    categoryEntity: entity,
    categoryMeta: {
      confidence: categories.confidence,
      source: categories.source,
    },
  };
}

function buildFallbackOutput(input: {
  title: string;
  content: string;
  lang: "zh" | "en";
}): TranslateTagOutput {
  const categories = deriveTaxonomyWithMeta({
    title: input.title,
    content: input.content,
    tags: [],
  });
  return {
    lang: input.lang,
    llmKeywords: [],
    tags: [],
    categoryDomain: categories.domain,
    categoryTopic: categories.topic,
    categoryEntity: categories.entity,
    categoryMeta: {
      confidence: categories.confidence,
      source: categories.source,
    },
  };
}
