import { z } from "zod";

export const capabilityNameSchema = z.enum([
  "sources.list",
  "sources.add",
  "sources.update",
  "sources.fetch",
  "sources.importPreset",
  "items.search",
  "clusters.list",
  "clusters.siblings",
  "hotspots.list",
  "hotspots.explain",
  "attention.list",
  "attention.explain",
  "stats.overview",
  "health.sources",
  "queue.status",
  "ops.reenrich",
  "ai.status",
  "system.status",
]);

export type CapabilityName = z.infer<typeof capabilityNameSchema>;

export type CapabilityErrorCode =
  | "invalid_input"
  | "unsupported_capability"
  | "not_found"
  | "conflict"
  | "permission_denied"
  | "dependency_unreachable"
  | "operation_failed";

export type CapabilityErrorPayload = {
  code: CapabilityErrorCode;
  message: string;
  recoveryHint?: string;
};

export type CapabilitySuccess<T> = {
  ok: true;
  capability: CapabilityName;
  data: T;
};

export type CapabilityFailure = {
  ok: false;
  capability: CapabilityName;
  error: CapabilityErrorPayload;
};

export const sourceKindSchema = z.enum(["rss", "hn", "x-rsshub", "x-rsshub-search", "wechat-wewe"]);
export const audienceSchema = z.enum(["public", "personal"]).default("public");
export const rangeSchema = z.enum(["24h", "72h", "7d", "30d", "90d"]).default("7d");
export const statsRangeSchema = z.enum(["24h", "72h", "7d", "30d", "90d", "custom"]).default("7d");
export const sortBySchema = z.enum(["published", "fetched"]).default("published");
export const clusterSortSchema = z
  .enum(["hybrid", "sources", "items", "recency", "cohesion"])
  .default("hybrid");
export const hotspotModeSchema = z.enum(["breaking", "consensus"]).default("consensus");

export const capabilityInputSchemas = {
  "sources.list": z
    .object({
      kind: sourceKindSchema.optional(),
      scope: z.enum(["public_seed", "personal"]).optional(),
      enabledOnly: z.boolean().optional().default(false),
    })
    .default({}),
  "sources.add": z.object({
    kind: sourceKindSchema,
    name: z.string().trim().min(1),
    config: z.record(z.any()),
    scope: z.enum(["public_seed", "personal"]).optional(),
    enabled: z.boolean().optional().default(true),
    fetchIntervalSec: z.number().int().min(60).max(7200).optional().default(600),
    initialFetchDays: z.number().int().min(0).max(30).nullable().optional().default(1),
    maxItemAgeDays: z.number().int().min(0).max(3650).nullable().optional().default(null),
  }),
  "sources.update": z.object({
    id: z.string().uuid(),
    kind: sourceKindSchema,
    name: z.string().trim().min(1),
    config: z.record(z.any()),
    scope: z.enum(["public_seed", "personal"]).optional(),
    enabled: z.boolean().optional().default(true),
    fetchIntervalSec: z.number().int().min(60).max(7200).optional().default(600),
    initialFetchDays: z.number().int().min(0).max(30).nullable().optional().default(1),
    maxItemAgeDays: z.number().int().min(0).max(3650).nullable().optional().default(null),
  }),
  "sources.fetch": z.object({
    sourceId: z.string().uuid(),
  }),
  "sources.importPreset": z.object({
    presetKey: z.string().trim().min(1).default("ai-high-signal"),
    fetchAfterImport: z.boolean().optional().default(false),
  }),
  "items.search": z.object({
    q: z.string().optional().default(""),
    limit: z.number().int().min(1).max(150).optional().default(20),
    range: rangeSchema.optional().default("7d"),
    audience: audienceSchema.optional().default("personal"),
    sortBy: sortBySchema.optional().default("published"),
    platform: z.string().trim().min(1).optional(),
    before: z.string().datetime().optional(),
    tags: z.array(z.string().trim().min(1)).optional(),
    taxonomyOnly: z.boolean().optional().default(false),
  }),
  "clusters.list": z.object({
    limit: z.number().int().min(1).max(50).optional().default(10),
    range: statsRangeSchema.optional().default("7d"),
    audience: audienceSchema.optional().default("public"),
    minSources: z.number().int().min(1).max(20).optional().default(2),
    clusterSort: clusterSortSchema.optional().default("hybrid"),
  }),
  "clusters.siblings": z.object({
    clusterId: z.string().uuid(),
    excludeItemId: z.string().uuid().optional(),
    excludeSourceId: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(100).optional().default(30),
    audience: audienceSchema.optional().default("public"),
  }),
  "hotspots.list": z.object({
    mode: hotspotModeSchema.optional().default("consensus"),
    limit: z.number().int().min(1).max(150).optional().default(20),
    range: rangeSchema.optional().default("7d"),
    audience: audienceSchema.optional().default("public"),
    q: z.string().optional().default(""),
    sortBy: sortBySchema.optional().default("published"),
    platform: z.string().trim().min(1).optional(),
    before: z.string().datetime().optional(),
    tags: z.array(z.string().trim().min(1)).optional(),
    taxonomyOnly: z.boolean().optional().default(false),
  }),
  "hotspots.explain": z.object({
    clusterId: z.string().uuid(),
    range: statsRangeSchema.optional().default("7d"),
    audience: audienceSchema.optional().default("public"),
  }),
  "attention.list": z.object({
    mode: hotspotModeSchema.optional().default("consensus"),
    limit: z.number().int().min(1).max(150).optional().default(20),
    range: rangeSchema.optional().default("7d"),
    audience: audienceSchema.optional().default("public"),
    q: z.string().optional().default(""),
    sortBy: sortBySchema.optional().default("published"),
    platform: z.string().trim().min(1).optional(),
    before: z.string().datetime().optional(),
    tags: z.array(z.string().trim().min(1)).optional(),
    taxonomyOnly: z.boolean().optional().default(false),
  }),
  "attention.explain": z.object({
    clusterId: z.string().uuid(),
    range: statsRangeSchema.optional().default("7d"),
    audience: audienceSchema.optional().default("public"),
  }),
  "stats.overview": z.object({
    range: statsRangeSchema.optional().default("7d"),
    audience: audienceSchema.optional().default("public"),
    minSources: z.number().int().min(1).max(20).optional().default(2),
    compare: z.boolean().optional().default(false),
    topN: z.number().int().min(1).max(50).optional(),
    platform: z.string().trim().min(1).optional(),
    tag: z.string().trim().min(1).optional(),
    clusterSort: clusterSortSchema.optional().default("hybrid"),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }),
  "health.sources": z.object({}).default({}),
  "queue.status": z.object({}).default({}),
  "ops.reenrich": z.object({
    scope: z.enum(["source", "window", "item"]),
    sourceId: z.string().uuid().optional(),
    since: z.string().datetime().optional(),
    until: z.string().datetime().optional(),
    itemId: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(500).optional().default(200),
  }),
  "ai.status": z.object({}).default({}),
  "system.status": z.object({}).default({}),
} satisfies Record<CapabilityName, z.ZodTypeAny>;

