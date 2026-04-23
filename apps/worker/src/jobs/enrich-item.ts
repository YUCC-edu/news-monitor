import type { Job } from "bullmq";
import { embedText, translateAndTag } from "@news/ai";
import { createLogger } from "@news/shared";
import {
  getClusterById,
  getClusterDistinctSourceCount,
  getItemById,
  updateClusterCentroidAfterItemEnriched,
  upsertItemEnrichment,
} from "@news/db";
import { publish } from "../ipc/publish";
import { assignClusterForEmbedding } from "../pipeline/cluster";

type EnrichItemJobData = {
  itemId: string;
};

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
  const output = await translateAndTag({
    title: item.title,
    contentText: item.contentText,
  });
  const embeddingInput = [item.title ?? "", item.contentText ?? ""].join("\n").trim();
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
    clusterId: cluster.clusterId,
  });

  await updateClusterCentroidAfterItemEnriched(cluster.clusterId, embedding);
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
