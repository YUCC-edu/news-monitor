export type TimelineRange = "24h" | "72h" | "7d" | "30d";

export type EditorialCluster = {
  id: string;
  topic: string;
  displayTitle: string;
  itemCount: number;
  lastSeenAt: string;
  distinctSources: number;
  weightedDistinctSources: number;
  sourceNames: string;
  itemsWindow: number;
  recencyScore: number;
  cohesionScore: number;
  consensusScore: number;
  breakingScore: number;
  crossPlatformScore: number;
  burstVelocity: number;
  sourceQualityScore: number;
  whyConsensus: string[];
  whyBreaking: string[];
  platforms: string[];
};

export type EditorialOverview = {
  totals: {
    items_window: number;
    active_sources_window: number;
    clusters_window: number;
  };
  consensusClusters: EditorialCluster[];
  breakingClusters: EditorialCluster[];
  hotspot: {
    consensusHotspotIndex?: number;
    breakingHotspotIndex?: number;
    attentionIndex?: number;
  };
};

export type EditorialSignalReason = {
  label: string;
  text: string;
};

export type EditorialSignal = EditorialCluster & {
  score: number;
  range: TimelineRange;
  reasons: EditorialSignalReason[];
  editorialTake: string;
};

export type EditorialRadar = {
  isEmpty: boolean;
  totalJudgment: string;
  leadSignal: EditorialSignal | null;
  secondarySignals: EditorialSignal[];
};

export type EditorialSiblingRow = {
  itemId: string;
  title: string;
  titleZh: string | null;
  url: string;
  sourceId: string;
  sourceName: string;
  platform: string;
  sourceConfig: unknown;
};

export type EditorialRepresentativeSource = {
  id: string;
  sourceName: string;
  platform: string;
  title: string;
  url: string;
  sourceConfig: unknown;
};

function mergeCandidates(overview: EditorialOverview) {
  const candidates = new Map<string, EditorialCluster>();
  for (const cluster of [...overview.consensusClusters, ...overview.breakingClusters]) {
    candidates.set(cluster.id, { ...candidates.get(cluster.id), ...cluster });
  }
  return [...candidates.values()];
}

function scoreCluster(cluster: EditorialCluster) {
  const sourceLift = Math.min(cluster.distinctSources, 6) * 0.015;
  return (
    cluster.breakingScore * 0.4 +
    cluster.consensusScore * 0.3 +
    cluster.sourceQualityScore * 0.15 +
    cluster.crossPlatformScore * 0.1 +
    sourceLift
  );
}

function buildReasons(cluster: EditorialCluster): EditorialSignalReason[] {
  if (cluster.breakingScore >= cluster.consensusScore) {
    return [
      { label: "突发", text: cluster.whyBreaking[0] ?? `突发强度 ${Math.round(cluster.breakingScore * 100)}` },
      { label: "共识", text: cluster.whyConsensus[0] ?? `${cluster.distinctSources} 个来源正在跟进` },
      { label: "来源", text: cluster.sourceNames },
    ];
  }

  return [
    { label: "共识", text: cluster.whyConsensus[0] ?? `${cluster.distinctSources} 个来源形成覆盖` },
    { label: "质量", text: `来源质量 ${Math.round(cluster.sourceQualityScore * 100)}` },
    { label: "平台", text: cluster.sourceNames },
  ];
}

function buildEditorialTake(cluster: EditorialCluster) {
  if (cluster.breakingScore >= 0.75) {
    return `${cluster.displayTitle} 正在升温，适合作为主信号持续跟进。`;
  }
  if (cluster.consensusScore >= 0.75) {
    return `${cluster.displayTitle} 已形成跨来源共识，适合进入今日重点观察。`;
  }
  return `${cluster.displayTitle} 有一定关注度，建议保留观察。`;
}

export function selectEditorialRadar(
  overview: EditorialOverview,
  range: TimelineRange,
): EditorialRadar {
  const signals = mergeCandidates(overview)
    .map((cluster) => ({
      ...cluster,
      score: scoreCluster(cluster),
      range,
      reasons: buildReasons(cluster),
      editorialTake: buildEditorialTake(cluster),
    }))
    .sort((a, b) => b.score - a.score);

  if (signals.length === 0) {
    return {
      isEmpty: true,
      totalJudgment: "今天还没有形成明确主信号",
      leadSignal: null,
      secondarySignals: [],
    };
  }

  return {
    isEmpty: false,
    totalJudgment: `今天有 ${signals.length} 个信号值得注意`,
    leadSignal: signals[0] ?? null,
    secondarySignals: signals.slice(1, 5),
  };
}

export function mapRepresentativeSources(
  rows: EditorialSiblingRow[],
): EditorialRepresentativeSource[] {
  return rows.slice(0, 6).map((row) => ({
    id: row.itemId,
    sourceName: row.sourceName,
    platform: row.platform,
    title: row.titleZh || row.title,
    url: row.url,
    sourceConfig: row.sourceConfig,
  }));
}
