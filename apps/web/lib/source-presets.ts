export type SourcePresetKind = "rss" | "hn" | "x-rsshub" | "wechat-wewe";
export type SourcePresetCategory =
  | "hotspot"
  | "research"
  | "nursing"
  | "evidence"
  | "policy";

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
  key: "ai-hotspot-research" | "nursing-research-core" | "med-evidence-guidelines";
  label: string;
  description: string;
  items: SourcePreset[];
};

export const AI_HOTSPOT_RESEARCH_PRESET: SourcePresetPack = {
  key: "ai-hotspot-research",
  label: "AI 热点 + 科研预设",
  description: "面向 AI 资讯热点与技术研究的综合订阅包",
  items: [
    {
      id: "reuters-tech",
      name: "Reuters Technology",
      description: "路透科技新闻主频道",
      kind: "rss",
      config: { feedUrl: "https://feeds.reuters.com/reuters/technologyNews" },
      fetchIntervalSec: 600,
      initialFetchDays: 2,
      category: "hotspot",
      tags: ["ai", "hotspot", "news"],
      priority: 90,
    },
    {
      id: "techcrunch-ai",
      name: "TechCrunch AI",
      description: "TechCrunch AI 专栏",
      kind: "rss",
      config: { feedUrl: "https://techcrunch.com/category/artificial-intelligence/feed/" },
      fetchIntervalSec: 600,
      initialFetchDays: 2,
      category: "hotspot",
      tags: ["ai", "hotspot", "startup"],
      priority: 88,
    },
    {
      id: "theverge-ai",
      name: "The Verge AI",
      description: "The Verge 人工智能专题",
      kind: "rss",
      config: { feedUrl: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
      fetchIntervalSec: 900,
      initialFetchDays: 2,
      category: "hotspot",
      tags: ["ai", "hotspot", "consumer"],
      priority: 80,
    },
    {
      id: "hn-ai",
      name: "Hacker News: AI",
      description: "Hacker News AI 主题聚合（带分数门槛）",
      kind: "hn",
      config: { query: "artificial intelligence OR LLM OR model", pointsMin: 30 },
      fetchIntervalSec: 300,
      initialFetchDays: 1,
      category: "hotspot",
      tags: ["ai", "hotspot", "developer"],
      priority: 95,
    },
    {
      id: "openai-news",
      name: "OpenAI News",
      description: "OpenAI 官方新闻 RSS",
      kind: "rss",
      config: { feedUrl: "https://openai.com/news/rss.xml" },
      fetchIntervalSec: 900,
      initialFetchDays: 3,
      category: "research",
      tags: ["ai", "research", "lab"],
      priority: 92,
    },
    {
      id: "anthropic-news",
      name: "Anthropic News",
      description: "Anthropic 官方新闻 RSS",
      kind: "rss",
      config: { feedUrl: "https://www.anthropic.com/news/rss.xml" },
      fetchIntervalSec: 900,
      initialFetchDays: 3,
      category: "research",
      tags: ["ai", "research", "lab"],
      priority: 88,
    },
    {
      id: "deepmind-blog",
      name: "Google DeepMind Blog",
      description: "DeepMind 官方博客",
      kind: "rss",
      config: { feedUrl: "https://deepmind.google/blog/rss.xml" },
      fetchIntervalSec: 900,
      initialFetchDays: 3,
      category: "research",
      tags: ["ai", "research", "lab"],
      priority: 90,
    },
    {
      id: "meta-ai-blog",
      name: "Meta AI Blog",
      description: "Meta AI 官方博客",
      kind: "rss",
      config: { feedUrl: "https://ai.meta.com/blog/rss/" },
      fetchIntervalSec: 900,
      initialFetchDays: 3,
      category: "research",
      tags: ["ai", "research", "industry"],
      priority: 82,
    },
    {
      id: "nvidia-developer-ai",
      name: "NVIDIA Developer AI",
      description: "NVIDIA 开发者 AI 专栏",
      kind: "rss",
      config: { feedUrl: "https://developer.nvidia.com/blog/category/ai/feed/" },
      fetchIntervalSec: 900,
      initialFetchDays: 3,
      category: "research",
      tags: ["ai", "research", "engineering"],
      priority: 76,
    },
    {
      id: "arxiv-cs-ai",
      name: "arXiv cs.AI",
      description: "arXiv 人工智能分类",
      kind: "rss",
      config: { feedUrl: "https://rss.arxiv.org/rss/cs.AI" },
      fetchIntervalSec: 1200,
      initialFetchDays: 3,
      category: "research",
      tags: ["ai", "research", "paper"],
      priority: 85,
    },
    {
      id: "arxiv-cs-cl",
      name: "arXiv cs.CL",
      description: "arXiv 计算语言学分类",
      kind: "rss",
      config: { feedUrl: "https://rss.arxiv.org/rss/cs.CL" },
      fetchIntervalSec: 1200,
      initialFetchDays: 3,
      category: "research",
      tags: ["ai", "research", "paper", "nlp"],
      priority: 84,
    },
    {
      id: "arxiv-cs-lg",
      name: "arXiv cs.LG",
      description: "arXiv 机器学习分类",
      kind: "rss",
      config: { feedUrl: "https://rss.arxiv.org/rss/cs.LG" },
      fetchIntervalSec: 1200,
      initialFetchDays: 3,
      category: "research",
      tags: ["ai", "research", "paper", "ml"],
      priority: 86,
    },
  ],
};

export const NURSING_RESEARCH_CORE_PRESET: SourcePresetPack = {
  key: "nursing-research-core",
  label: "护理科研核心预设",
  description: "护理学核心期刊与高相关临床研究来源",
  items: [
    {
      id: "ijns",
      name: "International Journal of Nursing Studies",
      description: "护理研究顶刊（IJNS）",
      kind: "rss",
      config: { feedUrl: "https://rss.sciencedirect.com/publication/science/00207489" },
      fetchIntervalSec: 1800,
      initialFetchDays: 5,
      category: "nursing",
      tags: ["nursing", "research", "clinical"],
      priority: 95,
    },
    {
      id: "jan",
      name: "Journal of Advanced Nursing",
      description: "高级护理研究与实践",
      kind: "rss",
      config: { feedUrl: "https://onlinelibrary.wiley.com/feed/13652648/most-recent" },
      fetchIntervalSec: 1800,
      initialFetchDays: 5,
      category: "nursing",
      tags: ["nursing", "research", "practice"],
      priority: 93,
    },
    {
      id: "jcn",
      name: "Journal of Clinical Nursing",
      description: "临床护理研究",
      kind: "rss",
      config: { feedUrl: "https://onlinelibrary.wiley.com/feed/13652702/most-recent" },
      fetchIntervalSec: 1800,
      initialFetchDays: 5,
      category: "nursing",
      tags: ["nursing", "clinical"],
      priority: 90,
    },
    {
      id: "nurse-education-today",
      name: "Nurse Education Today",
      description: "护理教育与培训研究",
      kind: "rss",
      config: { feedUrl: "https://rss.sciencedirect.com/publication/science/02606917" },
      fetchIntervalSec: 1800,
      initialFetchDays: 5,
      category: "nursing",
      tags: ["nursing", "education"],
      priority: 86,
    },
    {
      id: "bmc-nursing",
      name: "BMC Nursing",
      description: "开放获取护理研究",
      kind: "rss",
      config: { feedUrl: "https://bmcnurs.biomedcentral.com/articles/rss.xml" },
      fetchIntervalSec: 1200,
      initialFetchDays: 5,
      category: "nursing",
      tags: ["nursing", "open-access"],
      priority: 82,
    },
    {
      id: "nursing-open",
      name: "Nursing Open",
      description: "护理学开放获取期刊",
      kind: "rss",
      config: { feedUrl: "https://onlinelibrary.wiley.com/feed/20541058/most-recent" },
      fetchIntervalSec: 1800,
      initialFetchDays: 5,
      category: "nursing",
      tags: ["nursing", "open-access"],
      priority: 80,
    },
    {
      id: "int-j-mental-health-nursing",
      name: "International Journal of Mental Health Nursing",
      description: "精神心理护理研究",
      kind: "rss",
      config: { feedUrl: "https://onlinelibrary.wiley.com/feed/14470349/most-recent" },
      fetchIntervalSec: 2400,
      initialFetchDays: 5,
      category: "nursing",
      tags: ["nursing", "mental-health"],
      priority: 76,
    },
    {
      id: "journal-nursing-management",
      name: "Journal of Nursing Management",
      description: "护理管理与组织研究",
      kind: "rss",
      config: { feedUrl: "https://onlinelibrary.wiley.com/feed/13652834/most-recent" },
      fetchIntervalSec: 2400,
      initialFetchDays: 5,
      category: "nursing",
      tags: ["nursing", "management"],
      priority: 74,
    },
    {
      id: "jpn",
      name: "Journal of Pediatric Nursing",
      description: "儿科护理研究",
      kind: "rss",
      config: { feedUrl: "https://rss.sciencedirect.com/publication/science/08825963" },
      fetchIntervalSec: 2400,
      initialFetchDays: 5,
      category: "nursing",
      tags: ["nursing", "pediatric"],
      priority: 70,
    },
    {
      id: "journal-gerontological-nursing",
      name: "Journal of Gerontological Nursing",
      description: "老年护理研究",
      kind: "rss",
      config: { feedUrl: "https://journals.healio.com/action/showFeed?type=etoc&feed=rss&jc=jgn" },
      fetchIntervalSec: 2400,
      initialFetchDays: 5,
      category: "nursing",
      tags: ["nursing", "geriatric"],
      priority: 68,
    },
  ],
};

export const MED_EVIDENCE_GUIDELINES_PRESET: SourcePresetPack = {
  key: "med-evidence-guidelines",
  label: "循证与指南预设",
  description: "循证综述、指南与护理政策更新来源",
  items: [
    {
      id: "worldviews-ebn",
      name: "Worldviews on Evidence-Based Nursing",
      description: "循证护理研究与实践转化",
      kind: "rss",
      config: { feedUrl: "https://sigmapubs.onlinelibrary.wiley.com/feed/17416787/most-recent" },
      fetchIntervalSec: 2400,
      initialFetchDays: 7,
      category: "evidence",
      tags: ["nursing", "evidence", "guideline"],
      priority: 92,
    },
    {
      id: "jbi-evidence-synthesis",
      name: "JBI Evidence Synthesis",
      description: "JBI 证据综合与系统综述",
      kind: "rss",
      config: { feedUrl: "https://journals.lww.com/jbisrir/_layouts/15/oaks.journals/feed.aspx?Feed=rss&ID=1" },
      fetchIntervalSec: 2400,
      initialFetchDays: 7,
      category: "evidence",
      tags: ["evidence", "systematic-review"],
      priority: 88,
    },
    {
      id: "cochrane-news",
      name: "Cochrane News and Blog",
      description: "Cochrane 最新综述与证据动态",
      kind: "rss",
      config: { feedUrl: "https://www.cochrane.org/news/rss.xml" },
      fetchIntervalSec: 2400,
      initialFetchDays: 7,
      category: "evidence",
      tags: ["evidence", "cochrane", "review"],
      priority: 90,
    },
    {
      id: "who-nursing-midwifery",
      name: "WHO Nursing and Midwifery",
      description: "WHO 护理与助产政策更新",
      kind: "rss",
      config: { feedUrl: "https://www.who.int/teams/health-workforce/nursing-and-midwifery/rss" },
      fetchIntervalSec: 3600,
      initialFetchDays: 7,
      category: "policy",
      tags: ["policy", "nursing", "global-health"],
      priority: 84,
    },
    {
      id: "icn-news",
      name: "International Council of Nurses",
      description: "国际护士会新闻与声明",
      kind: "rss",
      config: { feedUrl: "https://www.icn.ch/rss.xml" },
      fetchIntervalSec: 3600,
      initialFetchDays: 7,
      category: "policy",
      tags: ["policy", "nursing", "industry"],
      priority: 80,
    },
    {
      id: "nice-guidance",
      name: "NICE Guidance Updates",
      description: "英国 NICE 指南更新",
      kind: "rss",
      config: { feedUrl: "https://www.nice.org.uk/guidance/published?type=guidance&output=atom" },
      fetchIntervalSec: 3600,
      initialFetchDays: 7,
      category: "evidence",
      tags: ["guideline", "evidence", "clinical"],
      priority: 78,
    },
    {
      id: "ahrq-news",
      name: "AHRQ News and Updates",
      description: "AHRQ 医疗质量与循证更新",
      kind: "rss",
      config: { feedUrl: "https://www.ahrq.gov/news/newsroom/index.xml" },
      fetchIntervalSec: 3600,
      initialFetchDays: 7,
      category: "policy",
      tags: ["quality", "evidence", "policy"],
      priority: 74,
    },
    {
      id: "cdc-mmwr",
      name: "CDC MMWR",
      description: "CDC MMWR 公共卫生证据更新",
      kind: "rss",
      config: { feedUrl: "https://tools.cdc.gov/api/v2/resources/media/132608.rss" },
      fetchIntervalSec: 3600,
      initialFetchDays: 7,
      category: "policy",
      tags: ["public-health", "evidence"],
      priority: 70,
    },
  ],
};

export function getPresetPack(key: string): SourcePresetPack | null {
  return listPresetPacks().find((pack) => pack.key === key) ?? null;
}

export function listPresetPacks(): SourcePresetPack[] {
  return [
    AI_HOTSPOT_RESEARCH_PRESET,
    NURSING_RESEARCH_CORE_PRESET,
    MED_EVIDENCE_GUIDELINES_PRESET,
  ];
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
