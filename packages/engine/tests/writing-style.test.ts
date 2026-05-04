import { describe, expect, it } from "vitest";
import {
  learnWritingStyleFromSamples,
  normalizeWritingStyleSample,
  renderStyledReport,
  type WritingStyleSampleInput,
} from "../src/writing-style";
import type { ReportDraft } from "../src/reports";

const samples: WritingStyleSampleInput[] = [
  {
    title: "AI Agent 的新拐点：浏览器正在变成工作台",
    sourceUrl: "https://example.com/wechat/agent",
    contentMarkdown: [
      "这两天，一个变化值得单独拿出来看。",
      "",
      "## 先看信号",
      "",
      "浏览器 Agent 的产品节奏明显加快，几个团队都在把操作能力放进真实工作流。",
      "",
      "## 我的判断",
      "",
      "短期看是效率工具，长期看是入口迁移。",
      "",
      "最后，真正值得关注的不是演示，而是谁能稳定完成任务。",
    ].join("\n"),
    coverImageUrl: "https://img.example.com/agent-cover.png",
    inlineImages: ["https://img.example.com/agent-flow.png"],
    imageNotes: "封面偏克制科技感，少文字，主体是桌面工作流和浏览器窗口。",
  },
  {
    title: "不是又一个模型更新，而是应用层开始重排",
    contentMarkdown: [
      "今天的重点不在参数，而在产品位置。",
      "",
      "## 发生了什么",
      "",
      "多个应用开始把模型能力包装成固定动作，而不是聊天框。",
      "",
      "## 为什么重要",
      "",
      "用户不再关心模型名称，只关心任务能否被完成。",
      "",
      "这类变化值得持续跟踪。",
    ].join("\n"),
    inlineImages: ["https://img.example.com/app-map.png"],
    imageNotes: "正文图适合信息图，颜色干净，像产品架构草图。",
  },
];

const reportDraft: ReportDraft = {
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
      title: "AI Agent / Browser Use",
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
      title: "Browser agent update",
      sourceName: "Example",
      url: "https://example.com/a",
      publishedAt: "2026-05-04T00:00:00.000Z",
      tags: ["agent"],
      summary: "代表文章摘要。",
    },
  ],
};

describe("wechat writing style learning", () => {
  it("normalizes imported samples without losing image style inputs", () => {
    const normalized = normalizeWritingStyleSample({
      title: "  标题  ",
      contentMarkdown: "  正文  ",
      inlineImages: [" https://example.com/a.png ", "", "https://example.com/a.png"],
      imageNotes: "  干净、克制  ",
    });

    expect(normalized.title).toBe("标题");
    expect(normalized.bodyText).toBe("正文");
    expect(normalized.inlineImages).toEqual(["https://example.com/a.png"]);
    expect(normalized.imageNotes).toBe("干净、克制");
  });

  it("learns durable writing, layout, and image rules from historical articles", () => {
    const profile = learnWritingStyleFromSamples(samples);

    expect(profile.sampleCount).toBe(2);
    expect(profile.rules.summary).toContain("2 篇");
    expect(profile.rules.title.patterns.length).toBeGreaterThan(0);
    expect(profile.rules.structure.preferredSectionCount).toBeGreaterThan(0);
    expect(profile.rules.structure.averageParagraphLength).toBeGreaterThan(10);
    expect(profile.rules.image.coverPrompt).toContain("cover");
    expect(profile.rules.image.notes.join(" ")).toContain("克制");
  });

  it("renders a styled WeChat variant that preserves report facts and produces image briefs", () => {
    const profile = learnWritingStyleFromSamples(samples);
    const rendered = renderStyledReport(reportDraft, profile);

    expect(rendered.title).toContain("AI Agent");
    expect(rendered.markdown).toContain("AI Agent / Browser Use");
    expect(rendered.markdown).toContain("Browser agent update");
    expect(rendered.wechatHtml).toContain("<section");
    expect(rendered.wechatHtml).toContain("AI Agent / Browser Use");
    expect(rendered.imageBriefs[0]).toMatchObject({ kind: "cover" });
    expect(rendered.imageBriefs[0]?.prompt).toContain("AI Agent / Browser Use");
  });
});
