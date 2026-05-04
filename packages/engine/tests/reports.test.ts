import { describe, expect, it } from "vitest";
import {
  normalizeReportAudience,
  normalizeReportRange,
  normalizeReportTargets,
  obsidianRelativePaths,
  selectWechatArticleFields,
  signFeishuWebhook,
  topicSlug,
} from "../src";
import { renderReport, type ReportDraft } from "../src/reports";

const draft: ReportDraft = {
  reportDate: "2026-05-04",
  title: "News Monitor 日报 2026-05-04",
  generatedAt: "2026-05-04T00:30:00.000Z",
  audience: "personal",
  range: "24h",
  topN: 3,
  minSources: 1,
  metrics: {
    itemsWindow: 12,
    activeSourcesWindow: 4,
    clustersWindow: 3,
    attentionIndex: 2.5,
    consensusIndex: 1.2,
    breakingIndex: 0.8,
    crossSourceClusterRate: 0.5,
  },
  clusters: [
    {
      id: "c1",
      title: "AI Agent / Browser Use?",
      summary: "多来源讨论浏览器 Agent。",
      sources: "A / B",
      distinctSources: 2,
      itemsWindow: 4,
      score: 0.92,
    },
  ],
  keywords: [
    {
      keyword: "agent",
      title: "Agent",
      summary: "工具调用持续升温。",
      mentions: 5,
      distinctSources: 3,
      attentionScore: 1.4,
    },
  ],
  items: [
    {
      id: "i1",
      title: "Browser agent update",
      sourceName: "Example",
      url: "https://example.com/a",
      publishedAt: "2026-05-04T00:00:00.000Z",
      tags: ["agent"],
      summary: "代表文章摘要。",
    },
  ],
};

describe("daily report rendering", () => {
  it("renders clean Chinese markdown, wechat html, and feishu post payload", () => {
    const rendered = renderReport(draft);
    expect(rendered.markdown).toContain("# News Monitor 日报 2026-05-04");
    expect(rendered.markdown).toContain("窗口条目：12");
    expect(rendered.markdown).toContain("热点事件");
    expect(rendered.markdown).not.toMatch(/[{}]|锛|鏉|鏈|鈥/);
    expect(rendered.wechatHtml).toContain("<h1>News Monitor 日报 2026-05-04</h1>");
    expect(rendered.wechatHtml).toContain("<strong>生成时间：</strong>");
    expect(rendered.feishuPayload).toMatchObject({ msg_type: "post" });
    expect(JSON.stringify(rendered.feishuPayload)).toContain("窗口条目 12");
  });

  it("uses filesystem-safe topic slugs and obsidian relative paths", () => {
    expect(topicSlug("AI Agent / Browser Use?")).toBe("AI-Agent-Browser-Use");
    expect(obsidianRelativePaths(draft)).toEqual({
      daily: expect.stringContaining("2026-05-04.md"),
      topics: [expect.stringContaining("AI-Agent-Browser-Use.md")],
    });
  });

  it("normalizes unsafe report API inputs", () => {
    expect(normalizeReportAudience("public")).toBe("public");
    expect(normalizeReportAudience("team")).toBe("personal");
    expect(normalizeReportRange("7d")).toBe("7d");
    expect(normalizeReportRange("all")).toBe("24h");
    expect(normalizeReportTargets(["wechat", "unknown", "feishu", "wechat"])).toEqual(["wechat", "feishu"]);
    expect(normalizeReportTargets(["unknown"])).toBeUndefined();
  });

  it("signs feishu webhooks deterministically", () => {
    expect(signFeishuWebhook("1777900000", "secret")).toBe(signFeishuWebhook("1777900000", "secret"));
    expect(signFeishuWebhook("1777900000", "secret")).not.toBe(signFeishuWebhook("1777900001", "secret"));
  });

  it("uses styled WeChat fields when available and falls back to factual fields", () => {
    expect(selectWechatArticleFields({
      title: "Factual title",
      markdown: "Factual markdown",
      wechatHtml: "<p>factual</p>",
      styledTitle: "Styled title",
      styledMarkdown: "Styled markdown",
      styledWechatHtml: "<p>styled</p>",
    })).toEqual({
      title: "Styled title",
      markdown: "Styled markdown",
      wechatHtml: "<p>styled</p>",
    });

    expect(selectWechatArticleFields({
      title: "Factual title",
      markdown: "Factual markdown",
      wechatHtml: "<p>factual</p>",
      styledTitle: " ",
      styledMarkdown: null,
      styledWechatHtml: "",
    })).toEqual({
      title: "Factual title",
      markdown: "Factual markdown",
      wechatHtml: "<p>factual</p>",
    });
  });
});
