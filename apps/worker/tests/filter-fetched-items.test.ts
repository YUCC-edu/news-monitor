import { describe, expect, it } from "vitest";
import type { NormalizedItem } from "@news/connectors-core";
import { filterFetchedItems } from "../src/jobs/filter-fetched-items";

function item(publishedAtIso: string): NormalizedItem {
  return {
    externalId: publishedAtIso,
    publishedAt: new Date(publishedAtIso),
    raw: {},
  };
}

describe("filterFetchedItems", () => {
  const now = new Date("2026-01-15T12:00:00.000Z");
  const defaultInit = 3;

  it("wechat-wewe: ignores watermark; uses firstThresh from initialFetchDays", () => {
    const lastOkAt = new Date("2026-01-15T11:00:00.000Z");
    const items = [
      item("2026-01-14T10:00:00.000Z"),
      item("2026-01-10T10:00:00.000Z"),
    ];
    const out = filterFetchedItems({
      kind: "wechat-wewe",
      lastOkAt,
      initialFetchDays: 3,
      maxItemAgeDays: null,
      firstFetchMaxAgeDaysDefault: defaultInit,
      items,
      now,
      maxPublishedAtWatermark: new Date("2026-01-15T11:00:00.000Z"),
    });
    expect(out.map((x) => x.externalId)).toEqual(["2026-01-14T10:00:00.000Z"]);
  });

  it("rss: same as wechat — watermark ignored", () => {
    const lastOkAt = new Date("2026-01-15T11:00:00.000Z");
    const items = [item("2026-01-14T08:00:00.000Z"), item("2026-01-09T08:00:00.000Z")];
    const out = filterFetchedItems({
      kind: "rss",
      lastOkAt,
      initialFetchDays: 3,
      maxItemAgeDays: null,
      firstFetchMaxAgeDaysDefault: defaultInit,
      items,
      now,
      maxPublishedAtWatermark: new Date("2026-01-15T10:00:00.000Z"),
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.publishedAt!.toISOString()).toBe("2026-01-14T08:00:00.000Z");
  });

  it("x-rsshub: incremental lower bound from maxPublishedAtWatermark minus slack", () => {
    const watermark = new Date("2026-01-15T10:50:00.000Z");
    const items = [
      item("2026-01-15T11:30:00.000Z"),
      item("2026-01-15T10:00:00.000Z"),
    ];
    const out = filterFetchedItems({
      kind: "x-rsshub",
      lastOkAt: new Date("2026-01-15T11:00:00.000Z"),
      initialFetchDays: 3,
      maxItemAgeDays: null,
      firstFetchMaxAgeDaysDefault: defaultInit,
      items,
      now,
      maxPublishedAtWatermark: watermark,
      incrementalSlackMs: 5 * 60 * 1000,
    });
    expect(out.map((x) => x.externalId)).toEqual(["2026-01-15T11:30:00.000Z"]);
  });

  it("hn: same watermark rule as x-rsshub", () => {
    const watermark = new Date("2026-01-15T10:50:00.000Z");
    const items = [item("2026-01-15T10:55:00.000Z"), item("2026-01-15T10:40:00.000Z")];
    const out = filterFetchedItems({
      kind: "hn",
      lastOkAt: new Date("2026-01-15T11:00:00.000Z"),
      initialFetchDays: 3,
      maxItemAgeDays: null,
      firstFetchMaxAgeDaysDefault: defaultInit,
      items,
      now,
      maxPublishedAtWatermark: watermark,
      incrementalSlackMs: 5 * 60 * 1000,
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.publishedAt!.toISOString()).toBe("2026-01-15T10:55:00.000Z");
  });

  it("x-rsshub: tweet newer than DB watermark kept even if wall lastOkAt is much later", () => {
    const watermark = new Date("2026-01-15T09:00:00.000Z");
    const items = [item("2026-01-15T10:30:00.000Z")];
    const out = filterFetchedItems({
      kind: "x-rsshub",
      lastOkAt: new Date("2026-01-15T12:00:00.000Z"),
      initialFetchDays: 3,
      maxItemAgeDays: null,
      firstFetchMaxAgeDaysDefault: defaultInit,
      items,
      now,
      maxPublishedAtWatermark: watermark,
      incrementalSlackMs: 5 * 60 * 1000,
    });
    expect(out).toHaveLength(1);
  });

  it("x-rsshub: no watermark uses firstThresh only (first fetch path)", () => {
    const items = [
      item("2026-01-15T11:30:00.000Z"),
      item("2026-01-15T10:00:00.000Z"),
    ];
    const out = filterFetchedItems({
      kind: "x-rsshub",
      lastOkAt: new Date("2026-01-15T11:00:00.000Z"),
      initialFetchDays: 3,
      maxItemAgeDays: null,
      firstFetchMaxAgeDaysDefault: defaultInit,
      items,
      now,
    });
    expect(out.map((x) => x.externalId)).toEqual([
      "2026-01-15T11:30:00.000Z",
      "2026-01-15T10:00:00.000Z",
    ]);
  });

  it("applies maxItemAgeDays for wechat-wewe", () => {
    const items = [item("2026-01-10T12:00:00.000Z"), item("2026-01-06T12:00:00.000Z")];
    const out = filterFetchedItems({
      kind: "wechat-wewe",
      lastOkAt: null,
      initialFetchDays: 30,
      maxItemAgeDays: 7,
      firstFetchMaxAgeDaysDefault: defaultInit,
      items,
      now,
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.publishedAt!.toISOString()).toBe("2026-01-10T12:00:00.000Z");
  });

  it("keeps items without publishedAt", () => {
    const items: NormalizedItem[] = [
      { externalId: "a", publishedAt: undefined, raw: {} },
      item("2026-01-14T10:00:00.000Z"),
    ];
    const out = filterFetchedItems({
      kind: "wechat-wewe",
      lastOkAt: new Date("2026-01-15T11:00:00.000Z"),
      initialFetchDays: 3,
      maxItemAgeDays: null,
      firstFetchMaxAgeDaysDefault: defaultInit,
      items,
      now,
    });
    expect(out.some((x) => x.externalId === "a")).toBe(true);
  });
});
