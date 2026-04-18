import { beforeEach, describe, expect, it, vi } from "vitest";

const parseURLMock = vi.fn();

vi.mock("rss-parser", () => {
  return {
    default: class ParserMock {
      parseURL = parseURLMock;
    },
  };
});

describe("xRsshubConnector", () => {
  beforeEach(() => {
    parseURLMock.mockReset();
    process.env.RSSHUB_BASE = "http://127.0.0.1:1200";
  });

  it("builds RSSHub twitter user url from handle", async () => {
    parseURLMock.mockResolvedValue({ items: [] });
    const { xRsshubConnector } = await import("../src/index");

    await xRsshubConnector.fetch({
      source: { id: "s1", config: { handle: "OpenAI" } },
      now: new Date(),
      signal: new AbortController().signal,
    });

    expect(parseURLMock).toHaveBeenCalledWith("http://127.0.0.1:1200/twitter/user/OpenAI");
  });

  it("maps dc:creator as author and keeps title/content", async () => {
    parseURLMock.mockResolvedValue({
      items: [
        {
          guid: "tw1",
          title: "tweet title",
          contentSnippet: "tweet body",
          "dc:creator": "OpenAI",
          pubDate: "Fri, 17 Apr 2026 09:00:00 GMT",
          link: "https://x.com/OpenAI/status/1",
        },
      ],
    });
    const { xRsshubConnector } = await import("../src/index");
    const { items } = await xRsshubConnector.fetch({
      source: { id: "s1", config: { handle: "@OpenAI" } },
      now: new Date(),
      signal: new AbortController().signal,
    });

    expect(items).toHaveLength(1);
    expect(items[0].author).toBe("OpenAI");
    expect(items[0].externalId).toBe("tw1");
    expect(items[0].title).toBe("tweet title");
  });
});
