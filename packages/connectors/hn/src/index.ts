import type {
  Connector,
  ConnectorFetchResult,
  FetchContext,
  HnEngagementMetrics,
  NormalizedItem,
} from "@news/connectors-core";

const HN_API = "https://hn.algolia.com/api/v1/search_by_date";

type HnConfig = {
  query?: string;
  pointsMin?: number;
};

type HnHit = {
  objectID: string;
  url?: string | null;
  author?: string | null;
  title?: string | null;
  story_title?: string | null;
  story_text?: string | null;
  comment_text?: string | null;
  created_at?: string | null;
  points?: number | null;
  num_comments?: number | null;
};

type HnResponse = {
  hits?: HnHit[];
};

function parseConfig(config: unknown): HnConfig {
  if (config == null) return {};
  if (typeof config !== "object") throw new Error("HN config must be an object");
  const obj = config as Record<string, unknown>;
  const parsed: HnConfig = {};
  if (obj.query != null) {
    if (typeof obj.query !== "string") throw new Error("HN config.query must be string");
    parsed.query = obj.query;
  }
  if (obj.pointsMin != null) {
    if (typeof obj.pointsMin !== "number" || Number.isNaN(obj.pointsMin)) {
      throw new Error("HN config.pointsMin must be number");
    }
    parsed.pointsMin = obj.pointsMin;
  }
  return parsed;
}

function buildSearchUrl(ctx: FetchContext, config: HnConfig) {
  const url = new URL(HN_API);
  url.searchParams.set("tags", "story");
  if (config.query) {
    url.searchParams.set("query", config.query);
  }

  const numericFilters: string[] = [];
  if (typeof config.pointsMin === "number") {
    numericFilters.push(`points>=${Math.trunc(config.pointsMin)}`);
  }
  if (ctx.source.lastOkAt) {
    const ts = Math.floor(ctx.source.lastOkAt.getTime() / 1000);
    numericFilters.push(`created_at_i>${ts}`);
  }
  if (numericFilters.length > 0) {
    url.searchParams.set("numericFilters", numericFilters.join(","));
  }
  return url;
}

function toNormalized(hit: HnHit): NormalizedItem | null {
  const externalId = hit.objectID;
  if (!externalId) return null;
  const publishedAt = hit.created_at ? new Date(hit.created_at) : undefined;
  const engagement: HnEngagementMetrics = {
    posts: 1,
    points: typeof hit.points === "number" ? hit.points : undefined,
    comments: typeof hit.num_comments === "number" ? hit.num_comments : undefined,
  };
  const hasEngagement = Object.entries(engagement).some(
    ([key, value]) => key !== "posts" && typeof value === "number" && value >= 0,
  );
  return {
    externalId,
    url: hit.url ?? undefined,
    author: hit.author ?? undefined,
    title: hit.title ?? hit.story_title ?? undefined,
    contentText: hit.story_text ?? hit.comment_text ?? undefined,
    publishedAt:
      publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : undefined,
    engagement: hasEngagement ? { hn: engagement } : undefined,
    raw: hit,
  };
}

export const hnConnector: Connector = {
  kind: "hn",
  async validateConfig(config: unknown) {
    parseConfig(config);
  },
  async fetch(ctx: FetchContext): Promise<ConnectorFetchResult> {
    const cfg = parseConfig(ctx.source.config);
    const url = buildSearchUrl(ctx, cfg);
    const response = await fetch(url, { signal: ctx.signal });
    if (!response.ok) {
      throw new Error(`HN fetch failed: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as HnResponse;
    const hits = data.hits ?? [];
    const items = hits.map(toNormalized).filter((item): item is NormalizedItem => item !== null);
    return { items };
  },
};
