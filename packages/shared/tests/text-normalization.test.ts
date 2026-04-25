import { describe, expect, it } from "vitest";
import {
  canonicalizeNewsText,
  displayAttentionKeyword,
  extractAttentionKeywords,
  extractNewsTokens,
  newsTextFingerprint,
} from "../src/text-normalization";

describe("news text normalization", () => {
  it("collapses DeepSeek model variants into one canonical form", () => {
    const a = canonicalizeNewsText("DeepSeek V4 发布");
    const b = canonicalizeNewsText("DeepSeek-V4 发布");
    const c = canonicalizeNewsText("深度求索 V4 发布");

    expect(a).toBe("deepseekv4 发布");
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("normalizes GPT-style naming variants for fallback clustering", () => {
    const a = newsTextFingerprint("ChatGPT 5.5");
    const b = newsTextFingerprint("GPT-5.5");
    const c = newsTextFingerprint("gpt55");
    const d = newsTextFingerprint("GPT-4o");
    const e = newsTextFingerprint("Claude Sonnet 4");

    expect(a).toBe(b);
    expect(c).toBe(a);
    expect(d).toBe("gpt4o");
    expect(e).toBe("claude4");
  });

  it("keeps enough tokens for embedding fallback hashing", () => {
    const tokens = extractNewsTokens("OpenAI launches GPT-5.5 and DeepSeek V4");
    expect(tokens).toContain("openai");
    expect(tokens).toContain("gpt55");
    expect(tokens).toContain("deepseekv4");
  });

  it("extracts model keywords and filters generic chatter", () => {
    const keywords = extractAttentionKeywords("DeepSeek-V4发布啦，Agent 新闻动态");
    expect(keywords).toContain("DeepSeek-V4");
    expect(keywords).not.toContain("agent");
    expect(keywords).not.toContain("新闻");
    expect(keywords).not.toContain("动态");
  });

  it("filters basic English stopwords", () => {
    const keywords = extractAttentionKeywords("and in of the for with agent 新闻动态");
    expect(keywords).toEqual([]);
  });

  it("prioritizes proper AI model and organization names", () => {
    const keywords = extractAttentionKeywords("OpenAI releases GPT-5.5 with new coding agent");
    expect(keywords).toContain("OpenAI");
    expect(keywords).toContain("GPT-5.5");
    expect(keywords).not.toContain("with");
    expect(keywords).not.toContain("new");
    expect(keywords).not.toContain("agent");
  });

  it("keeps readable display names for canonical keyword keys", () => {
    expect(displayAttentionKeyword("deepseekv4")).toBe("DeepSeek-V4");
    expect(displayAttentionKeyword("gpt55")).toBe("GPT-5.5");
  });
});
