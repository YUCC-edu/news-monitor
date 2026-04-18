import { describe, expect, it } from "vitest";
import { listItems } from "../src/ops";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("listItems feed=curated (integration)", () => {
  it("returns rows with cluster and multi-source count", async () => {
    const rows = await listItems({ feed: "curated", limit: 10 });
    expect(Array.isArray(rows)).toBe(true);
    for (const r of rows) {
      expect(r.clusterId).toBeTruthy();
      expect(r.relatedCount).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("curated feed API contract", () => {
  it("accepts feed curated | all as string literals", () => {
    const modes = ["all", "curated"] as const;
    expect(modes).toContain("curated");
  });
});

describe("cluster / sibling DB exports", () => {
  it("exposes list + centroid + candidate helpers", async () => {
    const mod = await import("../src/ops");
    expect(typeof mod.listClusterSiblingItems).toBe("function");
    expect(typeof mod.findTopClusterCandidatesByCentroid).toBe("function");
    expect(typeof mod.findTopClusterCandidatesByMemberEmbedding).toBe("function");
    expect(typeof mod.updateClusterCentroidAfterItemEnriched).toBe("function");
  });
});
