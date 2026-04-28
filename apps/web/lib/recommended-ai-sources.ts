import { type SourcePreset, type SourcePresetKind } from "./source-presets";

export type RecommendedAiSourceSection =
  | "high-signal"
  | "x-signal"
  | "chinese"
  | "official"
  | "industry"
  | "research";

export type RecommendedAiSource = SourcePreset & {
  section: RecommendedAiSourceSection;
  homepageUrl: string;
  access: "free";
  rationale: string;
  sourcePool: "official" | "industry" | "x-signal" | "hn-popular-blogs-2025" | "internal" | "chinese";
};

export const RECOMMENDED_SECTION_META: Record<
  RecommendedAiSourceSection,
  { label: string; description: string }
> = {
  "high-signal": {
    label: "高信号作者",
    description: "更适合看观点、模型判断和工具链变化。",
  },
  "x-signal": {
    label: "X 信号",
    description: "用于补充突发讨论和关键词热度的公共 X 搜索源。",
  },
  chinese: {
    label: "中文源",
    description: "中文 AI 媒体、官方号和社区更新。",
  },
  official: {
    label: "官方发布",
    description: "实验室、平台和厂商的一手公告。",
  },
  industry: {
    label: "行业新闻",
    description: "公司、产品和市场动态。",
  },
  research: {
    label: "研究前沿",
    description: "论文与方法更新，适合做底池。",
  },
};

