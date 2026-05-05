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
    title: "Agent+Skills：大语言模型的外挂之路",
    sourceUrl: "https://example.com/wechat/agent-skills",
    contentMarkdown: [
      "大家好，我是云上。",
      "",
      "不知道大家有没有发现一个现象：AI 领域最近有三个核心概念在疯狂涌现：LLM、Agent、Skill。",
      "",
      "## 一：越通用，更智能",
      "",
      "LLM 率先爆发，模型能力持续迭代。",
      "",
      "## 二：Agent 的三个阶段",
      "",
      "从提示词工程到上下文工程，再到架构工程，Agent 正在把模型放进真实任务链路。",
      "",
      "## 三：最后",
      "",
      "下一期再见！",
    ].join("\n"),
    coverImageUrl: "https://img.example.com/agent-cover.png",
    inlineImages: ["https://img.example.com/agent-flow.png"],
    imageNotes: "Reference visual style from user's WeChat sample: mobile WeChat long-form article; clean AI/technology editorial cover and inline information graphics; restrained palette; black/white accent blocks; low text density; clear section visuals; 16:9 images; suitable for AI and tech explainers.",
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
    imageNotes: "Inline image style: clean information diagram, product architecture map, low text density.",
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
    expect(profile.rules.image.notes.join(" ")).toContain("restrained");
  });

  it("renders a long-form WeChat AI explainer scaffold with image placeholders", () => {
    const profile = learnWritingStyleFromSamples(samples);
    const rendered = renderStyledReport(reportDraft, profile);

    expect(rendered.title).toContain("从 AI Agent / Browser Use 看");
    expect(rendered.markdown).toContain("## 发展脉络");
    expect(rendered.markdown).toContain("## 为什么值得关注");
    expect(rendered.markdown).toContain("## 接下来追踪");
    expect(rendered.markdown).toContain("[[image2:cover]]");
    expect(rendered.markdown).toContain("[[image2:section-1]]");
    expect(rendered.markdown).toContain("Browser agent update");
    expect(rendered.wechatHtml).toContain("发展脉络");
    expect(rendered.wechatHtml).toContain("image2");
    expect(rendered.imageBriefs[0]).toMatchObject({ kind: "cover" });
    expect(rendered.imageBriefs[0]?.prompt).toContain("AI Agent / Browser Use");
    expect(rendered.imageBriefs[1]?.prompt).toContain("16:9");
  });
});
