import { CONTROLLED_TAGS, detectLangSimple, isControlledTag } from "@news/shared";
import { z } from "zod";
import { getLlmClient, type LlmClient } from "./llm-client";

const OutputSchema = z.object({
  lang: z.enum(["zh", "en"]).default("en"),
  title_zh: z.string().optional(),
  content_zh: z.string().optional(),
  tags: z.array(z.string()).default([]),
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
    "Return strictly JSON with keys: lang, title_zh, content_zh, tags.",
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

  return {
    lang: parsed.lang,
    titleZh: parsed.title_zh,
    contentZh: parsed.content_zh,
    tags: clampTags(parsed.tags),
  };
}
