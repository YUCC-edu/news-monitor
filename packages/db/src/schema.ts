import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  unique,
  index,
  customType,
  primaryKey,
} from "drizzle-orm/pg-core";

/**
 * pgvector 列：维度统一 1024，便于不同 embedding 模型截断/对齐。
 */
const vector1024 = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1024)";
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    return JSON.parse(value as string) as number[];
  },
});

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(), // 'rss' | 'hn' | 'x-rsshub'
    name: text("name").notNull(),
    config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
    enabled: boolean("enabled").notNull().default(true),
    fetchIntervalSec: integer("fetch_interval_sec").notNull().default(300),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastOkAt: timestamp("last_ok_at", { withTimezone: true }),
    lastError: text("last_error"),
    failCount: integer("fail_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    kindIdx: index("sources_kind_idx").on(t.kind),
    enabledIdx: index("sources_enabled_idx").on(t.enabled),
  }),
);

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    url: text("url"),
    author: text("author"),
    title: text("title"),
    contentText: text("content_text"),
    media: jsonb("media").default(sql`'[]'::jsonb`),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    raw: jsonb("raw"),
  },
  (t) => ({
    uniqExternal: unique("items_source_external_uniq").on(
      t.sourceId,
      t.externalId,
    ),
    publishedIdx: index("items_source_published_idx").on(
      t.sourceId,
      t.publishedAt,
    ),
    fetchedIdx: index("items_fetched_idx").on(t.fetchedAt),
  }),
);

export const clusters = pgTable("clusters", {
  id: uuid("id").primaryKey().defaultRandom(),
  topic: text("topic"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  itemCount: integer("item_count").notNull().default(0),
});

export const itemEnrichments = pgTable(
  "item_enrichments",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    lang: text("lang"),
    titleZh: text("title_zh"),
    contentZh: text("content_zh"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    embedding: vector1024("embedding"),
    clusterId: uuid("cluster_id").references(() => clusters.id, {
      onDelete: "set null",
    }),
    enrichedAt: timestamp("enriched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.itemId] }),
    clusterIdx: index("enr_cluster_idx").on(t.clusterId),
    tagsIdx: index("enr_tags_gin_idx").using("gin", t.tags),
  }),
);

export const userLinks = pgTable("user_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const keywordRules = pgTable("keyword_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  pattern: text("pattern").notNull(),
  isRegex: boolean("is_regex").notNull().default(false),
  notify: boolean("notify").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const controlledTags = pgTable("controlled_tags", {
  tag: text("tag").primaryKey(),
  displayZh: text("display_zh"),
  weight: integer("weight").notNull().default(0),
});

export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Cluster = typeof clusters.$inferSelect;
export type ItemEnrichment = typeof itemEnrichments.$inferSelect;