const HN_TOP_FEED_SOURCES: RecommendedAiSource[] = [
  {
    id: "simon-willison",
    name: "Simon Willison",
    description: "高密度跟进 LLM、工具链、模型评测与工作流。",
    kind: "rss",
    config: { feedUrl: "https://simonwillison.net/atom/everything/" },
    fetchIntervalSec: 1200,
    initialFetchDays: 3,
    category: "hotspot",
    tags: ["ai", "creator", "llm", "tooling"],
    priority: 98,
    section: "high-signal",
    homepageUrl: "https://simonwillison.net/",
    access: "free",
    rationale: "非常适合发现模型、Agent 和开源生态里的高信号变化。",
    sourcePool: "hn-popular-blogs-2025",
  },
  {
    id: "dwarkesh",
    name: "Dwarkesh",
    description: "前沿 AI、经济与长线影响的深度访谈与长文。",
    kind: "rss",
    config: { feedUrl: "https://www.dwarkesh.com/feed" },
    fetchIntervalSec: 1800,
    initialFetchDays: 5,
    category: "hotspot",
    tags: ["ai", "creator", "analysis", "policy"],
    priority: 90,
    section: "high-signal",
    homepageUrl: "https://www.dwarkesh.com/",
    access: "free",
    rationale: "适合补充宏观视角，不只是盯产品发布。",
    sourcePool: "hn-popular-blogs-2025",
  },
  {
    id: "interconnects",
    name: "Interconnects",
    description: "开放权重模型、训练策略和前沿路线观察。",
    kind: "rss",
    config: { feedUrl: "https://www.interconnects.ai/feed" },
    fetchIntervalSec: 1800,
    initialFetchDays: 5,
    category: "hotspot",
    tags: ["ai", "creator", "open-source", "research"],
    priority: 92,
    section: "high-signal",
    homepageUrl: "https://www.interconnects.ai/",
    access: "free",
    rationale: "对模型圈的温度变化很敏感，适合做值得关注前哨。",
    sourcePool: "internal",
  },
  {
    id: "one-useful-thing",
    name: "One Useful Thing",
    description: "生成式 AI 使用方式、教育与组织影响。",
    kind: "rss",
    config: { feedUrl: "https://www.oneusefulthing.org/feed" },
    fetchIntervalSec: 1800,
    initialFetchDays: 5,
    category: "hotspot",
    tags: ["ai", "creator", "adoption", "education"],
    priority: 88,
    section: "high-signal",
    homepageUrl: "https://www.oneusefulthing.org/",
    access: "free",
    rationale: "适合补足“AI 真正在组织里怎么落地”的视角。",
    sourcePool: "internal",
  },
  {
    id: "gary-marcus",
    name: "Gary Marcus",
    description: "对 AI 产业、能力边界和风险的批判性观察。",
    kind: "rss",
    config: { feedUrl: "https://garymarcus.substack.com/feed" },
    fetchIntervalSec: 1800,
    initialFetchDays: 5,
    category: "hotspot",
    tags: ["ai", "creator", "critique", "policy"],
    priority: 82,
    section: "high-signal",
    homepageUrl: "https://garymarcus.substack.com/",
    access: "free",
    rationale: "适合给值得关注判断增加反方信号，避免全是乐观叙事。",
    sourcePool: "hn-popular-blogs-2025",
  },
  {
    id: "wheres-your-ed-at",
    name: "Where's Your Ed At",
    description: "对 AI 商业化、泡沫与平台叙事的尖锐观察。",
    kind: "rss",
    config: { feedUrl: "https://www.wheresyoured.at/rss/" },
    fetchIntervalSec: 1800,
    initialFetchDays: 5,
    category: "hotspot",
    tags: ["ai", "creator", "business", "critique"],
    priority: 84,
    section: "high-signal",
    homepageUrl: "https://www.wheresyoured.at/",
    access: "free",
    rationale: "很适合给市场值得关注加一层逆风视角。",
    sourcePool: "hn-popular-blogs-2025",
  },
  {
    id: "minimaxir",
    name: "Max Woolf",
    description: "模型、生成式 AI 实验和开发细节。",
    kind: "rss",
    config: { feedUrl: "https://minimaxir.com/index.xml" },
    fetchIntervalSec: 1800,
    initialFetchDays: 5,
    category: "hotspot",
    tags: ["ai", "creator", "experiments", "tooling"],
    priority: 80,
    section: "high-signal",
    homepageUrl: "https://minimaxir.com/",
    access: "free",
    rationale: "适合补实操层面的高质量观察。",
    sourcePool: "hn-popular-blogs-2025",
  },
  {
    id: "sean-goedecke",
    name: "Sean Goedecke",
    description: "工程与开发工作流里的 AI / agent 实战内容。",
    kind: "rss",
    config: { feedUrl: "https://www.seangoedecke.com/rss.xml" },
    fetchIntervalSec: 1800,
    initialFetchDays: 5,
    category: "hotspot",
    tags: ["ai", "creator", "engineering", "agent"],
    priority: 74,
    section: "high-signal",
    homepageUrl: "https://www.seangoedecke.com/",
    access: "free",
    rationale: "适合让信源库不只盯媒体，也能看到工程侧实战变化。",
    sourcePool: "hn-popular-blogs-2025",
  },
];

