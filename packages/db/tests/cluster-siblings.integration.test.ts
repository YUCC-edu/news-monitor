import { describe, expect, it } from "vitest";
import { listClusterSiblingItems, listItems } from "../src/ops";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("listClusterSiblingItems (integration)", () => {
  it("returns an array for a curated cluster row when available", async () => {
    const rows = await listItems({ feed: "curated", limit: 5 });
    const withCluster = rows.find((r) => r.clusterId && (r.relatedCount ?? 0) > 1);
    if (!withCluster?.clusterId) {
      expect(rows).toBeDefined();
      return;
    }
    const sibs = await listClusterSiblingItems({
      clusterId: withCluster.clusterId,
      excludeItemId: withCluster.id,
      limit: 20,
    });
    expect(Array.isArray(sibs)).toBe(true);
    for (const s of sibs) {
      expect(s.itemId).toBeTruthy();
      expect(s.sourceId).toBeTruthy();
      expect(s.platform).toBeTruthy();
      expect(s.sourceName).toBeTruthy();
    }
  });
});
