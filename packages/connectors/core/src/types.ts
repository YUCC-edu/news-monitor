export type ConnectorKind = "rss" | "hn" | "x-rsshub" | "x-rsshub-search" | "wechat-wewe";

export interface FetchContext {
  source: {
    id: string;
    config: unknown;
    lastOkAt?: Date | null;
  };
  now: Date;
  signal: AbortSignal;
}

export interface XEngagementMetrics {
  posts?: number;
  replies?: number;
  reposts?: number;
  likes?: number;
  quotes?: number;
  views?: number;
}

export interface HnEngagementMetrics {
  posts?: number;
  points?: number;
  comments?: number;
}

export interface PlatformEngagement {
  x?: XEngagementMetrics;
  hn?: HnEngagementMetrics;
}

export interface NormalizedItem {
  externalId: string;
  url?: string;
  author?: string;
  title?: string;
  contentText?: string;
  media?: Array<{ type: "image" | "video"; url: string; thumb?: string }>;
  publishedAt?: Date;
  engagement?: PlatformEngagement;
  raw: unknown;
}

export type ConnectorFetchResult = {
  items: NormalizedItem[];
  sourceMeta?: { avatarUrl?: string };
};

export interface Connector {
  kind: ConnectorKind;
  validateConfig(config: unknown): Promise<void>;
  fetch(ctx: FetchContext): Promise<ConnectorFetchResult>;
}
