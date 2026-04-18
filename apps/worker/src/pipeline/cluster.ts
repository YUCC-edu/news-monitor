import {
  bumpCluster,
  createCluster,
  findTopClusterCandidatesByCentroid,
  findTopClusterCandidatesByMemberEmbedding,
} from "@news/db";

const DEFAULT_THRESHOLD = 0.86;

function parseEnvFloat(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parseEnvInt(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function neighborSearchOptions() {
  return {
    neighborHours: parseEnvInt("CLUSTER_EMBEDDING_NEIGHBOR_HOURS", 72, 1, 24 * 60),
    memberTopK: parseEnvInt("CLUSTER_EMBEDDING_MEMBER_TOP_K", 8, 1, 50),
    centroidTopK: parseEnvInt("CLUSTER_CENTROID_TOP_K", 5, 1, 50),
  };
}

export async function assignClusterForEmbedding(
  embedding: number[],
  threshold?: number,
) {
  const th =
    threshold != null && Number.isFinite(threshold)
      ? threshold
      : Math.min(0.999, Math.max(0.5, parseEnvFloat("CLUSTER_SIM_THRESHOLD", DEFAULT_THRESHOLD)));
  const opts = neighborSearchOptions();
  const centroidHits = await findTopClusterCandidatesByCentroid(embedding, {
    topK: opts.centroidTopK,
  });
  const memberHits = await findTopClusterCandidatesByMemberEmbedding(embedding, {
    neighborHours: opts.neighborHours,
    topK: opts.memberTopK,
  });
  const merged = new Map<string, number>();
  for (const h of centroidHits) {
    merged.set(h.clusterId, Math.max(merged.get(h.clusterId) ?? 0, h.sim));
  }
  for (const h of memberHits) {
    merged.set(h.clusterId, Math.max(merged.get(h.clusterId) ?? 0, h.sim));
  }
  const sorted = [...merged.entries()].sort((a, b) => b[1] - a[1]);
  for (const [clusterId, sim] of sorted) {
    if (sim >= th) {
      await bumpCluster(clusterId);
      return { clusterId, isNew: false };
    }
  }

  const clusterId = await createCluster();
  if (!clusterId) throw new Error("failed to create cluster");
  await bumpCluster(clusterId);
  return { clusterId, isNew: true };
}
