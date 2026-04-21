import { createHash } from "node:crypto";
import Parser from "rss-parser";
import { coerceRssIdField, type Connector, type ConnectorFetchResult, type NormalizedItem } from "@news/connectors-core";
import { normalizeWeWeFeedUrl } from "./normalize-feed-url";
import { sanitizeAtomXmlAggressive, sanitizeAtomXmlRaw } from "./sanitize-atom-xml";

type WeWeConfig = {
  feedUrl?: string;
  mpId?: string;
  accountName?: string;
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

function parseConfig(config: unknown): WeWeConfig {
  if (!config || typeof config !== "object") {
    throw new Error("wechat-wewe config must be an object");
  }
  const c = config as Record<string, unknown>;
  const feedUrl = typeof c.feedUrl === "string" ? c.feedUrl.trim() : "";
  const mpId = typeof c.mpId === "string" ? c.mpId.trim() : "";
  const accountName = typeof c.accountName === "string" ? c.accountName : undefined;
  if (!feedUrl && !mpId) {
    throw new Error("wechat-wewe config requires feedUrl or mpId");
  }
  return { feedUrl: feedUrl || undefined, mpId: mpId || undefined, accountName };
}

function getWeWeBase() {
  const base = process.env.WEWE_RSS_BASE;
  if (!base) throw new Error("WEWE_RSS_BASE is not set");
  return base.replace(/\/+$/, "");
}

function sanitizeWeWeAuthCode(raw: string | undefined) {
  if (!raw) return "";
  return raw.replace(/\uFEFF/g, "").replace(/[^\x20-\x7E]/g, "").trim();
}

function buildFeedUrl(cfg: WeWeConfig) {
  const authCode = sanitizeWeWeAuthCode(process.env.WEWE_RSS_AUTH_CODE);
  let base: string;
  if (cfg.feedUrl) {
    base = normalizeWeWeFeedUrl(cfg.feedUrl);
  } else {
    base = `${getWeWeBase()}/feeds/${cfg.mpId}.atom`;
  }
  if (!authCode) return base;
  const sep = base.includes("?") ? "&" : "?";
  if (/[?&]code=/.test(base)) return base;
  return `${base}${sep}code=${encodeURIComponent(authCode)}`;
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

function toNormalized(item: RssItem, accountName?: string): NormalizedItem {
  return {
    externalId: resolveExternalId(item),
    url: item.link,
    author: accountName ?? item["dc:creator"] ?? item.creator ?? item.author,
    title: item.title,
    contentText: item.contentSnippet ?? item.content ?? item.summary,
    publishedAt: parsePublishedAt(item),
    raw: item,
  };
}

export const wechatWeweConnector: Connector = {
  kind: "wechat-wewe",
  async validateConfig(config: unknown) {
    parseConfig(config);
  },
  async fetch(ctx): Promise<ConnectorFetchResult> {
    const cfg = parseConfig(ctx.source.config);
    const url = buildFeedUrl(cfg);
    let res: Response;
    try {
      res = await fetch(url, {
        signal: ctx.signal,
        headers: {
          "User-Agent": "news-monitor/1.0",
          Accept:
            "application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
      });
    } catch (e) {
      const cause = e instanceof Error ? e.message : String(e);
      const loopbackHint =
        /\b127\.0\.0\.1\b/.test(url) || /\blocalhost\b/i.test(url)
          ? " Worker 若在 Docker/另一台机器上，URL 里的 127.0.0.1/localhost 会指向该环境自身，请改为对 Worker 可达的地址（如 host.docker.internal、宿主机 IP，或 compose 网络内服务名 wewe-rss:4000）。"
          : "";
      const cat = /timeout|aborted/i.test(cause) ? "timeout" : "network";
      throw new Error(`wechat-wewe [${cat}] 无法请求 Feed（${cause}）。${loopbackHint}`);
    }
    if (!res.ok) {
      const authHint =
        res.status === 401 || res.status === 403
          ? " 请核对仓库根目录 .env 的 WEWE_RSS_AUTH_CODE 与 WeWe-RSS 的 AUTH_CODE 一致；Worker（pnpm --filter @news/worker dev）只加载该 .env，不会读取 apps/web/.env.local。"
          : "";
      const cat =
        res.status === 401 || res.status === 403
          ? "auth"
          : res.status === 429
            ? "rate_limit"
            : res.status === 404
              ? "not_found"
              : res.status >= 500
                ? "upstream"
                : "unknown";
      throw new Error(`wechat-wewe [${cat}] feed HTTP ${res.status}${authHint}`);
    }
    let rawXml = await res.text();
    let ct = res.headers.get("content-type") || "";
    let head = rawXml.trimStart().slice(0, 400).toLowerCase();
    let looksHtml =
      /\btext\/html\b/i.test(ct) ||
      head.startsWith("<!doctype html") ||
      /^<html[\s>]/.test(head);
    if (looksHtml) {
      // Some setups still return /dash HTML even when user pasted dashboard URL.
      const retryUrl = normalizeWeWeFeedUrl(url);
      if (retryUrl !== url) {
        const retry = await fetch(retryUrl, {
          signal: ctx.signal,
          headers: {
            "User-Agent": "news-monitor/1.0",
            Accept:
              "application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
          },
        });
        if (!retry.ok) {
          throw new Error(`wechat-wewe [upstream] feed retry HTTP ${retry.status}`);
        }
        rawXml = await retry.text();
        ct = retry.headers.get("content-type") || "";
        head = rawXml.trimStart().slice(0, 400).toLowerCase();
        looksHtml =
          /\btext\/html\b/i.test(ct) ||
          head.startsWith("<!doctype html") ||
          /^<html[\s>]/.test(head);
      }
    }
    if (looksHtml) {
      throw new Error(
        `wechat-wewe [format] 返回的是网页 HTML，不是 Atom。浏览器地址栏里的「/dash/feeds/MP_…」是 WeWe 控制台前端路由；` +
          `服务端订阅接口与官方文档一致，为「/feeds/MP_….atom」。本程序已按此转换后请求：${url}。` +
          ` 若仍见此错误，请检查鉴权码或是否走了反向代理缓存。`,
      );
    }
    // Do not set xml2js.strict=false: sax then uppercases tags (FEED) and rss-parser only reads result.feed.
    let feed: RssFeed;
    try {
      feed = (await new Parser().parseString(sanitizeAtomXmlRaw(rawXml))) as RssFeed;
    } catch (e1) {
      const first = e1 instanceof Error ? e1.message : String(e1);
      try {
        feed = (await new Parser().parseString(sanitizeAtomXmlAggressive(rawXml))) as RssFeed;
      } catch (e2) {
        const second = e2 instanceof Error ? e2.message : String(e2);
        throw new Error(`wechat-wewe [format] Atom 解析失败: ${first}；二次修复后: ${second}`);
      }
    }
    const avatarUrl =
      typeof feed.image?.url === "string" && feed.image.url.length > 0
        ? feed.image.url
        : undefined;
    return {
      items: (feed.items ?? []).map((item) => toNormalized(item, cfg.accountName)),
      sourceMeta: avatarUrl ? { avatarUrl } : undefined,
    };
  },
};
