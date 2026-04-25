import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTimelineBlocks,
  type TimelineItemRecord,
} from "../lib/timeline-blocks";

function makeItem(overrides: Partial<TimelineItemRecord> & Pick<TimelineItemRecord, "id" | "sourceId" | "sourceName">): TimelineItemRecord {
  return {
    id: overrides.id,
    sourceId: overrides.sourceId,
    sourceName: overrides.sourceName,
    platform: overrides.platform ?? "rss",
    sourceConfig: overrides.sourceConfig ?? { feedUrl: "https://example.com/feed.xml" },
    title: overrides.title ?? overrides.id,
    url: overrides.url ?? `https://example.com/${overrides.id}`,
    author: overrides.author ?? null,
    contentText: overrides.contentText ?? null,
    titleZh: overrides.titleZh ?? null,
    contentZh: overrides.contentZh ?? null,
    tags: overrides.tags ?? null,
    clusterId: overrides.clusterId ?? null,
    clusterTopic: overrides.clusterTopic ?? null,
    relatedCount: overrides.relatedCount ?? null,
    relatedSourceCount: overrides.relatedSourceCount ?? null,
    clusterItemCount: overrides.clusterItemCount ?? null,
    publishedAt: overrides.publishedAt ?? null,
    fetchedAt: overrides.fetchedAt ?? "2026-04-24T08:00:00.000Z",
    whySelected: overrides.whySelected,
  };
}

test("buildTimelineBlocks collapses a high-volume source inside the same window", () => {
  const items = [
    makeItem({ id: "a1", sourceId: "arxiv", sourceName: "arXiv cs.LG", publishedAt: "2026-04-24T11:30:00.000Z" }),
    makeItem({ id: "a2", sourceId: "arxiv", sourceName: "arXiv cs.LG", publishedAt: "2026-04-24T11:00:00.000Z" }),
    makeItem({ id: "b1", sourceId: "reuters", sourceName: "Reuters", publishedAt: "2026-04-24T10:45:00.000Z" }),
    makeItem({ id: "a3", sourceId: "arxiv", sourceName: "arXiv cs.LG", publishedAt: "2026-04-24T10:30:00.000Z" }),
    makeItem({ id: "a4", sourceId: "arxiv", sourceName: "arXiv cs.LG", publishedAt: "2026-04-24T10:00:00.000Z" }),
    makeItem({ id: "a5", sourceId: "arxiv", sourceName: "arXiv cs.LG", publishedAt: "2026-04-24T09:30:00.000Z" }),
  ];

  const blocks = buildTimelineBlocks(items, {
    collapseWindowHours: 12,
    collapseThreshold: 4,
  });

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]?.type, "collapsed-source-group");
  assert.equal(blocks[1]?.type, "item");
  if (blocks[0]?.type !== "collapsed-source-group") {
    throw new Error("expected first block to be collapsed");
  }
  assert.equal(blocks[0].sourceName, "arXiv cs.LG");
  assert.equal(blocks[0].itemCount, 5);
  assert.equal(blocks[0].latestItem.id, "a1");
  assert.deepEqual(
    blocks[0].items.map((item) => item.id),
    ["a1", "a2", "a3", "a4", "a5"],
  );
});

test("buildTimelineBlocks keeps smaller source bursts expanded", () => {
  const items = [
    makeItem({ id: "r1", sourceId: "reuters", sourceName: "Reuters", publishedAt: "2026-04-24T11:30:00.000Z" }),
    makeItem({ id: "r2", sourceId: "reuters", sourceName: "Reuters", publishedAt: "2026-04-24T11:00:00.000Z" }),
    makeItem({ id: "r3", sourceId: "reuters", sourceName: "Reuters", publishedAt: "2026-04-24T10:30:00.000Z" }),
  ];

  const blocks = buildTimelineBlocks(items, {
    collapseWindowHours: 12,
    collapseThreshold: 4,
  });

  assert.equal(blocks.length, 3);
  assert.ok(blocks.every((block) => block.type === "item"));
});

test("buildTimelineBlocks separates the same source across different windows", () => {
  const items = [
    makeItem({ id: "a1", sourceId: "arxiv", sourceName: "arXiv cs.LG", publishedAt: "2026-04-24T13:30:00.000Z" }),
    makeItem({ id: "a2", sourceId: "arxiv", sourceName: "arXiv cs.LG", publishedAt: "2026-04-24T12:30:00.000Z" }),
    makeItem({ id: "a3", sourceId: "arxiv", sourceName: "arXiv cs.LG", publishedAt: "2026-04-24T11:30:00.000Z" }),
    makeItem({ id: "a4", sourceId: "arxiv", sourceName: "arXiv cs.LG", publishedAt: "2026-04-23T11:30:00.000Z" }),
    makeItem({ id: "a5", sourceId: "arxiv", sourceName: "arXiv cs.LG", publishedAt: "2026-04-23T11:00:00.000Z" }),
    makeItem({ id: "a6", sourceId: "arxiv", sourceName: "arXiv cs.LG", publishedAt: "2026-04-23T10:30:00.000Z" }),
  ];

  const blocks = buildTimelineBlocks(items, {
    collapseWindowHours: 12,
    collapseThreshold: 4,
  });

  assert.equal(blocks.length, 6);
  assert.ok(blocks.every((block) => block.type === "item"));
});
