import type { ReportDraft } from "./reports";
import { buildWanderImagePrompt, buildWanderNegativePrompt } from "./visual-style";

function topCluster(draft: ReportDraft) {
  return draft.clusters[0] ?? {
    id: "fallback",
    title: draft.keywords[0]?.title ?? draft.items[0]?.title ?? "今日 AI 信号",
    summary: draft.keywords[0]?.summary ?? "今天的 AI 信息流里出现了值得继续追踪的变化。",
    sources: "",
    distinctSources: 1,
    itemsWindow: draft.items.length,
    score: draft.metrics.attentionIndex,
  };
}

function paperItems(draft: ReportDraft) {
  return draft.items.filter((item) => {
    const haystack = `${item.title} ${item.url ?? ""} ${item.sourceName} ${item.tags.join(" ")}`.toLowerCase();
    return /\barxiv\b|paper|research|openreview|huggingface\.co\/papers|论文/.test(haystack);
  });
}

function productItems(draft: ReportDraft) {
  return draft.items.filter((item) => {
    const haystack = `${item.title} ${item.summary} ${item.sourceName} ${item.tags.join(" ")}`.toLowerCase();
    return /agent|product|launch|release|update|api|tool|workflow|browser|github|产品|发布|更新|工具|工作流/.test(haystack);
  });
}

export function buildCodexAgentBrief(draft: ReportDraft) {
  const cluster = topCluster(draft);
  const papers = paperItems(draft);
  const products = productItems(draft);
  const topic = cluster.title;

  return {
    runtime: {
      mode: "agent" as const,
      engineTokenPolicy: "不调用内置 LLM；News Monitor 只做抓取、聚类、规则化摘要、渲染和推送，Codex/外部 agent 接管选题判断、写作和人工审稿。",
      recommendedCommand: "pnpm nm -- reports agent-brief --json",
    },
    editorial: {
      recommendedTopic: {
        id: cluster.id,
        title: topic,
        reason: cluster.summary,
        sources: cluster.sources,
        distinctSources: cluster.distinctSources,
        itemsWindow: cluster.itemsWindow,
        score: cluster.score,
      },
      selectionRubric: [
        "优先选择多来源同时指向的变化，而不是单条新闻热闹。",
        "优先选择 AI 论文、Agent 工作流、产品化落地、开发者工具链、模型能力边界相关主题。",
        "判断它是否能写出一条清晰脉络：现象 -> 为什么重要 -> 对工作流的影响 -> 下一步追踪。",
        "避免只复述发布稿；必须给出自己的判断和后续观察问题。",
      ],
      mustAnswer: [
        "这件事是真变化，还是单日噪声？",
        "它改变的是模型能力、产品形态，还是人的工作流？",
        "有没有论文、产品、开源项目或真实使用场景可以互相印证？",
      ],
    },
    wechatWriting: {
      titlePattern: `从 ${topic} 看 AI 正在发生什么`,
      voice: "克制、判断明确、少形容词；先讲现象，再拆脉络，最后留下可追踪的问题。",
      outline: [
        "开场：一句话说明今天为什么单独看这个信号。",
        "发展脉络：把 LLM、Agent、Skills/工作流放进同一条线看。",
        "为什么值得关注：说明它对研究、产品和个人工作流的影响。",
        "接下来追踪：列出论文方向、产品验证、奇特想法三个观察点。",
        "代表线索：保留 3-5 个来源链接，方便回查。",
        "最后：用一个判断或问题收束，不做口号式总结。",
      ],
      sourceMaterial: {
        papers: papers.slice(0, 5),
        products: products.slice(0, 5),
        representativeItems: draft.items.slice(0, 8),
      },
    },
    imageDirection: {
      styleName: "Wander云上 black-and-white stamp editorial",
      negativePrompt: buildWanderNegativePrompt(),
      briefs: [
        {
          kind: "cover" as const,
          topic,
          prompt: buildWanderImagePrompt({
            kind: "cover",
            topic,
            scene: "night workspace, creator at laptop, quiet AI frontier exploration, title-safe area on the left",
          }),
        },
        {
          kind: "section" as const,
          topic: "发展脉络",
          prompt: buildWanderImagePrompt({
            kind: "section",
            topic,
            scene: "LLM brain, Agent executor, Skills modules, arrows showing evolution into repeatable workflows",
          }),
        },
        {
          kind: "section" as const,
          topic: "为什么值得关注",
          prompt: buildWanderImagePrompt({
            kind: "section",
            topic,
            scene: "research, product, workflow, and knowledge ledger connected as four clean panels",
          }),
        },
        {
          kind: "ending" as const,
          topic,
          prompt: buildWanderImagePrompt({
            kind: "ending",
            topic,
            scene: "closing postcard, Wander云上 brand seal, clouds and mountains, final attention statement",
          }),
        },
      ],
    },
    programmaticOutputs: ["wechatDraft", "feishuRadar", "obsidianLedger"] as const,
    publishChecklist: [
      "先在报告页检查公众号草稿预览，确认实际发送 HTML。",
      "用 image2 按 brief 生成首图、章节图和末尾图，再替换 image2 占位。",
      "飞书只保留雷达摘要，Obsidian 只沉淀论文、奇特想法、知识卡片和原始链接。",
      "最后再触发一键推送，避免重复创建公众号草稿。",
    ],
  };
}
