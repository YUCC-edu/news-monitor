import { afterEach, describe, expect, it, vi } from "vitest";
import { wechatWeweConnector } from "../src/index";

describe("wechat-wewe connector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("accepts feedUrl config", async () => {
    await expect(
      wechatWeweConnector.validateConfig({ feedUrl: "http://wewe/feeds/abc.atom" }),
    ).resolves.toBeUndefined();
  });

  it("accepts mpId config", async () => {
    await expect(
      wechatWeweConnector.validateConfig({ mpId: "MP_WXS_foobar" }),
    ).resolves.toBeUndefined();
  });

  it("rejects empty config", async () => {
    await expect(wechatWeweConnector.validateConfig({})).rejects.toThrow();
  });

  it("rejects non-object", async () => {
    await expect(wechatWeweConnector.validateConfig(null)).rejects.toThrow();
  });

  it("rejects HTML responses with an explanation (dash SPA vs feeds API)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("<!DOCTYPE html><html><body>dash</body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
      ),
    );
    await expect(
      wechatWeweConnector.fetch({
        source: {
          id: "s-html",
          config: { feedUrl: "http://127.0.0.1:4000/feeds/MP_WXS_1.atom" },
          lastOkAt: null,
        },
        now: new Date(),
        signal: AbortSignal.timeout(10_000),
      }),
    ).rejects.toThrow(/网页 HTML/);
  });

  it("calls fetch with /feeds/… .atom when config has /dash/feeds/ URL", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>x</title></feed>`,
        { status: 200, headers: { "Content-Type": "application/atom+xml" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await wechatWeweConnector.fetch({
      source: {
        id: "s-dash",
        config: { feedUrl: "http://127.0.0.1:4000/dash/feeds/MP_WXS_3096883945" },
        lastOkAt: null,
      },
      now: new Date(),
      signal: AbortSignal.timeout(10_000),
    });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toMatch(/^http:\/\/127\.0\.0\.1:4000\/feeds\/MP_WXS_3096883945\.atom(\?|$)/);
    expect(call[1]).toMatchObject({ signal: expect.any(AbortSignal) });
  });

  it("fetches and parses lax Atom (unquoted decl + link attrs)", async () => {
    const xml = `<?xml version=1.0 encoding=UTF-8 standalone=yes?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>T</title>
  <entry>
    <id>urn:ex:1</id>
    <title>Hello</title>
    <updated>2024-06-01T12:00:00.000Z</updated>
    <link href="https://example.com/a" rel=alternate type=application/atom+xml/>
  </entry>
</feed>`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(xml, { status: 200, headers: { "Content-Type": "application/atom+xml" } })),
    );
    const result = await wechatWeweConnector.fetch({
      source: {
        id: "s1",
        config: { feedUrl: "http://wewe/feeds/x.atom" },
        lastOkAt: null,
      },
      now: new Date(),
      signal: AbortSignal.timeout(10_000),
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.title).toBe("Hello");
  });

  it("parses Atom after aggressive heal when entry has unquoted date attribute", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry updated=2024-06-01T12:00:00.000Z>
    <id>urn:x:1</id>
    <title>Second pass</title>
  </entry>
</feed>`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(xml, { status: 200, headers: { "Content-Type": "application/atom+xml" } })),
    );
    const result = await wechatWeweConnector.fetch({
      source: {
        id: "s2",
        config: { feedUrl: "http://wewe/feeds/y.atom" },
        lastOkAt: null,
      },
      now: new Date(),
      signal: AbortSignal.timeout(10_000),
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.title).toBe("Second pass");
  });
});
