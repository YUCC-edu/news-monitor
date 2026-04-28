import type { Job } from "bullmq";
import { embedText, translateAndTag } from "@news/ai";
import { aiMode, createLogger } from "@news/shared";
import {
  getClusterById,
  getClusterDistinctSourceCount,
  getItemById,
  updateClusterCentroidAfterItemEnriched,
  updateClusterHotspotStats,
  upsertItemEnrichment,
} from "@news/db";
import { publish } from "../ipc/publish";
import { assignClusterForEmbedding } from "../pipeline/cluster";
import { extractFullContent } from "./content-extract";

type EnrichItemJobData = {
  itemId: string;
};

function extractPlatformMetrics(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const metrics = (raw as Record<string, unknown>)._normalizedEngagement;
  return metrics && typeof metrics === "object" && !Array.isArray(metrics)
    ? (metrics as Record<string, unknown>)
    : {};
}

const log = createLogger("worker:enrich-item");

export async function handleEnrichItem(job: Job<EnrichItemJobData>) {
  const jobLog = log.child({ queue: "enrich-item", jobId: job.id, itemId: job.data.itemId });
  jobLog.debug("job started");
  const item = await getItemById(job.data.itemId);
  if (!item) {
    jobLog.warn("item missing; skip enrich");
    return { ok: false, reason: "item-not-found" };
  }

  const itemLog = jobLog.child({ sourceId: item.sourceId });
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 12_000);
  const extracted = await extractFullContent({
    url: item.url,
    fallbackText: item.contentText,
    signal: ac.signal,
  }).finally(() => clearTimeout(timeout));
  const output = await translateAndTag({
    title: item.title,
    contentText: item.contentText,
    fullContentText: extracted.text,
  });
  const embeddingInput = [item.title ?? "", extracted.text || (item.contentText ?? ""), output.eventSummary ?? ""].join("\n").trim();
  const embedding = await embedText(embeddingInput || item.id);
  const cluster = await assignClusterForEmbedding(embedding, {
    textLength: embeddingInput.length,
    lang: output.lang,
  });

  await upsertItemEnrichment({
    itemId: item.id,
    lang: output.lang,
    titleZh: output.titleZh,
    contentZh: output.contentZh,
    tags: output.tags,
    categoryDomain: output.categoryDomain,
    categoryTopic: output.categoryTopic,
    categoryEntity: output.categoryEntity,
    embedding,
    enrichmentSource: aiMode() === "llm" ? "llm" : "rules",
    enrichmentVersion: aiMode() === "llm" ? "llm-v1" : "rules-v1",
    platformMetrics: extractPlatformMetrics(item.raw),
    fullContentText: extracted.text || undefined,
    contentSummaryZh: output.contentSummaryZh,
    contentExtractSource: extracted.source,
    contentQualityScore: extracted.qualityScore,
    summaryVersion: output.contentSummaryZh ? (aiMode() === "llm" ? "llm-v1" : "rules-v1") : "none",
    llmKeywords: output.llmKeywords,
    eventSummary: output.eventSummary,
    clusterId: cluster.clusterId,
  });

  await updateClusterCentroidAfterItemEnriched(cluster.clusterId, embedding);
  await updateClusterHotspotStats(cluster.clusterId);
  itemLog.info("enrich completed", {
    lang: output.lang,
    tagsCount: output.tags.length,
    categoryDomainCount: output.categoryDomain.length,
    categoryTopicCount: output.categoryTopic.length,
    categoryEntityCount: output.categoryEntity.length,
    clusterId: cluster.clusterId,
    isNewCluster: cluster.isNew,
  });

  await publish("news.events", {
    type: "item.enriched",
    item: {
      id: item.id,
      titleZh: output.titleZh,
      contentZh: output.contentZh,
      contentSummaryZh: output.contentSummaryZh,
      eventSummary: output.eventSummary,
      tags: output.tags,
      categoryDomain: output.categoryDomain,
      categoryTopic: output.categoryTopic,
      categoryEntity: output.categoryEntity,
      categoryMeta: output.categoryMeta,
      lang: output.lang,
      clusterId: cluster.clusterId,
    },
  });

  const clusterRow = await getClusterById(cluster.clusterId);
  if (clusterRow) {
    const distinctSourceCount = await getClusterDistinctSourceCount(cluster.clusterId);
    await publish("news.events", {
      type: "cluster.updated",
      cluster: {
        id: clusterRow.id,
        topic: clusterRow.topic,
        itemCount: clusterRow.itemCount,
        distinctSourceCount,
        lastSeenAt: clusterRow.lastSeenAt?.toISOString() ?? null,
      },
    });
  }

  return { ok: true, tags: output.tags.length, clusterId: cluster.clusterId, isNewCluster: cluster.isNew };
}
