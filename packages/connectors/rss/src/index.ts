import { createHash } from "node:crypto";
import Parser from "rss-parser";
import { coerceRssIdField, type Connector, type ConnectorFetchResult, type NormalizedItem } from "@news/connectors-core";

type RssConfig = {
  feedUrl: string;
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
};

type RssFeed = {
  items?: RssItem[];
  image?: { url?: string; link?: string };
};

function parseConfig(config: unknown): RssConfig {
  if (!config || typeof config !== "object") {
    throw new Error("RSS config must be an object");
  }
  const feedUrl = (config as Record<string, unknown>).feedUrl;
  if (typeof feedUrl !== "string" || feedUrl.length === 0) {
    throw new Error("RSS config.feedUrl must be a non-empty string");
  }
  return { feedUrl };
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

function toNormalized(item: RssItem): NormalizedItem {
  return {
    externalId: resolveExternalId(item),
    url: item.link,
    author: item.creator ?? item.author,
    title: item.title,
    contentText: item.contentSnippet ?? item.content ?? item.summary,
    publishedAt: parsePublishedAt(item),
    raw: item,
  };
}

export const rssConnector: Connector = {
  kind: "rss",
  async validateConfig(config: unknown) {
    parseConfig(config);
  },
  async fetch(ctx): Promise<ConnectorFetchResult> {
    const cfg = parseConfig(ctx.source.config);
    const parser = new Parser();
    const feed = (await parser.parseURL(cfg.feedUrl)) as RssFeed;
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
