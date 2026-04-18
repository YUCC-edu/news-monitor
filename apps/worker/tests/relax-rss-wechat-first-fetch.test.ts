import { describe, expect, it } from "vitest";
import type { NormalizedItem } from "@news/connectors-core";
import { filterItemsWithFirstFetchRelaxation } from "../src/jobs/relax-rss-wechat-first-fetch";

function item(publishedAtIso: string): NormalizedItem {
  return { externalId: publishedAtIso, publishedAt: new Date(publishedAtIso), raw: {} };
}

describe("filterItemsWithFirstFetchRelaxation", () => {
  const now = new Date("2026-01-15T12:00:00.000Z");

  it("widens wechat first fetch from 1d to 7d when all items would be dropped", () => {
    const items = [item("2026-01-10T10:00:00.000Z")];
    const out = filterItemsWithFirstFetchRelaxation({
      kind: "wechat-wewe",
      lastOkAt: null,
      initialFetchDays: 1,
      maxItemAgeDays: null,
      firstFetchMaxAgeDaysDefault: 1,
      items,
      now,
    });
    expect(out).toHaveLength(1);
  });

  it("does not widen when lastOkAt is set", () => {
    const items = [item("2026-01-10T10:00:00.000Z")];
    const out = filterItemsWithFirstFetchRelaxation({
      kind: "wechat-wewe",
      lastOkAt: new Date("2026-01-15T10:00:00.000Z"),
      initialFetchDays: 1,
      maxItemAgeDays: null,
      firstFetchMaxAgeDaysDefault: 1,
      items,
      now,
    });
    expect(out).toHaveLength(0);
  });

  it("does not widen when user already configured >= 7 days", () => {
    const items = [item("2026-01-01T10:00:00.000Z")];
    const out = filterItemsWithFirstFetchRelaxation({
      kind: "wechat-wewe",
      lastOkAt: null,
      initialFetchDays: 7,
      maxItemAgeDays: null,
      firstFetchMaxAgeDaysDefault: 1,
      items,
      now,
    });
    expect(out).toHaveLength(0);
  });

  it("applies same relaxation for rss", () => {
    const items = [item("2026-01-10T10:00:00.000Z")];
    const out = filterItemsWithFirstFetchRelaxation({
      kind: "rss",
      lastOkAt: null,
      initialFetchDays: null,
      maxItemAgeDays: null,
      firstFetchMaxAgeDaysDefault: 1,
      items,
      now,
    });
    expect(out).toHaveLength(1);
  });
});
