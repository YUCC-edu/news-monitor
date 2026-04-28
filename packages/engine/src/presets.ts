import type { SourceKind, SourceInput } from "@news/db";

type PresetSource = Omit<SourceInput, "id"> & {
  key: string;
  description: string;
};

const AI_HIGH_SIGNAL: PresetSource[] = [
  {
    key: "openai-blog",
    kind: "rss",
    name: "OpenAI Blog",
    description: "Official OpenAI product and research announcements.",
    config: { feedUrl: "https://openai.com/news/rss.xml" },
    enabled: true,
    fetchIntervalSec: 900,
    initialFetchDays: 7,
    maxItemAgeDays: 365,
  },
  {
    key: "anthropic-news",
    kind: "rss",
    name: "Anthropic News",
    description: "Official Anthropic announcements and research updates.",
    config: { feedUrl: "https://www.anthropic.com/news/rss.xml" },
    enabled: true,
    fetchIntervalSec: 900,
    initialFetchDays: 7,
    maxItemAgeDays: 365,
  },
  {
    key: "google-ai-blog",
    kind: "rss",
    name: "Google AI Blog",
    description: "Google AI research and product updates.",
    config: { feedUrl: "https://blog.google/technology/ai/rss/" },
    enabled: true,
    fetchIntervalSec: 1200,
    initialFetchDays: 7,
    maxItemAgeDays: 365,
  },
  {
    key: "microsoft-ai-blog",
    kind: "rss",
    name: "Microsoft AI Blog",
    description: "Microsoft AI platform and product updates.",
    config: { feedUrl: "https://blogs.microsoft.com/ai/feed/" },
    enabled: true,
    fetchIntervalSec: 1200,
    initialFetchDays: 7,
    maxItemAgeDays: 365,
  },
  {
    key: "hugging-face-blog",
    kind: "rss",
    name: "Hugging Face Blog",
    description: "Open-source AI model and tooling updates.",
    config: { feedUrl: "https://huggingface.co/blog/feed.xml" },
    enabled: true,
    fetchIntervalSec: 1200,
    initialFetchDays: 7,
    maxItemAgeDays: 365,
  },
  {
    key: "arxiv-cs-ai",
    kind: "rss",
    name: "arXiv cs.AI",
    description: "AI research preprints from arXiv.",
    config: { feedUrl: "https://export.arxiv.org/rss/cs.AI" },
    enabled: true,
    fetchIntervalSec: 1800,
    initialFetchDays: 3,
    maxItemAgeDays: 90,
  },
  ...["OpenAI", "Anthropic", "Claude", "GPT-5", "AI agent", "Gemini", "DeepSeek"].map((query) => ({
    key: `x-search-${query.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    kind: "x-rsshub-search" as const,
    name: `X Search: ${query}`,
    description: `Public X search signal for ${query}.`,
    config: { query, lang: "en", description: `High-signal X posts mentioning ${query}` },
    enabled: true,
    fetchIntervalSec: 600,
    initialFetchDays: 1,
    maxItemAgeDays: 30,
  })),
];

const PACKS: Record<string, { name: string; description: string; sources: PresetSource[] }> = {
  "ai-high-signal": {
    name: "High-signal AI",
    description: "Official and research sources for tracking AI hotspots.",
    sources: AI_HIGH_SIGNAL,
  },
};

export function listEnginePresetPacks() {
  return Object.entries(PACKS).map(([key, pack]) => ({
    key,
    name: pack.name,
    description: pack.description,
    sourceCount: pack.sources.length,
  }));
}

export function getEnginePresetSources(packKey: string): PresetSource[] | null {
  return PACKS[packKey]?.sources ?? null;
}

export type EnginePresetSource = PresetSource & { kind: SourceKind };
