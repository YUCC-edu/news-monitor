import {
  CONTROLLED_TAGS,
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
};

export type TranslateTagOutput = {
  lang: "zh" | "en";
  titleZh?: string;
  contentZh?: string;
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

export async function translateAndTag(
  input: TranslateTagInput,
  client: LlmClient = getLlmClient(),
): Promise<TranslateTagOutput> {
  const title = input.title?.trim() ?? "";
  const content = input.contentText?.trim() ?? "";
  const merged = `${title}\n${content}`.trim();
  const lang = detectLangSimple(merged);
  const bounded = content.slice(0, 600);

  const system = [
    "You are an AI news enrichment assistant.",
    "Return strictly JSON with keys: lang, title_zh, content_zh, tags, category_domain, category_topic, category_entity.",
    `Prefer tags from controlled list: ${CONTROLLED_TAGS.join(", ")}`,
    "You may add at most 2 free-form tags.",
  ].join("\n");

  const user = JSON.stringify(
    {
      title,
      content_text: bounded,
      source_lang_guess: lang,
      needs_translation: lang !== "zh",
    },
    null,
    2,
  );

  const raw = await client.chatJson({ system, user });
  const parsedJson = JSON.parse(raw) as Record<string, unknown>;
  const parsed = OutputSchema.parse({
    ...parsedJson,
    tags: normalizeStringArray(parsedJson.tags),
    category_domain: normalizeStringArray(parsedJson.category_domain),
    category_topic: normalizeStringArray(parsedJson.category_topic),
    category_entity: normalizeStringArray(parsedJson.category_entity),
  });
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
