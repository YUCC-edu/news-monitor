import { describe, expect, it } from "vitest";
import {
  buildWechatDraftPrepareResult,
  imageSlotsFromBriefs,
  normalizeWechatDraftInput,
  replaceImagePlaceholders,
  validateReturnedImages,
} from "../src/wechat-draft-workflow";

describe("wechat draft workflow", () => {
  it("normalizes prepare inputs for low-token agent mode", () => {
    expect(normalizeWechatDraftInput({ intent: " 最新研究解读 ", topN: 999 })).toMatchObject({
      intent: "最新研究解读",
      audience: "personal",
      range: "24h",
      topN: 10,
      minSources: 1,
      imageProvider: "agent-image2",
      mode: "prepare",
      allowWebSupplement: false,
    });
  });

  it("turns style image briefs into deterministic image slots", () => {
    expect(imageSlotsFromBriefs([
      { kind: "cover", topic: "Agent", prompt: "cover prompt" },
      { kind: "section", topic: "脉络", prompt: "section prompt" },
    ])).toEqual([
      { slotId: "cover", kind: "cover", topic: "Agent", prompt: "cover prompt", required: true },
      { slotId: "section-1", kind: "section", topic: "脉络", prompt: "section prompt", required: false },
    ]);
  });

  it("rejects missing required returned images", () => {
    expect(() => validateReturnedImages(
      [{ slotId: "cover", kind: "cover", topic: "Agent", prompt: "p", required: true }],
      [],
    )).toThrow(/missing_required_image/);
  });

  it("rejects unknown returned image slots", () => {
    expect(() => validateReturnedImages(
      [{ slotId: "cover", kind: "cover", topic: "Agent", prompt: "p", required: true }],
      [{ slotId: "other", url: "https://example.com/other.png" }],
    )).toThrow(/unknown_image_slot/);
  });

  it("replaces image2 placeholders with image tags", () => {
    const html = '<p>start</p><p style="text-align:center;color:#64748b;">image2: cover</p>';
    expect(replaceImagePlaceholders(html, [
      { slotId: "cover", url: "https://mmbiz.example/cover.jpg", alt: "cover" },
    ])).toContain('<img src="https://mmbiz.example/cover.jpg" alt="cover"');
  });

  it("builds a prepare result from the exact WeChat article fields", () => {
    const result = buildWechatDraftPrepareResult({
      report: {
        id: "report-1",
        title: "Facts",
        markdown: "Facts markdown",
        wechatHtml: "<p>facts</p>",
        styledTitle: "Styled",
        styledMarkdown: "Styled markdown",
        styledWechatHtml: '<p style="text-align:center;color:#64748b;">image2: cover</p>',
        styleImageBriefs: [{ kind: "cover", topic: "Agent", prompt: "cover prompt" }],
      },
      input: normalizeWechatDraftInput({ intent: "最新研究解读" }),
    });

    expect(result).toMatchObject({
      status: "needs_images",
      reportId: "report-1",
      title: "Styled",
      contentSource: "styled",
      imageProvider: "agent-image2",
    });
    expect(result.imageSlots).toHaveLength(1);
    expect(result.nextAction).toContain("image2");
  });
});