const X_SIGNAL_SOURCES: RecommendedAiSource[] = [
  "OpenAI",
  "Anthropic",
  "Claude",
  "GPT-5",
  "AI agent",
  "Gemini",
  "DeepSeek",
].map((query) => ({
  id: `x-search-${query.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  name: `X Search: ${query}`,
  description: `公共 X 搜索信号：${query}`,
  kind: "x-rsshub-search",
  config: { query, lang: "en", description: `High-signal X posts mentioning ${query}` },
  fetchIntervalSec: 600,
  initialFetchDays: 1,
  maxItemAgeDays: 30,
  category: "hotspot",
  tags: ["x", "signal", "ai"],
  priority: 91,
  section: "x-signal",
  homepageUrl: "https://x.com/search",
  access: "free",
  rationale: "用于补充不依赖手动关注博主的 X 讨论信号。",
  sourcePool: "x-signal",
}));

const CHINESE_SOURCES: RecommendedAiSource[] = [
  {
    id: "qbitai",
    name: "量子位",
    description: "中文 AI 媒体，高频覆盖模型、产品和产业新闻。",
    kind: "rss",
    config: { feedUrl: "https://www.qbitai.com/feed" },
    fetchIntervalSec: 900,
    initialFetchDays: 3,
    category: "hotspot",
    tags: ["ai", "中文", "media", "hotspot"],
    priority: 96,
    section: "chinese",
    homepageUrl: "https://www.qbitai.com/",
    access: "free",
    rationale: "中文 AI 值得关注里最实用的一档，更新快，覆盖也广。",
    sourcePool: "chinese",
  },
  {
    id: "machine-heart",
    name: "机器之心",
    description: "AI 技术与产业深度报道，适合追多信源共识。",
    kind: "rss",
    config: { feedUrl: "https://wechat2rss.bestblogs.dev/feed/8d97af31b0de9e48da74558af128a4673d78c9a3.xml" },
    fetchIntervalSec: 900,
    initialFetchDays: 3,
    category: "hotspot",
    tags: ["ai", "中文", "media", "hotspot"],
    priority: 95,
    section: "chinese",
    homepageUrl: "https://www.jiqizhixin.com/",
    access: "free",
    rationale: "中文 AI 新闻里的老牌高频源，适合做值得关注交叉验证。",
    sourcePool: "chinese",
  },
  {
    id: "new-zhiyuan",
    name: "新智元",
    description: "AI 产业、模型和应用动态的中文报道。",
    kind: "rss",
    config: { feedUrl: "https://wechat2rss.bestblogs.dev/feed/e531a18b21c34cf787b83ab444eef659d7a980de.xml" },
    fetchIntervalSec: 900,
    initialFetchDays: 3,
    category: "hotspot",
    tags: ["ai", "中文", "media", "industry"],
    priority: 92,
    section: "chinese",
    homepageUrl: "https://www.zhidx.com/",
    access: "free",
    rationale: "适合补充中文产业面和传播面信号。",
    sourcePool: "chinese",
  },
  {
    id: "zhidxi",
    name: "智东西",
    description: "偏产业、产品和公司动态的中文 AI 媒体。",
    kind: "rss",
    config: { feedUrl: "https://wechat2rss.bestblogs.dev/feed/cfd52b4245ca6119b2fda4ef934832c689028927.xml" },
    fetchIntervalSec: 900,
    initialFetchDays: 3,
    category: "hotspot",
    tags: ["ai", "中文", "media", "industry"],
    priority: 88,
    section: "chinese",
    homepageUrl: "https://zhidx.com/",
    access: "free",
    rationale: "更偏产业和公司动作，适合和英文新闻交叉看。",
    sourcePool: "chinese",
  },
  {
    id: "ai-review",
    name: "AI科技评论",
    description: "中文 AI 资讯与观点，偏产业和方法更新。",
    kind: "rss",
    config: { feedUrl: "https://wechat2rss.bestblogs.dev/feed/789e5fefb9cc2646ba7b680cb7a88378a34eb7a4.xml" },
    fetchIntervalSec: 900,
    initialFetchDays: 3,
    category: "hotspot",
    tags: ["ai", "中文", "media"],
    priority: 84,
    section: "chinese",
    homepageUrl: "https://www.leiphone.com/category/ai",
    access: "free",
    rationale: "适合补中文媒体层的信息密度。",
    sourcePool: "chinese",
  },
  {
    id: "tencent-hunyuan",
    name: "腾讯混元",
    description: "腾讯官方大模型和产品更新。",
    kind: "rss",
    config: { feedUrl: "https://wechat2rss.bestblogs.dev/feed/306ce19a1ca590c9c2df781789e828d1acfa1356.xml" },
    fetchIntervalSec: 900,
    initialFetchDays: 3,
    category: "hotspot",
    tags: ["ai", "中文", "official", "model"],
    priority: 90,
    section: "chinese",
    homepageUrl: "https://hunyuan.tencent.com/",
    access: "free",
    rationale: "官方一手源，适合追模型和产品发布。",
    sourcePool: "chinese",
  },
  {
    id: "tongyi-model",
    name: "通义大模型",
    description: "阿里系大模型与平台更新。",
    kind: "rss",
    config: { feedUrl: "https://wechat2rss.bestblogs.dev/feed/4ebee6222ae08705b8aabc9116f0defbcb6b17c6.xml" },
    fetchIntervalSec: 900,
    initialFetchDays: 3,
    category: "hotspot",
    tags: ["ai", "中文", "official", "model"],
    priority: 88,
    section: "chinese",
    homepageUrl: "https://tongyi.aliyun.com/",
    access: "free",
    rationale: "适合盯中文大模型和云平台发布节奏。",
    sourcePool: "chinese",
  },
  {
    id: "baidu-ai",
    name: "百度AI",
    description: "百度 AI、文心和平台生态更新。",
    kind: "rss",
    config: { feedUrl: "https://wechat2rss.bestblogs.dev/feed/d0767d885e6ba213344fb0c0408c51331e23a994.xml" },
    fetchIntervalSec: 900,
    initialFetchDays: 3,
    category: "hotspot",
    tags: ["ai", "中文", "official", "platform"],
    priority: 84,
    section: "chinese",
    homepageUrl: "https://ai.baidu.com/",
    access: "free",
    rationale: "官方产品线更新有时很密集，适合与行业源交叉看。",
    sourcePool: "chinese",
  },
  {
    id: "kimi",
    name: "月之暗面 Kimi",
    description: "Kimi 和月之暗面的官方更新。",
    kind: "rss",
    config: { feedUrl: "https://wechat2rss.bestblogs.dev/feed/c5c43d4bc17bae656763859ed0903bb6314ec6fe.xml" },
    fetchIntervalSec: 900,
    initialFetchDays: 3,
    category: "hotspot",
    tags: ["ai", "中文", "official", "model"],
    priority: 86,
    section: "chinese",
    homepageUrl: "https://moonshot.ai/",
    access: "free",
    rationale: "适合追中文大模型产品的更新和叙事变化。",
    sourcePool: "chinese",
  },
  {
    id: "modelscope",
    name: "魔搭ModelScope社区",
    description: "开源模型与社区生态更新。",
    kind: "rss",
    config: { feedUrl: "https://wechat2rss.bestblogs.dev/feed/d993a885260f96057b9a4c96212cb2c95bb5054b.xml" },
    fetchIntervalSec: 900,
    initialFetchDays: 3,
    category: "hotspot",
    tags: ["ai", "中文", "community", "open-source"],
    priority: 85,
    section: "chinese",
    homepageUrl: "https://modelscope.cn/",
    access: "free",
    rationale: "开源模型、工具和社区活动的中文底池。",
    sourcePool: "chinese",
  },
  {
    id: "infoq-zh",
    name: "InfoQ 中文",
    description: "工程、AI 和技术实践的中文资讯。",
    kind: "rss",
    config: { feedUrl: "https://wechat2rss.bestblogs.dev/feed/13da94d7eb314b49fa251cb7e8399cae29d772db.xml" },
    fetchIntervalSec: 1200,
    initialFetchDays: 3,
    category: "hotspot",
    tags: ["ai", "中文", "engineering"],
    priority: 80,
    section: "chinese",
    homepageUrl: "https://www.infoq.cn/",
    access: "free",
    rationale: "更偏工程实践和落地语境，适合作为辅助观察源。",
    sourcePool: "chinese",
  },
  {
    id: "datawhale",
    name: "Datawhale",
    description: "中文 AI / 数据科学社区，适合补社区与教程视角。",
    kind: "rss",
    config: { feedUrl: "https://wechat2rss.bestblogs.dev/feed/ea0dd8bddfe4fbfb32eaa81a1e1b628d45e97a80.xml" },
    fetchIntervalSec: 1200,
    initialFetchDays: 3,
    category: "research",
    tags: ["ai", "中文", "community", "education"],
    priority: 78,
    section: "chinese",
    homepageUrl: "https://www.datawhale.cn/",
    access: "free",
    rationale: "适合补充中文社区、教程和实践活动信号。",
    sourcePool: "chinese",
  },
];

const OFFICIAL_SOURCES: RecommendedAiSource[] = [
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
    section: "official",
    homepageUrl: "https://openai.com/newsroom/",
    access: "free",
    rationale: "模型和产品发布的第一现场。",
    sourcePool: "official",
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
    section: "official",
    homepageUrl: "https://deepmind.google/blog/",
    access: "free",
    rationale: "前沿研究与发布节奏的重要观察点。",
    sourcePool: "official",
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
    section: "official",
    homepageUrl: "https://huggingface.co/blog",
    access: "free",
    rationale: "开源模型与工具链变化会在这里最早冒头。",
    sourcePool: "official",
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
    section: "official",
    homepageUrl: "https://blogs.microsoft.com/ai/",
    access: "free",
    rationale: "企业侧 AI 产品和平台更新密度高。",
    sourcePool: "official",
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
    section: "official",
    homepageUrl: "https://blog.google/technology/ai/",
    access: "free",
    rationale: "Gemini、Google AI 产品和研究方向的重要窗口。",
    sourcePool: "official",
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
    section: "official",
    homepageUrl: "https://developer.nvidia.com/blog/category/ai/",
    access: "free",
    rationale: "基础设施和推理工程的变化通常先在这里出现。",
    sourcePool: "official",
  },
];

const INDUSTRY_SOURCES: RecommendedAiSource[] = [
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
    section: "industry",
    homepageUrl: "https://techcrunch.com/category/artificial-intelligence/",
    access: "free",
    rationale: "融资、收购和产品发布覆盖面广。",
    sourcePool: "industry",
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
    section: "industry",
    homepageUrl: "https://www.theverge.com/ai-artificial-intelligence",
    access: "free",
    rationale: "适合追面向公众的 AI 值得关注和平台变化。",
    sourcePool: "industry",
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
    section: "industry",
    homepageUrl: "https://www.wired.com/tag/ai/",
    access: "free",
    rationale: "值得关注叙事能力强，适合做新闻感补充。",
    sourcePool: "industry",
  },
  {
    id: "venturebeat-ai",
    name: "VentureBeat AI",
    description: "创业、平台和企业 AI 新闻。",
    kind: "rss",
    config: { feedUrl: "http://feeds.venturebeat.com/VentureBeat" },
    fetchIntervalSec: 900,
    initialFetchDays: 2,
    category: "hotspot",
    tags: ["ai", "industry", "enterprise"],
    priority: 78,
    section: "industry",
    homepageUrl: "https://venturebeat.com/",
    access: "free",
    rationale: "企业和平台侧消息更新频繁。",
    sourcePool: "industry",
  },
  {
    id: "hn-ai",
    name: "Hacker News: AI",
    description: "开发者社区讨论流，适合补充热度判断。",
    kind: "hn",
    config: { query: "artificial intelligence OR LLM OR model", pointsMin: 30 },
    fetchIntervalSec: 300,
    initialFetchDays: 1,
    category: "hotspot",
    tags: ["ai", "developer", "hotspot"],
    priority: 96,
    section: "industry",
    homepageUrl: "https://news.ycombinator.com/",
    access: "free",
    rationale: "开发者社区信号强，适合追值得关注与讨论度。",
    sourcePool: "industry",
  },
];

const RESEARCH_SOURCES: RecommendedAiSource[] = [
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
    section: "research",
    homepageUrl: "https://arxiv.org/list/cs.AI/recent",
    access: "free",
    rationale: "AI 研究总池，适合做前沿底层来源。",
    sourcePool: "official",
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
    section: "research",
    homepageUrl: "https://arxiv.org/list/cs.CL/recent",
    access: "free",
    rationale: "语言模型相关论文的主要来源之一。",
    sourcePool: "official",
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
    section: "research",
    homepageUrl: "https://arxiv.org/list/cs.LG/recent",
    access: "free",
    rationale: "论文量很大，适合做前沿底池，但前台应默认折叠。",
    sourcePool: "official",
  },
];

export const ALL_RECOMMENDED_AI_SOURCES: RecommendedAiSource[] = [
  ...HN_TOP_FEED_SOURCES,
  ...X_SIGNAL_SOURCES,
  ...CHINESE_SOURCES,
  ...OFFICIAL_SOURCES,
  ...INDUSTRY_SOURCES,
  ...RESEARCH_SOURCES,
];

export function listRecommendedAiSources(): RecommendedAiSource[] {
  return [...ALL_RECOMMENDED_AI_SOURCES].sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.name.localeCompare(b.name, "en"),
  );
}

export function buildRecommendedSourceSections(rows = listRecommendedAiSources()) {
  const order: RecommendedAiSourceSection[] = ["high-signal", "x-signal", "chinese", "official", "industry", "research"];
  return order.map((key) => ({
    key,
    ...RECOMMENDED_SECTION_META[key],
    items: rows.filter((row) => row.section === key),
  }));
}

export function getRecommendedSourceSignature(input: {
  kind: SourcePresetKind;
  config: Record<string, unknown>;
}) {
  const config = input.config ?? {};
  if (input.kind === "rss") {
    const feedUrl = typeof config.feedUrl === "string" ? config.feedUrl.trim() : "";
    if (feedUrl) {
      try {
        const url = new URL(feedUrl);
        const path = url.pathname.replace(/\/+$/, "") || "";
        return `${url.protocol}//${url.host}${path}`.toLowerCase();
      } catch {
        return `rss:${feedUrl.toLowerCase()}`;
      }
    }
  }
  if (input.kind === "hn") {
    const query = typeof config.query === "string" ? config.query.trim().toLowerCase() : "";
    const pointsMin =
      typeof config.pointsMin === "number" && Number.isFinite(config.pointsMin)
        ? String(Math.trunc(config.pointsMin))
        : "0";
    return `hn:${query}::${pointsMin}`;
  }
  if (input.kind === "x-rsshub") {
    const handle = typeof config.handle === "string" ? config.handle.replace(/^@/, "").trim().toLowerCase() : "";
    return handle ? `x:${handle}` : `x:${JSON.stringify(config)}`;
  }
  if (input.kind === "x-rsshub-search") {
    const query = typeof config.query === "string" ? config.query.trim().toLowerCase() : "";
    const lang = typeof config.lang === "string" ? config.lang.trim().toLowerCase() : "";
    return query ? `x-search:${query}${lang ? `:${lang}` : ""}` : `x-search:${JSON.stringify(config)}`;
  }
  if (input.kind === "wechat-wewe") {
    const feedUrl = typeof config.feedUrl === "string" ? config.feedUrl : "";
    const mp = /MP_WXS_\w+/.exec(feedUrl);
    if (mp) return `wewe:${mp[0]}`;
    const mpId = typeof config.mpId === "string" ? config.mpId.trim() : "";
    return `wewe:${mpId || feedUrl.toLowerCase()}`;
  }
  return `${input.kind}:${JSON.stringify(config)}`;
}

function toSignatureLike(value: { kind: SourcePresetKind; config: Record<string, unknown> }) {
  return getRecommendedSourceSignature(value);
}

export function isRecommendedSourceInLibrary(
  source: RecommendedAiSource,
  existingSignatures: Set<string>,
  optimisticSignatures: Set<string>,
) {
  const signature = toSignatureLike({ kind: source.kind, config: source.config });
  return existingSignatures.has(signature) || optimisticSignatures.has(signature);
}
