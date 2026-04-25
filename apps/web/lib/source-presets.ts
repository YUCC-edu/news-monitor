export type SourcePresetKind = "rss" | "hn" | "x-rsshub" | "wechat-wewe";
export type SourcePresetCategory = "hotspot" | "research";

export type SourcePreset = {
  id: string;
  name: string;
  description?: string;
  kind: SourcePresetKind;
  config: Record<string, unknown>;
  fetchIntervalSec: number;
  initialFetchDays?: number | null;
  maxItemAgeDays?: number | null;
  category: SourcePresetCategory;
  tags?: string[];
  priority?: number;
};

export type SourcePresetPack = {
  key: "ai-hotspot-research";
  label: string;
  description: string;
  items: SourcePreset[];
};

export const AI_HOTSPOT_RESEARCH_PRESET: SourcePresetPack = {
  key: "ai-hotspot-research",
  label: "AI 值得关注预设",
  description: "面向 AI 值得关注追踪与研究观察的一组默认信源。",
  items: [
    {
      id: "hn-ai",
      name: "Hacker News: AI",
      description: "高信号开发者讨论流，适合补充热度判断。",
      kind: "hn",
      config: { query: "artificial intelligence OR LLM OR model", pointsMin: 30 },
      fetchIntervalSec: 300,
      initialFetchDays: 1,
      category: "hotspot",
      tags: ["ai", "developer", "hotspot"],
      priority: 96,
    },
    {
      id: "techcrunch-ai",
      name: "TechCrunch AI",
      description: "AI 公司、融资和产品更新。",
      kind: "rss",
      config: { feedUrl: "https://techcrunch.com/category/artificial-intelligence/feed/" },
      fetchIntervalSec: 600,
      initialFetchDays: 2,
      category: "hotspot",
      tags: ["ai", "industry", "startup"],
      priority: 88,
    },
    {
      id: "theverge-ai",
      name: "The Verge AI",
       description: "偏产品与平台变化，适合看大众面值得关注信号。",
      kind: "rss",
      config: { feedUrl: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
      fetchIntervalSec: 900,
      initialFetchDays: 2,
      category: "hotspot",
      tags: ["ai", "consumer", "hotspot"],
      priority: 82,
    },
    {
      id: "wired-ai",
      name: "WIRED AI",
      description: "行业观察、人物与产品叙事。",
      kind: "rss",
      config: { feedUrl: "https://www.wired.com/feed/tag/ai/latest/rss" },
      fetchIntervalSec: 900,
      initialFetchDays: 2,
      category: "hotspot",
      tags: ["ai", "industry", "media"],
      priority: 80,
    },
    {
      id: "venturebeat-ai",
      name: "VentureBeat",
      description: "创业、平台和企业 AI 新闻。",
      kind: "rss",
      config: { feedUrl: "http://feeds.venturebeat.com/VentureBeat" },
      fetchIntervalSec: 900,
      initialFetchDays: 2,
      category: "hotspot",
      tags: ["ai", "industry", "enterprise"],
      priority: 78,
    },
    {
      id: "openai-news",
      name: "OpenAI News",
      description: "OpenAI 官方发布与产品更新。",
      kind: "rss",
      config: { feedUrl: "https://openai.com/news/rss.xml" },
      fetchIntervalSec: 900,
      initialFetchDays: 3,
      category: "research",
      tags: ["ai", "official", "lab"],
      priority: 92,
    },
    {
      id: "deepmind-blog",
      name: "Google DeepMind Blog",
      description: "DeepMind 官方研究与产品公告。",
      kind: "rss",
      config: { feedUrl: "https://deepmind.google/blog/rss.xml" },
      fetchIntervalSec: 900,
      initialFetchDays: 3,
      category: "research",
      tags: ["ai", "official", "lab"],
      priority: 90,
    },
    {
      id: "huggingface-blog",
      name: "Hugging Face Blog",
      description: "开源模型、工具和研究社区动态。",
      kind: "rss",
      config: { feedUrl: "https://huggingface.co/blog/feed.xml" },
      fetchIntervalSec: 900,
      initialFetchDays: 3,
      category: "research",
      tags: ["ai", "official", "open-source"],
      priority: 89,
    },
    {
      id: "microsoft-ai-blog",
      name: "Microsoft AI Blog",
      description: "微软 AI 产品和平台发布。",
      kind: "rss",
      config: { feedUrl: "https://blogs.microsoft.com/ai/feed/" },
      fetchIntervalSec: 900,
      initialFetchDays: 3,
      category: "research",
      tags: ["ai", "official", "platform"],
      priority: 84,
    },
    {
      id: "google-ai-blog",
      name: "Google AI Blog",
      description: "Google AI 与 Gemini 相关更新。",
      kind: "rss",
      config: { feedUrl: "https://blog.google/technology/ai/rss/" },
      fetchIntervalSec: 900,
      initialFetchDays: 3,
      category: "research",
      tags: ["ai", "official", "platform"],
      priority: 84,
    },
    {
      id: "nvidia-developer-ai",
      name: "NVIDIA Developer AI",
      description: "模型工程、推理与开发者生态。",
      kind: "rss",
      config: { feedUrl: "https://developer.nvidia.com/blog/category/ai/feed/" },
      fetchIntervalSec: 900,
      initialFetchDays: 3,
      category: "research",
      tags: ["ai", "official", "engineering"],
      priority: 80,
    },
    {
      id: "arxiv-cs-ai",
      name: "arXiv cs.AI",
      description: "人工智能通用研究。",
      kind: "rss",
      config: { feedUrl: "https://rss.arxiv.org/rss/cs.AI" },
      fetchIntervalSec: 1200,
      initialFetchDays: 3,
      category: "research",
      tags: ["ai", "paper", "research"],
      priority: 85,
    },
    {
      id: "arxiv-cs-cl",
      name: "arXiv cs.CL",
      description: "NLP 与语言模型相关论文。",
      kind: "rss",
      config: { feedUrl: "https://rss.arxiv.org/rss/cs.CL" },
      fetchIntervalSec: 1200,
      initialFetchDays: 3,
      category: "research",
      tags: ["ai", "paper", "nlp"],
      priority: 84,
    },
    {
      id: "arxiv-cs-lg",
      name: "arXiv cs.LG",
      description: "机器学习论文洪流，默认适合折叠阅读。",
      kind: "rss",
      config: { feedUrl: "https://rss.arxiv.org/rss/cs.LG" },
      fetchIntervalSec: 1200,
      initialFetchDays: 3,
      category: "research",
      tags: ["ai", "paper", "ml"],
      priority: 86,
    },
  ],
};

export function getPresetPack(key: string): SourcePresetPack | null {
  return listPresetPacks().find((pack) => pack.key === key) ?? null;
}

export function listPresetPacks(): SourcePresetPack[] {
  return [AI_HOTSPOT_RESEARCH_PRESET];
}

export function collectPresetItems(options: {
  presetKeys?: string[];
  selectedItems?: SourcePreset[];
}) {
  if (options.selectedItems && options.selectedItems.length > 0) {
    const unique = new Map<string, SourcePreset>();
    for (const item of options.selectedItems) {
      const key = `${item.kind}:${JSON.stringify(item.config)}:${item.name}`;
      if (!unique.has(key)) unique.set(key, item);
    }
    return Array.from(unique.values());
  }

  const keys = options.presetKeys && options.presetKeys.length > 0
    ? options.presetKeys
    : [AI_HOTSPOT_RESEARCH_PRESET.key];
  const unique = new Map<string, SourcePreset>();
  for (const key of keys) {
    const pack = getPresetPack(key);
    if (!pack) continue;
    for (const item of pack.items) {
      const dedup = `${item.kind}:${JSON.stringify(item.config)}:${item.name}`;
      if (!unique.has(dedup)) unique.set(dedup, item);
    }
  }
  return Array.from(unique.values());
}
