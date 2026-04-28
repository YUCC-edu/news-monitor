import { createHash } from "node:crypto";
import Parser from "rss-parser";
import {
  coerceRssIdField,
  type Connector,
  type ConnectorFetchResult,
  type NormalizedItem,
  type XEngagementMetrics,
} from "@news/connectors-core";

type XRsshubConfig = {
  handle: string;
};

type XRsshubSearchConfig = {
  query: string;
  lang?: string;
  description?: string;
};

type RssItem = {
  guid?: string;
  id?: string;
  link?: string;
  title?: string;
  creator?: string;
  author?: string;
  contentSnippet?: string;
  content?: string;
  summary?: string;
  pubDate?: string;
  isoDate?: string;
  "dc:creator"?: string;
};

type RssFeed = {
  items?: RssItem[];
  image?: { url?: string; link?: string };
};

function parseConfig(config: unknown): XRsshubConfig {
  if (!config || typeof config !== "object") {
    throw new Error("x-rsshub config must be an object");
  }
  const handle = (config as Record<string, unknown>).handle;
  if (typeof handle !== "string" || handle.trim().length === 0) {
    throw new Error("x-rsshub config.handle must be a non-empty string");
  }
  return { handle: handle.trim().replace(/^@/, "") };
}

function parseSearchConfig(config: unknown): XRsshubSearchConfig {
  if (!config || typeof config !== "object") {
    throw new Error("x-rsshub-search config must be an object");
  }
  const query = (config as Record<string, unknown>).query;
  if (typeof query !== "string" || query.trim().length === 0) {
    throw new Error("x-rsshub-search config.query must be a non-empty string");
  }
  const lang = (config as Record<string, unknown>).lang;
  const description = (config as Record<string, unknown>).description;
  return {
    query: query.trim(),
    lang: typeof lang === "string" && lang.trim() ? lang.trim() : undefined,
    description: typeof description === "string" ? description : undefined,
  };
}

function getRsshubBase() {
  const base = process.env.RSSHUB_BASE;
  if (!base) throw new Error("RSSHUB_BASE is not set");
  return base.replace(/\/+$/, "");
}

function hashText(value: string) {
  return createHash("sha1").update(value).digest("hex");
}

function resolveExternalId(item: RssItem) {
  const guid = coerceRssIdField((item as { guid?: unknown }).guid);
  if (guid) return guid;
  const id = coerceRssIdField((item as { id?: unknown }).id);
  if (id) return id;
  if (typeof item.link === "string" && item.link.length > 0) return hashText(item.link);
  if (typeof item.title === "string" && item.title.length > 0) return hashText(item.title);
  return hashText(JSON.stringify(item));
}

function parsePublishedAt(item: RssItem) {
  const raw = item.isoDate ?? item.pubDate;
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function extractMetric(text: string, labels: string[]) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`${escaped}\\s*[:：]?\\s*([\\d,.]+)`, "i"),
      new RegExp(`([\\d,.]+)\\s*${escaped}`, "i"),
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (!match) continue;
      const value = Number.parseInt(match[1].replace(/[^\d]/g, ""), 10);
      if (Number.isFinite(value)) return value;
    }
  }
  return undefined;
}

function extractXEngagement(item: RssItem): XEngagementMetrics | undefined {
  const haystack = [item.title, item.contentSnippet, item.content, item.summary]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
  if (!haystack) return undefined;
  const metrics: XEngagementMetrics = {
    posts: 1,
    replies: extractMetric(haystack, ["Replies", "Reply", "评论", "回复"]),
    reposts: extractMetric(haystack, ["Retweets", "Retweet", "Reposts", "Repost", "转推", "转发"]),
    likes: extractMetric(haystack, ["Likes", "Like", "点赞", "喜欢"]),
    quotes: extractMetric(haystack, ["Quotes", "Quote", "引用"]),
    views: extractMetric(haystack, ["Views", "View", "浏览", "查看"]),
  };
  const hasMeaningfulMetric = Object.entries(metrics).some(
    ([key, value]) => key !== "posts" && typeof value === "number" && value > 0,
  );
  return hasMeaningfulMetric ? metrics : undefined;
}

