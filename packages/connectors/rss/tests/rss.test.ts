import { beforeEach, describe, expect, it, vi } from "vitest";

const parseURLMock = vi.fn();

vi.mock("rss-parser", () => {
  return {
    default: class ParserMock {
      parseURL = parseURLMock;
    },
  };
});

describe("rssConnector", () => {
  beforeEach(() => {
    parseURLMock.mockReset();
  });

  it("prefers guid as externalId and parses pubDate", async () => {
    parseURLMock.mockResolvedValue({
      items: [
        {
          guid: "post-1",
          title: "Post 1",
          pubDate: "Fri, 17 Apr 2026 10:00:00 GMT",
          link: "https://example.com/1",
        },
      ],
    });

    const { rssConnector } = await import("../src/index");
    const { items } = await rssConnector.fetch({
      source: { id: "s1", config: { feedUrl: "https://example.com/feed.xml" } },
      now: new Date("2026-04-17T10:10:00.000Z"),
      signal: new AbortController().signal,
    });

    expect(items).toHaveLength(1);
    expect(items[0].externalId).toBe("post-1");
    expect(items[0].publishedAt?.toISOString()).toBe("2026-04-17T10:00:00.000Z");
  });

  it("falls back to link hash when guid is missing", async () => {
    parseURLMock.mockResolvedValue({
      items: [
        {
          title: "Post without guid",
          link: "https://example.com/no-guid",
          isoDate: "2026-04-17T10:00:00.000Z",
        },
      ],
    });

    const { rssConnector } = await import("../src/index");
    const { items } = await rssConnector.fetch({
      source: { id: "s1", config: { feedUrl: "https://example.com/feed.xml" } },
      now: new Date("2026-04-17T10:10:00.000Z"),
      signal: new AbortController().signal,
    });

    expect(items).toHaveLength(1);
    expect(items[0].externalId).toHaveLength(40);
    expect(items[0].externalId).toMatch(/^[a-f0-9]+$/);
  });
});
