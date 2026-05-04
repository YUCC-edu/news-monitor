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
    scope: text("scope").notNull().default("personal"), // 'public_seed' | 'personal'
    config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
    enabled: boolean("enabled").notNull().default(true),
    fetchIntervalSec: integer("fetch_interval_sec").notNull().default(300),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastOkAt: timestamp("last_ok_at", { withTimezone: true }),
    lastError: text("last_error"),
    failCount: integer("fail_count").notNull().default(0),
    /** When set and in the future, fetch worker skips run until this instant (failure backoff). */
    nextRunAfter: timestamp("next_run_after", { withTimezone: true }),
    dedupKey: text("dedup_key"),
    initialFetchDays: integer("initial_fetch_days"),
    maxItemAgeDays: integer("max_item_age_days"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    kindIdx: index("sources_kind_idx").on(t.kind),
    scopeIdx: index("sources_scope_idx").on(t.scope),
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
  topicSource: text("topic_source").notNull().default("rules"),
  hotspotScore: integer("hotspot_score").notNull().default(0),
  distinctSources: integer("distinct_sources").notNull().default(0),
  weightedDistinctSources: integer("weighted_distinct_sources").notNull().default(0),
  crossPlatformScore: integer("cross_platform_score").notNull().default(0),
  breakingScore: integer("breaking_score").notNull().default(0),
  consensusScore: integer("consensus_score").notNull().default(0),
  burstVelocity: integer("burst_velocity").notNull().default(0),
  xSignalScore: integer("x_signal_score").notNull().default(0),
  hnSignalScore: integer("hn_signal_score").notNull().default(0),
  /** Running-average embedding for nearest-cluster retrieval (optional until backfilled). */
  centroidEmbedding: vector1024("centroid_embedding"),
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
    categoryDomain: text("category_domain")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    categoryTopic: text("category_topic")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    categoryEntity: text("category_entity")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    embedding: vector1024("embedding"),
    enrichmentSource: text("enrichment_source").notNull().default("rules"),
    enrichmentVersion: text("enrichment_version").notNull().default("rules-v1"),
    platformMetrics: jsonb("platform_metrics").notNull().default(sql`'{}'::jsonb`),
    fullContentText: text("full_content_text"),
    contentSummaryZh: text("content_summary_zh"),
    contentExtractSource: text("content_extract_source").notNull().default("feed"),
    contentQualityScore: integer("content_quality_score").notNull().default(0),
    summaryVersion: text("summary_version").notNull().default("none"),
    llmKeywords: text("llm_keywords")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    eventSummary: text("event_summary"),
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
    domainIdx: index("enr_category_domain_gin_idx").using("gin", t.categoryDomain),
    topicIdx: index("enr_category_topic_gin_idx").using("gin", t.categoryTopic),
    entityIdx: index("enr_category_entity_gin_idx").using("gin", t.categoryEntity),
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

export const favorites = pgTable(
  "favorites",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.itemId] }),
    createdIdx: index("favorites_created_idx").on(t.createdAt),
  }),
);

export const assistantActions = pgTable(
  "assistant_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: text("request_id").notNull(),
    actor: text("actor").notNull(),
    role: text("role").notNull().default("assistant_read"),
    tool: text("tool").notNull(),
    status: text("status").notNull(),
    inputSummary: text("input_summary"),
    outputSummary: text("output_summary"),
    errorMessage: text("error_message"),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    requestIdx: index("assistant_actions_request_idx").on(t.requestId),
    createdIdx: index("assistant_actions_created_idx").on(t.createdAt),
    toolIdx: index("assistant_actions_tool_idx").on(t.tool),
  }),
);

export const writingStyleProfiles = pgTable(
  "writing_style_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"),
    rules: jsonb("rules").notNull().default(sql`'{}'::jsonb`),
    sampleCount: integer("sample_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    statusIdx: index("writing_style_profiles_status_idx").on(t.status),
    updatedIdx: index("writing_style_profiles_updated_idx").on(t.updatedAt),
  }),
);