function toNormalized(item: RssItem): NormalizedItem {
  const engagement = extractXEngagement(item);
  return {
    externalId: resolveExternalId(item),
    url: item.link,
    author: item["dc:creator"] ?? item.creator ?? item.author,
    title: item.title,
    contentText: item.contentSnippet ?? item.content ?? item.summary,
    publishedAt: parsePublishedAt(item),
    engagement: engagement ? { x: engagement } : undefined,
    raw: item,
  };
}

export const xRsshubConnector: Connector = {
  kind: "x-rsshub",
  async validateConfig(config: unknown) {
    parseConfig(config);
  },
  async fetch(ctx): Promise<ConnectorFetchResult> {
    const cfg = parseConfig(ctx.source.config);
    const parser = new Parser();
    const url = `${getRsshubBase()}/twitter/user/${encodeURIComponent(cfg.handle)}`;
    let feed: RssFeed;
    try {
      feed = (await parser.parseURL(url)) as RssFeed;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/429|rate.?limit/i.test(msg)) {
        throw new Error(`x-rsshub [rate_limit] fetch failed (${msg}).`);
      }
      if (/401|403|auth|forbidden/i.test(msg)) {
        throw new Error(`x-rsshub [auth] fetch failed (${msg}).`);
      }
      if (/404|not found/i.test(msg)) {
        throw new Error(`x-rsshub [not_found] route not found; check RSSHUB_BASE path (${msg}).`);
      }
      if (/timeout|aborted/i.test(msg)) {
        throw new Error(`x-rsshub [timeout] fetch timeout (${msg}).`);
      }
      throw new Error(`x-rsshub [network] fetch failed (${msg}).`);
    }
    const avatarUrl =
      typeof feed.image?.url === "string" && feed.image.url.length > 0
        ? feed.image.url
        : undefined;
    return {
      items: (feed.items ?? []).map(toNormalized),
      sourceMeta: avatarUrl ? { avatarUrl } : undefined,
    };
  },
};

export const xRsshubSearchConnector: Connector = {
  kind: "x-rsshub-search",
  async validateConfig(config: unknown) {
    parseSearchConfig(config);
  },
  async fetch(ctx): Promise<ConnectorFetchResult> {
    const cfg = parseSearchConfig(ctx.source.config);
    const parser = new Parser();
    const query = cfg.lang ? `${cfg.query} lang:${cfg.lang}` : cfg.query;
    const url = `${getRsshubBase()}/twitter/search/${encodeURIComponent(query)}`;
    let feed: RssFeed;
    try {
      feed = (await parser.parseURL(url)) as RssFeed;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/429|rate.?limit/i.test(msg)) {
        throw new Error(`x-rsshub-search [rate_limit] fetch failed (${msg}).`);
      }
      if (/401|403|auth|forbidden/i.test(msg)) {
        throw new Error(`x-rsshub-search [auth] fetch failed (${msg}).`);
      }
      if (/404|not found/i.test(msg)) {
        throw new Error(`x-rsshub-search [not_found] route not found; check RSSHUB_BASE path (${msg}).`);
      }
      if (/timeout|aborted/i.test(msg)) {
        throw new Error(`x-rsshub-search [timeout] fetch timeout (${msg}).`);
      }
      throw new Error(`x-rsshub-search [network] fetch failed (${msg}).`);
    }
    const avatarUrl =
      typeof feed.image?.url === "string" && feed.image.url.length > 0
        ? feed.image.url
        : undefined;
    return {
      items: (feed.items ?? []).map(toNormalized),
      sourceMeta: avatarUrl ? { avatarUrl } : undefined,
    };
  },
};
