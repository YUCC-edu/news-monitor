import { describe, expect, it } from "vitest";
import { buildCodexAgentBrief, type ReportDraft } from "../src";

const draft: ReportDraft = {
  reportDate: "2026-05-05",
  title: "News Monitor 日报 2026-05-05",
  generatedAt: "2026-05-05T00:30:00.000Z",
  audience: "personal",
  range: "24h",
  topN: 3,
  minSources: 1,
  metrics: {
    itemsWindow: 18,
    activeSourcesWindow: 6,
    clustersWindow: 4,
    attentionIndex: 3.4,
    consensusIndex: 1.8,
    breakingIndex: 1.1,
    crossSourceClusterRate: 0.5,
  },
  clusters: [
    {
      id: "c1",
      title: "LLM + Agent + Skills",
      summary: "多来源讨论智能体从聊天框走向稳定工作流。",
      sources: "arXiv / OpenAI Blog / The Verge",
      distinctSources: 3,
      itemsWindow: 6,
      score: 0.95,
    },
  ],
  keywords: [
    {
      keyword: "agent",
      title: "Agent",
      summary: "工具调用和工作流沉淀继续升温。",
      mentions: 7,
      distinctSources: 4,
      attentionScore: 1.6,
    },
  ],
  items: [
    {
      id: "i1",
      title: "Paper: Skills make agents repeatable",
      sourceName: "arXiv",
      url: "https://arxiv.org/abs/2605.00001",
      publishedAt: "2026-05-05T00:00:00.000Z",
      tags: ["agent", "paper"],
      summary: "论文讨论技能化工作流如何让智能体更稳定。",
    },
    {
      id: "i2",
      title: "New browser agent product update",
      sourceName: "OpenAI Blog",
      url: "https://example.com/agent",
      publishedAt: "2026-05-05T01:00:00.000Z",
      tags: ["agent", "product"],
      summary: "产品更新展示浏览器智能体的端到端任务能力。",
    },
  ],
};

describe("Codex external agent brief", () => {
  it("builds a token-free handoff for topic selection, writing, images, and publishing", () => {
    const brief = buildCodexAgentBrief(draft);

    expect(brief.runtime.mode).toBe("agent");
    expect(brief.runtime.engineTokenPolicy).toContain("不调用内置 LLM");
    expect(brief.editorial.recommendedTopic.title).toBe("LLM + Agent + Skills");
    expect(brief.editorial.selectionRubric.join(" ")).toContain("多来源");
    expect(brief.wechatWriting.outline.join("\n")).toContain("发展脉络");
    expect(brief.programmaticOutputs).toEqual(expect.arrayContaining(["wechatDraft", "feishuRadar", "obsidianLedger"]));
  });

  it("locks image prompts to the Wander black-and-white line-art style", () => {
    const brief = buildCodexAgentBrief(draft);
    const promptText = brief.imageDirection.briefs.map((item) => item.prompt).join("\n");

    expect(promptText).toContain("Wander云上");
    expect(promptText).toContain("black-and-white");
    expect(promptText).toContain("stamp/postcard border");
    expect(promptText).toContain("yellow V badge");
    expect(brief.imageDirection.negativePrompt).toContain("stock photo");
  });
});
