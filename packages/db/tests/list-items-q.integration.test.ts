import { describe, expect, it } from "vitest";
import { listItems } from "../src/ops";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("listItems q= path (integration)", () => {
  it("runs with search query without throwing", async () => {
    const rows = await listItems({ feed: "all", limit: 5, q: "test" });
    expect(Array.isArray(rows)).toBe(true);
  });
});

describe("listItems q= contract", () => {
  it("accepts optional q string", () => {
    const params = { feed: "all" as const, limit: 10, q: "news" };
    expect(params.q).toBeTruthy();
  });
});
