import type { Job } from "bullmq";
import { getLlmClient } from "@news/ai";
import { getClusterNamingContext, setClusterTopic } from "@news/db";

type NameClusterJobData = {
  clusterId: string;
};

export async function handleNameCluster(job: Job<NameClusterJobData>) {
  const ctx = await getClusterNamingContext(job.data.clusterId, 8);
  const titles = ctx.titles.slice(0, 5);
  if (titles.length === 0) return { ok: false, reason: "no-titles" };

  const client = getLlmClient();
  const prompt = [
    "为下面新闻标题生成一个简短中文事件主题（不超过16字）。",
    "只返回 JSON: {\"topic\":\"...\"}",
    titles.map((t, i) => `${i + 1}. ${t}`).join("\n"),
    ctx.entities.length ? `实体：${ctx.entities.join("、")}` : "",
    ctx.tags.length ? `标签：${ctx.tags.join("、")}` : "",
  ].join("\n\n");

  const raw = await client.chatJson({
    system: "你是新闻聚类命名助手，只输出JSON。",
    user: prompt,
  });
  let topic = "";
  try {
    const parsed = JSON.parse(raw) as { topic?: string };
    if (parsed.topic && parsed.topic.trim()) {
      topic = parsed.topic.trim().slice(0, 16);
    }
  } catch {
    // keep fallback path
  }

  if (!topic) {
    if (ctx.entities.length > 0) topic = `${ctx.entities[0]}相关事件`;
    else if (ctx.tags.length > 0) topic = `${ctx.tags[0]}事件`;
    else topic = "事件聚合";
  }

  await setClusterTopic(job.data.clusterId, topic);
  return { ok: true, topic };
}
