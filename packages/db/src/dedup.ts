import { createHash } from "node:crypto";

export type SourceKind = "rss" | "hn" | "x-rsshub" | "x-rsshub-search" | "wechat-wewe";

function hashConfig(kind: SourceKind, config: unknown): string {
  const raw = JSON.stringify(config ?? {});
  return createHash("sha256").update(`${kind}:${raw}`).digest("hex").slice(0, 32);
}

/**
 * Canonical deduplication key per kind+config. Always returns a non-empty string.
 */
export function computeDedupKey(kind: SourceKind, config: unknown): string {
  const c = config && typeof config === "object" ? (config as Record<string, unknown>) : {};
  try {
    switch (kind) {
      case "rss": {
        const feedUrl = typeof c.feedUrl === "string" ? c.feedUrl.trim() : "";
        if (!feedUrl) return `rss:${hashConfig(kind, config)}`;
        const u = new URL(feedUrl);
        const path = u.pathname.replace(/\/+$/, "") || "";
        return `${u.protocol}//${u.host}${path}`.toLowerCase();
      }
      case "hn": {
        const q = typeof c.query === "string" ? c.query.trim().toLowerCase() : "";
        const pm =
          typeof c.pointsMin === "number" && Number.isFinite(c.pointsMin)
            ? String(Math.trunc(c.pointsMin))
            : "0";
        return `hn:${q}::${pm}`;
      }
      case "x-rsshub": {
        const h = typeof c.handle === "string" ? c.handle.replace(/^@/, "").trim().toLowerCase() : "";
        if (!h) return `x:${hashConfig(kind, config)}`;
        return `x:${h}`;
      }
      case "x-rsshub-search": {
        const q = typeof c.query === "string" ? c.query.trim().toLowerCase() : "";
        const lang = typeof c.lang === "string" ? c.lang.trim().toLowerCase() : "";
        if (!q) return `x-search:${hashConfig(kind, config)}`;
        return `x-search:${q}${lang ? `:${lang}` : ""}`;
      }
      case "wechat-wewe": {
        const feedUrl = typeof c.feedUrl === "string" ? c.feedUrl : "";
        const mp = /MP_WXS_\w+/.exec(feedUrl);
        if (mp) return `wewe:${mp[0]}`;
        const mpId = typeof c.mpId === "string" ? c.mpId.trim() : "";
        if (mpId) return `wewe:${mpId}`;
        return `wewe:${feedUrl.toLowerCase() || hashConfig(kind, config)}`;
      }
      default:
        return hashConfig(kind, config);
    }
  } catch {
    return hashConfig(kind, config);
  }
}