export const writingStyleSamples = pgTable(
  "writing_style_samples",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => writingStyleProfiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sourceUrl: text("source_url"),
    contentMarkdown: text("content_markdown").notNull(),
    wechatHtml: text("wechat_html"),
    coverImageUrl: text("cover_image_url"),
    inlineImages: jsonb("inline_images").notNull().default(sql`'[]'::jsonb`),
    imageNotes: text("image_notes"),
    extracted: jsonb("extracted").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    profileIdx: index("writing_style_samples_profile_idx").on(t.profileId),
    createdIdx: index("writing_style_samples_created_idx").on(t.createdAt),
  }),
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportDate: text("report_date").notNull(),
    title: text("title").notNull(),
    audience: text("audience").notNull().default("personal"),
    range: text("range").notNull().default("24h"),
    topN: integer("top_n").notNull().default(10),
    minSources: integer("min_sources").notNull().default(1),
    status: text("status").notNull().default("draft"),
    draft: jsonb("draft").notNull().default(sql`'{}'::jsonb`),
    markdown: text("markdown").notNull(),
    wechatHtml: text("wechat_html").notNull(),
    feishuPayload: jsonb("feishu_payload").notNull().default(sql`'{}'::jsonb`),
    obsidianMarkdown: text("obsidian_markdown").notNull(),
    styleProfileId: uuid("style_profile_id").references(() => writingStyleProfiles.id, { onDelete: "set null" }),
    styledTitle: text("styled_title"),
    styledMarkdown: text("styled_markdown"),
    styledWechatHtml: text("styled_wechat_html"),
    styleImageBriefs: jsonb("style_image_briefs").notNull().default(sql`'[]'::jsonb`),
    styledAt: timestamp("styled_at", { withTimezone: true }),
    edited: boolean("edited").notNull().default(false),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqDaily: unique("reports_daily_unique").on(t.reportDate, t.audience, t.range),
    createdIdx: index("reports_created_idx").on(t.createdAt),
    dateIdx: index("reports_date_idx").on(t.reportDate),
    statusIdx: index("reports_status_idx").on(t.status),
    styleProfileIdx: index("reports_style_profile_idx").on(t.styleProfileId),
  }),
);

export const reportRuns = pgTable(
  "report_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id").references(() => reports.id, { onDelete: "set null" }),
    trigger: text("trigger").notNull().default("manual"),
    status: text("status").notNull().default("running"),
    params: jsonb("params").notNull().default(sql`'{}'::jsonb`),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({
    reportIdx: index("report_runs_report_idx").on(t.reportId),
    startedIdx: index("report_runs_started_idx").on(t.startedAt),
    statusIdx: index("report_runs_status_idx").on(t.status),
  }),
);

export const publishTargets = pgTable(
  "publish_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    kindUnique: unique("publish_targets_kind_unique").on(t.kind),
    enabledIdx: index("publish_targets_enabled_idx").on(t.enabled),
  }),
);

export const publishAttempts = pgTable(
  "publish_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    targetId: uuid("target_id").references(() => publishTargets.id, { onDelete: "set null" }),
    targetKind: text("target_kind").notNull(),
    trigger: text("trigger").notNull().default("manual"),
    status: text("status").notNull().default("running"),
    externalId: text("external_id"),
    externalUrl: text("external_url"),
    output: jsonb("output").notNull().default(sql`'{}'::jsonb`),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    reportIdx: index("publish_attempts_report_idx").on(t.reportId),
    targetIdx: index("publish_attempts_target_idx").on(t.targetKind),
    statusIdx: index("publish_attempts_status_idx").on(t.status),
    createdIdx: index("publish_attempts_created_idx").on(t.createdAt),
  }),
);

export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
export type SourceScope = "public_seed" | "personal";
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Cluster = typeof clusters.$inferSelect;
export type ItemEnrichment = typeof itemEnrichments.$inferSelect;
export type AssistantAction = typeof assistantActions.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
export type ReportRun = typeof reportRuns.$inferSelect;
export type PublishTarget = typeof publishTargets.$inferSelect;
export type PublishAttempt = typeof publishAttempts.$inferSelect;
export type WritingStyleProfile = typeof writingStyleProfiles.$inferSelect;
export type WritingStyleSample = typeof writingStyleSamples.$inferSelect;
