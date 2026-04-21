import {
  CONTROLLED_TAGS,
  deriveTaxonomy,
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
  const parsed = OutputSchema.parse(JSON.parse(raw));
  const categories = deriveTaxonomy({
    title: title,
    content: content,
    tags: parsed.tags,
    llmDomain: parsed.category_domain,
    llmTopic: parsed.category_topic,
    llmEntity: parsed.category_entity,
  });

  return {
    lang: parsed.lang,
    titleZh: parsed.title_zh,
    contentZh: parsed.content_zh,
    tags: clampTags(parsed.tags),
    categoryDomain: categories.domain,
    categoryTopic: categories.topic,
    categoryEntity: categories.entity,
  };
}