export type ParsedCapabilityInput<K extends CapabilityName> = z.infer<
  (typeof capabilityInputSchemas)[K]
>;

export const capabilityCatalog: Record<
  CapabilityName,
  { summary: string; writesData: boolean }
> = {
  "sources.list": { summary: "List configured sources", writesData: false },
  "sources.add": { summary: "Add a new source", writesData: true },
  "sources.update": { summary: "Update an existing source", writesData: true },
  "sources.fetch": { summary: "Queue a manual fetch for a source", writesData: true },
  "sources.importPreset": { summary: "Import a preset source pack", writesData: true },
  "items.search": { summary: "Search items across the timeline", writesData: false },
  "clusters.list": { summary: "List top clusters/events", writesData: false },
  "clusters.siblings": { summary: "List other sources covering the same cluster", writesData: false },
  "hotspots.list": { summary: "List curated hotspot items", writesData: false },
  "hotspots.explain": { summary: "Explain why a cluster is treated as a hotspot", writesData: false },
  "attention.list": { summary: "List noteworthy attention items", writesData: false },
  "attention.explain": { summary: "Explain why a cluster is marked as attention", writesData: false },
  "stats.overview": { summary: "Get overview metrics and hotspot stats", writesData: false },
  "health.sources": { summary: "Get source health diagnostics", writesData: false },
  "queue.status": { summary: "Get queue pressure and failure status", writesData: false },
  "ops.reenrich": { summary: "Queue re-enrichment for items", writesData: true },
  "ai.status": { summary: "Get AI runtime mode and optional LLM status", writesData: false },
  "system.status": { summary: "Get runtime/system status", writesData: false },
};

export function parseCapabilityInput<K extends CapabilityName>(
  capability: K,
  input: unknown,
): ParsedCapabilityInput<K> {
  return capabilityInputSchemas[capability].parse(input) as ParsedCapabilityInput<K>;
}

export function successCapability<T>(capability: CapabilityName, data: T): CapabilitySuccess<T> {
  return { ok: true, capability, data };
}

export function failureCapability(
  capability: CapabilityName,
  error: CapabilityErrorPayload,
): CapabilityFailure {
  return { ok: false, capability, error };
}
