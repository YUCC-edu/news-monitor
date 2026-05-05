import { describe, expect, it } from "vitest";
import {
  buildWechatDraftArticle,
  normalizeReportAudience,
  normalizeReportRange,
  normalizeReportTargets,
  obsidianRelativePaths,
  resolveWechatThumbMediaId,
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
      summary: "多来源讨论浏览器 Agent 进入真实工作流。",
      sources: "Example A / Example B",
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
      title: "Paper: Browser agent update",
      sourceName: "Example",
      url: "https://arxiv.org/abs/2605.00001",
      publishedAt: "2026-05-04T00:00:00.000Z",
      tags: ["agent", "paper"],
      summary: "代表论文摘要。",
    },
  ],
};

describe("daily report rendering", () => {
  it("renders clean Chinese markdown, wechat html, and feishu post payload", () => {
    const rendered = renderReport(draft);
    expect(rendered.markdown).toContain("# News Monitor 日报 2026-05-04");
    expect(rendered.markdown).toContain("窗口条目：12");
    expect(rendered.markdown).toContain("热点事件");
    expect(rendered.markdown).not.toMatch(/[{}]|閿泑閺墊閺坾閳?/);
    expect(rendered.wechatHtml).toContain("<h1>News Monitor 日报 2026-05-04</h1>");
    expect(rendered.wechatHtml).toContain("<strong>生成时间：</strong>");
    expect(rendered.feishuPayload).toMatchObject({ msg_type: "post" });
    expect(JSON.stringify(rendered.feishuPayload)).toContain("窗口条目 12");
  });

  it("renders Feishu as a daily AI radar and Obsidian as a knowledge ledger", () => {
    const rendered = renderReport(draft);
    const feishu = JSON.stringify(rendered.feishuPayload);

    expect(feishu).toContain("今日 AI 雷达");
    expect(feishu).toContain("最新研究/论文");
    expect(feishu).toContain("值得继续追踪");
    expect(rendered.obsidianMarkdown).toContain("# AI Knowledge Ledger - 2026-05-04");
    expect(rendered.obsidianMarkdown).toContain("## 最新论文与研究");
    expect(rendered.obsidianMarkdown).toContain("## 新奇想法");
    expect(rendered.obsidianMarkdown).toContain("## 可沉淀的知识卡片");
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

  it("builds the exact WeChat draft article used by preview and publishing", () => {
    const article = buildWechatDraftArticle({
      title: "Factual title",
      markdown: "# Factual markdown",
      wechatHtml: "<p>factual</p>",
      styledTitle: "Styled title",
      styledMarkdown: "# Styled markdown with a longer summary",
      styledWechatHtml: "<section><p>styled draft payload</p></section>",
    });

    expect(article).toMatchObject({
      title: "Styled title",
      author: "News Monitor",
      content: "<section><p>styled draft payload</p></section>",
      contentSource: "styled",
    });
    expect(article.digest).toBe("Styled markdown with a longer summary");

    const fallback = buildWechatDraftArticle({
      title: "Factual title",
      markdown: "# Factual markdown",
      wechatHtml: "<p>factual</p>",
      styledTitle: "",
      styledMarkdown: "",
      styledWechatHtml: "",
    });
    expect(fallback.content).toBe("<p>factual</p>");
    expect(fallback.contentSource).toBe("factual");

    const styledMarkdownOnly = buildWechatDraftArticle({
      title: "Factual title",
      markdown: "# Factual markdown",
      wechatHtml: "<p>factual</p>",
      styledTitle: "Styled title",
      styledMarkdown: "# Styled title\n\n[[image2:cover]]\n\n## Section\n\n1. First point",
      styledWechatHtml: "",
    });
    expect(styledMarkdownOnly.content).toContain("<h1");
    expect(styledMarkdownOnly.content).toContain("image2: cover");
    expect(styledMarkdownOnly.content).toContain("<ol");
    expect(styledMarkdownOnly.contentSource).toBe("styled");
  });

  it("resolves WeChat thumb media id from config or uploads a fallback cover image", async () => {
    expect(await resolveWechatThumbMediaId({
      accessToken: "token",
      configuredMediaId: "configured-media-id",
      fallbackImageUrl: "https://example.com/cover.jpg",
    })).toBe("configured-media-id");

    const calls: string[] = [];
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      calls.push(String(input));
      if (calls.length === 1) {
        return new Response(new Uint8Array([1, 2, 3, 4, 5]), {
          headers: { "content-type": "image/jpeg" },
        });
      }
      expect(init?.method).toBe("POST");
      expect(init?.body).toBeInstanceOf(FormData);
      return Response.json({ media_id: "uploaded-media-id", url: "https://mmbiz.example/cover.jpg" });
    };

    await expect(resolveWechatThumbMediaId({
      accessToken: "token",
      configuredMediaId: "",
      fallbackImageUrl: "https://example.com/cover.jpg",
      fetchImpl,
    })).resolves.toBe("uploaded-media-id");
    expect(calls).toEqual([
      "https://example.com/cover.jpg",
      "https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=token&type=image",
    ]);
  });
});
