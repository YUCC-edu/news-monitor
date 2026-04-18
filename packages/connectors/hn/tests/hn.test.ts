import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { hnConnector } from "../src";

describe("hnConnector", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps objectID to externalId and parses publishedAt", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        hits: [
          {
            objectID: "123",
            title: "Hello HN",
            author: "pg",
            url: "https://example.com/post",
            created_at: "2026-04-17T10:00:00.000Z",
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { items } = await hnConnector.fetch({
      source: { id: "s1", config: {} },
      now: new Date("2026-04-17T10:10:00.000Z"),
      signal: new AbortController().signal,
    });

    expect(items).toHaveLength(1);
    expect(items[0].externalId).toBe("123");
    expect(items[0].publishedAt?.toISOString()).toBe("2026-04-17T10:00:00.000Z");
  });

  it("adds query and numericFilters from config and lastOkAt", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hits: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await hnConnector.fetch({
      source: {
        id: "s1",
        config: { query: "agent", pointsMin: 100 },
        lastOkAt: new Date("2026-04-17T09:00:00.000Z"),
      },
      now: new Date("2026-04-17T10:10:00.000Z"),
      signal: new AbortController().signal,
    });

    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("query=agent");
    expect(calledUrl).toContain("numericFilters=points%3E%3D100%2Ccreated_at_i%3E");
  });
});
