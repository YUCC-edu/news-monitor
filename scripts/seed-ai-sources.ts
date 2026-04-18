import { listSources, upsertSource } from "@news/db";

type SeedSource = {
  kind: "rss" | "hn" | "x-rsshub";
  name: string;
  fetchIntervalSec: number;
  config: Record<string, unknown>;
};

const SEEDS: SeedSource[] = [
  {
    kind: "rss",
    name: "OpenAI Blog",
    fetchIntervalSec: 300,
    config: { feedUrl: "https://openai.com/news/rss.xml" },
  },
  {
    kind: "rss",
    name: "Anthropic News",
    fetchIntervalSec: 300,
    config: { feedUrl: "https://www.anthropic.com/news/rss.xml" },
  },
  {
    kind: "rss",
    name: "Google DeepMind Blog",
    fetchIntervalSec: 600,
    config: { feedUrl: "https://deepmind.google/blog/rss.xml" },
  },
  {
    kind: "rss",
    name: "NVIDIA Developer Blog AI",
    fetchIntervalSec: 600,
    config: {
      feedUrl:
        "https://developer.nvidia.com/blog/category/generative-ai/feed/",
    },
  },
  {
    kind: "hn",
    name: "HN: LLM / GPT / Agent",
    fetchIntervalSec: 300,
    config: { query: "LLM OR GPT OR AI agent", pointsMin: 30 },
  },
  {
    kind: "x-rsshub",
    name: "X @OpenAI",
    fetchIntervalSec: 300,
    config: { handle: "OpenAI", displayName: "OpenAI" },
  },
  {
    kind: "x-rsshub",
    name: "X @AnthropicAI",
    fetchIntervalSec: 300,
    config: { handle: "AnthropicAI", displayName: "Anthropic" },
  },
  {
    kind: "x-rsshub",
    name: "X @GoogleDeepMind",
    fetchIntervalSec: 600,
    config: { handle: "GoogleDeepMind", displayName: "Google DeepMind" },
  },
];

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `"${k}":${stableStringify(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function main() {
  const existing = await listSources();
  let created = 0;

  for (const seed of SEEDS) {
    const found = existing.find(
      (s) =>
        s.kind === seed.kind &&
        s.name === seed.name &&
        stableStringify(s.config) === stableStringify(seed.config),
    );
    if (found) continue;

    const result = await upsertSource({
      kind: seed.kind,
      name: seed.name,
      config: seed.config,
      enabled: true,
      fetchIntervalSec: seed.fetchIntervalSec,
    });
    if (result && "conflict" in result) {
      continue;
    }
    created += 1;
    console.log(`[seed] added: ${seed.name}`);
  }

  console.log(`[seed] done. created=${created}`);
}

void main();
