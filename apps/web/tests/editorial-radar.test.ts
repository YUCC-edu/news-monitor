import assert from "node:assert/strict";
import test from "node:test";
import {
  mapRepresentativeSources,
  selectEditorialRadar,
  type EditorialOverview,
  type EditorialSiblingRow,
} from "../lib/editorial-radar";

function cluster(overrides: Partial<EditorialOverview["consensusClusters"][number]>) {
  return {
    id: "cluster-a",
    topic: "AI browser agents reshape publishing workflows",
    displayTitle: "AI browser agents reshape publishing workflows",
    itemCount: 12,
    lastSeenAt: "2026-05-05T09:00:00.000Z",
    distinctSources: 4,
    weightedDistinctSources: 3.6,
    sourceNames: "HN / The Verge / X / WeChat",
    itemsWindow: 12,
    recencyScore: 0.8,
    cohesionScore: 0.7,
    consensusScore: 0.9,
    breakingScore: 0.4,
    crossPlatformScore: 0.8,
    burstVelocity: 2.2,
    sourceQualityScore: 0.84,
    whyConsensus: ["4 个来源在同一窗口覆盖"],
    whyBreaking: ["2 小时内明显升温"],
    platforms: ["hn", "rss", "x-rsshub"],
    ...overrides,
  };
}

test("selectEditorialRadar chooses the strongest mixed signal and explains it", () => {
  const overview: EditorialOverview = {
    totals: { items_window: 91, active_sources_window: 8, clusters_window: 11 },
    consensusClusters: [
      cluster({ id: "consensus", consensusScore: 0.95, breakingScore: 0.2, distinctSources: 5 }),
    ],
    breakingClusters: [
      cluster({
        id: "breaking",
        topic: "Open model releases accelerate",
        displayTitle: "Open model releases accelerate",
        consensusScore: 0.5,
        breakingScore: 0.96,
        distinctSources: 3,
        burstVelocity: 3.4,
      }),
    ],
    hotspot: { consensusHotspotIndex: 77, breakingHotspotIndex: 88, attentionIndex: 72 },
  };

  const radar = selectEditorialRadar(overview, "24h");

  assert.equal(radar.isEmpty, false);
  assert.equal(radar.leadSignal?.id, "breaking");
  assert.equal(radar.secondarySignals.length, 1);
  assert.equal(radar.totalJudgment, "今天有 2 个信号值得注意");
  assert.equal(radar.leadSignal?.reasons.length, 3);
  assert.equal(radar.leadSignal?.reasons[0]?.label, "突发");
  assert.match(radar.leadSignal?.editorialTake ?? "", /正在升温/);
});

test("selectEditorialRadar deduplicates clusters that appear in consensus and breaking lists", () => {
  const same = cluster({ id: "same", consensusScore: 0.88, breakingScore: 0.92 });
  const overview: EditorialOverview = {
    totals: { items_window: 20, active_sources_window: 4, clusters_window: 2 },
    consensusClusters: [same],
    breakingClusters: [{ ...same, sourceNames: "HN / X" }],
    hotspot: {},
  };

  const radar = selectEditorialRadar(overview, "7d");

  assert.equal(radar.leadSignal?.id, "same");
  assert.equal(radar.secondarySignals.length, 0);
});

test("selectEditorialRadar returns a quiet empty state when no cluster exists", () => {
  const radar = selectEditorialRadar(
    {
      totals: { items_window: 0, active_sources_window: 0, clusters_window: 0 },
      consensusClusters: [],
      breakingClusters: [],
      hotspot: {},
    },
    "24h",
  );

  assert.equal(radar.isEmpty, true);
  assert.equal(radar.leadSignal, null);
  assert.equal(radar.totalJudgment, "今天还没有形成明确主信号");
});

test("mapRepresentativeSources keeps source names, titles, and links for the drawer", () => {
  const rows: EditorialSiblingRow[] = [
    {
      itemId: "item-1",
      title: "Original title",
      titleZh: "中文标题",
      url: "https://example.com/a",
      sourceId: "source-1",
      sourceName: "Example",
      platform: "rss",
      sourceConfig: null,
    },
  ];

  assert.deepEqual(mapRepresentativeSources(rows), [
    {
      id: "item-1",
      sourceName: "Example",
      platform: "rss",
      title: "中文标题",
      url: "https://example.com/a",
      sourceConfig: null,
    },
  ]);
});
