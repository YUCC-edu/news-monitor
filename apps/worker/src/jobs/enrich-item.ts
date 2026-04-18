import type { Job } from "bullmq";
import { embedText, translateAndTag } from "@news/ai";
import {
  getItemById,
  updateClusterCentroidAfterItemEnriched,
  upsertItemEnrichment,
} from "@news/db";
import { publish } from "../ipc/publish";
import { assignClusterForEmbedding } from "../pipeline/cluster";

type EnrichItemJobData = {
  itemId: string;
};

export async function handleEnrichItem(job: Job<EnrichItemJobData>) {
  const item = await getItemById(job.data.itemId);
  if (!item) return { ok: false, reason: "item-not-found" };

  const output = await translateAndTag({
    title: item.title,
    contentText: item.contentText,
  });
  const embeddingInput = [item.title ?? "", item.contentText ?? ""].join("\n").trim();
  const embedding = await embedText(embeddingInput || item.id);
  const cluster = await assignClusterForEmbedding(embedding);

  await upsertItemEnrichment({
    itemId: item.id,
    lang: output.lang,
    titleZh: output.titleZh,
    contentZh: output.contentZh,
    tags: output.tags,
    embedding,
    clusterId: cluster.clusterId,
  });

  await updateClusterCentroidAfterItemEnriched(cluster.clusterId, embedding);

  await publish("news.events", {
    type: "item.enriched",
    item: {
      id: item.id,
      titleZh: output.titleZh,
      contentZh: output.contentZh,
      tags: output.tags,
      lang: output.lang,
      clusterId: cluster.clusterId,
    },
  });

  return { ok: true, tags: output.tags.length, clusterId: cluster.clusterId, isNewCluster: cluster.isNew };
}
