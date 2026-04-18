import { describe, expect, it } from "vitest";
import { normalizeWeWeFeedUrl } from "../src/normalize-feed-url";

describe("normalizeWeWeFeedUrl", () => {
  it("rewrites /dash/feeds/MP_* to /feeds/MP_*.atom", () => {
    expect(normalizeWeWeFeedUrl("http://127.0.0.1:4000/dash/feeds/MP_WXS_3096883945")).toBe(
      "http://127.0.0.1:4000/feeds/MP_WXS_3096883945.atom",
    );
  });

  it("rewrites dash path with existing .atom", () => {
    expect(normalizeWeWeFeedUrl("http://127.0.0.1:4000/dash/feeds/MP_WXS_1.atom")).toBe(
      "http://127.0.0.1:4000/feeds/MP_WXS_1.atom",
    );
  });

  it("appends .atom to bare /feeds/MP_*", () => {
    expect(normalizeWeWeFeedUrl("http://127.0.0.1:4000/feeds/MP_WXS_3096883945")).toBe(
      "http://127.0.0.1:4000/feeds/MP_WXS_3096883945.atom",
    );
  });

  it("preserves query (e.g. code=)", () => {
    expect(
      normalizeWeWeFeedUrl("http://127.0.0.1:4000/dash/feeds/MP_WXS_1?code=abc%26"),
    ).toBe("http://127.0.0.1:4000/feeds/MP_WXS_1.atom?code=abc%26");
  });

  it("leaves unrelated URLs unchanged", () => {
    const u = "https://example.com/rss.xml";
    expect(normalizeWeWeFeedUrl(u)).toBe(u);
  });
});
