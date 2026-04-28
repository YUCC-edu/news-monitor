import type { Job } from "bullmq";
import { getLlmClient } from "@news/ai";
import { getStatsOverview, upsertSource } from "@news/db";
import { aiMode } from "@news/shared";

type RecommendXSignalsJobData = {
  limit?: number;
};

function normalizeQuery(raw: string) {
  return raw
    .replace(/\s+/g, " ")
    .replace(/[^\p{Letter}\p{Number}\s._#-]/gu, "")
    .trim()
    .slice(0, 80);
}

export async function handleRecommendXSignals(job: Job<RecommendXSignalsJobData>) {
  if (aiMode() !== "llm") return { ok: true, skipped: "ai-mode-core", created: [] as string[] };
  const limit = Math.min(Math.max(job.data.limit ?? 8, 1), 20);
  const overview = await getStatsOverview({ range: "7d", audience: "public", topN: 20, minSources: 1 });
  const seeds = [
    ...(overview.keywordGroups ?? []).map((row) => row.displayTitle ?? row.keyword),
    ...(overview.topicGroups ?? []).map((row) => row.displayTitle ?? ""),
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 30);
  if (seeds.length === 0) return { ok: true, created: [] as string[] };

  let queries: string[] = [];
  try {
    const raw = await getLlmClient().chatJson({
      system: "You generate concise X/Twitter search queries for AI news monitoring. Return strict JSON only.",
      user: JSON.stringify({
        task: `Return at most ${limit} search queries. Prefer product, company, model, or concrete event terms. Avoid generic words.`,
        seeds,
        output_shape: { queries: ["OpenAI", "Claude", "AI agent"] },
      }),
    });
    const parsed = JSON.parse(raw) as { queries?: unknown };
    queries = Array.isArray(parsed.queries)
      ? parsed.queries.map((value) => (typeof value === "string" ? normalizeQuery(value) : "")).filter(Boolean)
      : [];
  } catch {
    queries = [];
  }

  const unique = [...new Set(queries)].slice(0, limit);
  const created: string[] = [];
  const conflicts: string[] = [];
  for (const query of unique) {
    const result = await upsertSource({
      kind: "x-rsshub-search",
      name: `X Search: ${query}`,
      scope: "public_seed",
      config: { query, lang: "en", description: "LLM-suggested public X signal source" },
      enabled: true,
      fetchIntervalSec: 600,
      initialFetchDays: 1,
      maxItemAgeDays: 30,
    });
    if (!result) continue;
    if ("conflict" in result) conflicts.push(result.existing.id);
    else created.push(result.id);
  }
  return { ok: true, created, conflicts };
}
