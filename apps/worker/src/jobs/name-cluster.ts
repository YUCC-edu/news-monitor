import type { Job } from "bullmq";
import { getLlmClient } from "@news/ai";
import { getClusterNamingContext, setClusterTopic } from "@news/db";
import { aiMode } from "@news/shared";

type NameClusterJobData = {
  clusterId: string;
};

type NamingContext = Awaited<ReturnType<typeof getClusterNamingContext>>;

function fallbackTopic(ctx: Pick<NamingContext, "titles" | "entities" | "tags">) {
  if (ctx.entities.length > 0) return `${ctx.entities[0]} related`;
  if (ctx.tags.length > 0) return `${ctx.tags[0]} event`;
  const title = ctx.titles[0]?.trim();
  if (title) return title.slice(0, 48);
  return "clustered event";
}

export async function handleNameCluster(job: Job<NameClusterJobData>) {
  const ctx = await getClusterNamingContext(job.data.clusterId, 8);
  const titles = ctx.titles.slice(0, 5);
  if (titles.length === 0) return { ok: false, reason: "no-titles" };

  if (aiMode() !== "llm") {
    const topic = fallbackTopic(ctx);
    await setClusterTopic(job.data.clusterId, topic, "rules");
    return { ok: true, topic, source: "rules" };
  }

  const prompt = [
    "Create a short event topic for these news titles. Keep it under 16 characters.",
    'Return only JSON: {"topic":"..."}',
    titles.map((t, i) => `${i + 1}. ${t}`).join("\n"),
    ctx.entities.length ? `Entities: ${ctx.entities.join(", ")}` : "",
    ctx.tags.length ? `Tags: ${ctx.tags.join(", ")}` : "",
  ].join("\n\n");

  let topic = "";
  try {
    const raw = await getLlmClient().chatJson({
      system: "You name news clusters. Return strict JSON only.",
      user: prompt,
    });
    const parsed = JSON.parse(raw) as { topic?: string };
    if (parsed.topic && parsed.topic.trim()) {
      topic = parsed.topic.trim().slice(0, 32);
    }
  } catch {
    topic = "";
  }

  if (!topic) topic = fallbackTopic(ctx);

  await setClusterTopic(job.data.clusterId, topic, "llm");
  return { ok: true, topic, source: "llm" };
}
