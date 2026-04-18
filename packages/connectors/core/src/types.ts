export type ConnectorKind = "rss" | "hn" | "x-rsshub" | "wechat-wewe";

export interface FetchContext {
  source: {
    id: string;
    config: unknown;
    lastOkAt?: Date | null;
  };
  now: Date;
  signal: AbortSignal;
}

export interface NormalizedItem {
  externalId: string;
  url?: string;
  author?: string;
  title?: string;
  contentText?: string;
  media?: Array<{ type: "image" | "video"; url: string; thumb?: string }>;
  publishedAt?: Date;
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
