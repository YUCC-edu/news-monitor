import type { Job } from "bullmq";
import { getLlmClient } from "@news/ai";
import { getClusterRecentTitles, setClusterTopic } from "@news/db";

type NameClusterJobData = {
  clusterId: string;
};

export async function handleNameCluster(job: Job<NameClusterJobData>) {
  const titles = await getClusterRecentTitles(job.data.clusterId, 5);
  if (titles.length === 0) return { ok: false, reason: "no-titles" };

  const client = getLlmClient();
  const prompt = [
    "为下面新闻标题生成一个简短中文事件主题（不超过16字）。",
    "只返回 JSON: {\"topic\":\"...\"}",
    titles.map((t, i) => `${i + 1}. ${t}`).join("\n"),
  ].join("\n\n");

  const raw = await client.chatJson({
    system: "你是新闻聚类命名助手，只输出JSON。",
    user: prompt,
  });
  let topic = "事件聚合";
  try {
    const parsed = JSON.parse(raw) as { topic?: string };
    if (parsed.topic && parsed.topic.trim()) {
      topic = parsed.topic.trim().slice(0, 16);
    }
  } catch {
    // keep default
  }

  await setClusterTopic(job.data.clusterId, topic);
  return { ok: true, topic };
}
