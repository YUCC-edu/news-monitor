import {
  getStatsOverview,
  getHotspotOverview,
  getClusterById,
  getClusterDistinctSourceCountByAudience,
  listClusterSiblingItems,
  listItemIdsForReEnrich,
  listItems,
  listSourcesWithFilter,
  listSourceHealth,
  listSourceInventory,
  upsertSource,
} from "@news/db";
import { existsSync } from "node:fs";
import path from "node:path";
import { categorizeErrorMessage, classifyRemediation, deriveTaxonomyWithMeta } from "@news/shared";
import { ZodError } from "zod";
import { buildCodexAgentBrief } from "./agent-brief";
import {
  capabilityCatalog,
  capabilityNameSchema,
  failureCapability,
  parseCapabilityInput,
  successCapability,
  type CapabilityErrorCode,
  type CapabilityName,
  type CapabilityFailure,
  type CapabilitySuccess,
} from "./contract";
import { enqueueEnrichItems, enqueueFetchSource } from "./queues";
import { buildDailyReport } from "./reports";
import { validateSourceConfig } from "./source-validation";
import { buildSystemStatusSnapshot } from "./system";
import { getEnginePresetSources, listEnginePresetPacks } from "./presets";
import { createWechatDraftWorkflow } from "./wechat-draft-workflow";

export class EngineCapabilityError extends Error {
  code: CapabilityErrorCode;
  recoveryHint?: string;

  constructor(code: CapabilityErrorCode, message: string, recoveryHint?: string) {
    super(message);
    this.name = "EngineCapabilityError";
    this.code = code;
    this.recoveryHint = recoveryHint;
  }
}

let publicSeedBootstrapPromise: Promise<void> | null = null;
const publicSeedDisabledPath = path.resolve(process.cwd(), "data", "public-seed-disabled");

async function ensurePublicSeedBundle() {
  if (existsSync(publicSeedDisabledPath)) return;
  if (publicSeedBootstrapPromise) return publicSeedBootstrapPromise;
  publicSeedBootstrapPromise = (async () => {
    const existing = await listSourcesWithFilter({ scope: "public_seed" });
    if (existing.length > 0) return;
    const presetSources = getEnginePresetSources("ai-high-signal");
    if (!presetSources) return;
    for (const preset of presetSources) {
      await validateSourceConfig(preset.kind, preset.config);
      const result = await upsertSource({ ...preset, scope: "public_seed" });
      if (result && !("conflict" in result)) {
        await enqueueFetchSource(result.id);
      }
    }
  })().finally(() => {
    publicSeedBootstrapPromise = null;
  });
  return publicSeedBootstrapPromise;
}

function publishedSinceFromRange(range: "24h" | "72h" | "7d" | "30d" | "90d") {
  const ms = Date.now();
  switch (range) {
    case "24h":
      return new Date(ms - 24 * 3600 * 1000);
    case "72h":
      return new Date(ms - 72 * 3600 * 1000);
    case "7d":
      return new Date(ms - 7 * 24 * 3600 * 1000);
    case "30d":
      return new Date(ms - 30 * 24 * 3600 * 1000);
    case "90d":
      return new Date(ms - 90 * 24 * 3600 * 1000);
  }
}

function enrichItemTaxonomy<T extends {
  titleZh?: string | null;
  title?: string | null;
  contentZh?: string | null;
  contentText?: string | null;
  tags?: string[] | null;
  categoryDomain?: string[] | null;
  categoryTopic?: string[] | null;
  categoryEntity?: string[] | null;
}>(row: T) {
  const tax = deriveTaxonomyWithMeta({
    title: row.titleZh ?? row.title,
    content: row.contentZh ?? row.contentText,
    tags: row.tags ?? [],
    llmDomain: row.categoryDomain ?? [],
    llmTopic: row.categoryTopic ?? [],
    llmEntity: row.categoryEntity ?? [],
  });
  return {
    ...row,
    categoryMeta: {
      confidence: tax.confidence,
      source: tax.source,
    },
  };
}

export function getCapabilityCatalog() {
  return Object.entries(capabilityCatalog).map(([name, meta]) => ({
    name: capabilityNameSchema.parse(name),
    ...meta,
  }));
}

export async function executeCapability(
  capability: CapabilityName,
  rawInput: unknown,
): Promise<CapabilitySuccess<unknown> | CapabilityFailure> {
  try {
    let data: unknown;
    switch (capability) {
      case "sources.list": {
        const input = parseCapabilityInput("sources.list", rawInput);
        const rows = await listSourceInventory();
        data = {
          total: rows.length,
          sources: rows.filter((row) => {
            if (input.kind && row.kind !== input.kind) return false;
            if (input.scope && row.scope !== input.scope) return false;
            if (input.enabledOnly && !row.enabled) return false;
            return true;
          }),
        };
        break;
      }
      case "sources.add": {
        const input = parseCapabilityInput("sources.add", rawInput);
        await validateSourceConfig(input.kind, input.config);
        const result = await upsertSource({ ...input, scope: input.scope ?? "personal" });
        if (!result) {
          throw new EngineCapabilityError("operation_failed", "failed to create source");
        }
        if ("conflict" in result) {
          data = { conflict: true, existing: result.existing };
        } else {
          data = { conflict: false, source: result };
        }
        break;
      }
      case "sources.update": {
        const input = parseCapabilityInput("sources.update", rawInput);
        await validateSourceConfig(input.kind, input.config);
        const result = await upsertSource({ ...input, scope: input.scope });
        if (!result) {
          throw new EngineCapabilityError("not_found", "source not found");
        }
        if ("conflict" in result) {
          data = { conflict: true, existing: result.existing };
        } else {
          data = { conflict: false, source: result };
        }
        break;
      }
      case "sources.fetch": {
        const input = parseCapabilityInput("sources.fetch", rawInput);
        await enqueueFetchSource(input.sourceId);
        data = { queued: true, sourceId: input.sourceId };
        break;
      }
      case "sources.importPreset": {
        const input = parseCapabilityInput("sources.importPreset", rawInput);
        const presetSources = getEnginePresetSources(input.presetKey);
        if (!presetSources) {
          throw new EngineCapabilityError(
            "not_found",
            `unknown preset pack: ${input.presetKey}`,
            `Available preset packs: ${listEnginePresetPacks().map((p) => p.key).join(", ")}`,
          );
        }
        const created: string[] = [];
        const conflicts: string[] = [];
        for (const preset of presetSources) {
          await validateSourceConfig(preset.kind, preset.config);
          const result = await upsertSource({ ...preset, scope: "public_seed" });
          if (!result) continue;
          if ("conflict" in result) {
            conflicts.push(result.existing.id);
          } else {
            created.push(result.id);
            if (input.fetchAfterImport) await enqueueFetchSource(result.id);
          }
        }
        data = {
          presetKey: input.presetKey,
          created: created.length,
          conflicts: conflicts.length,
          createdSourceIds: created,
          conflictSourceIds: conflicts,
          fetchQueued: input.fetchAfterImport ? created.length : 0,
        };
        break;
      }
      case "items.search": {
        const input = parseCapabilityInput("items.search", rawInput);
        const rows = await listItems({
          feed: "all",
          q: input.q.trim(),
          limit: input.limit,
          before: input.before ? new Date(input.before) : undefined,
          publishedSince: publishedSinceFromRange(input.range),
          audience: input.audience,
          platform: input.platform,
          tags: input.tags,
          sortBy: input.sortBy,
          taxonomyOnly: input.taxonomyOnly,
        });
        data = {
          total: rows.length,
          items: rows.map((row) => enrichItemTaxonomy(row)),
        };
        break;
      }
      case "clusters.list": {
        const input = parseCapabilityInput("clusters.list", rawInput);
        if (input.audience === "public") {
          await ensurePublicSeedBundle();
        }
        const overview = await getStatsOverview({
          range: input.range,
          audience: input.audience,
          minSources: input.minSources,
          clusterSort: input.clusterSort,
          topN: input.limit,
        });
        data = {
          total: overview.topClusters.length,
          range: overview.range,
          minSources: input.minSources,
          clusters: overview.topClusters,
          hotspot: overview.hotspot,
        };
        break;
      }
      case "clusters.siblings": {
        const input = parseCapabilityInput("clusters.siblings", rawInput);
        const rows = await listClusterSiblingItems({
          clusterId: input.clusterId,
          excludeItemId: input.excludeItemId,
          excludeSourceId: input.excludeSourceId,
          limit: input.limit,
          audience: input.audience,
        });
        data = { total: rows.length, items: rows };
        break;
      }
      case "attention.list":
      case "hotspots.list": {
        const input = parseCapabilityInput("hotspots.list", rawInput);
        if (input.audience === "public") {
          await ensurePublicSeedBundle();
        }
        const overview = await getHotspotOverview({
          range: input.range,
          audience: input.audience,
          platform: input.platform,
          tag: input.tags?.[0],
          topN: input.limit,
          minSources: 2,
        });
        const rows =
          input.mode === "breaking" ? overview.breakingClusters ?? [] : overview.consensusClusters ?? [];
        data = {
          total: rows.length,
          hotspots: rows.map((row) => {
            const distinctSources = typeof row.distinctSources === "number" ? row.distinctSources : 1;
            return {
              ...row,
              whySelected:
                input.mode === "breaking"
                  ? (row.whyBreaking ?? [`${distinctSources} distinct source${distinctSources === 1 ? "" : "s"}`])
                  : (row.whyConsensus ?? [`${distinctSources} distinct source${distinctSources === 1 ? "" : "s"}`]),
            };
          }),
        };
        break;
      }
      case "attention.explain":
      case "hotspots.explain": {
        const input = parseCapabilityInput("hotspots.explain", rawInput);
        if (input.audience === "public") {
          await ensurePublicSeedBundle();
        }
        const cluster = await getClusterById(input.clusterId);
        if (!cluster) {
          throw new EngineCapabilityError("not_found", "cluster not found");
        }
        const [siblings, distinctSources] = await Promise.all([
          listClusterSiblingItems({ clusterId: input.clusterId, limit: 20, audience: input.audience }),
          getClusterDistinctSourceCountByAudience(input.clusterId, input.audience),
        ]);
        data = {
          cluster,
          range: input.range,
          distinctSources,
          weightedDistinctSources: cluster.weightedDistinctSources ?? distinctSources,
          itemCount: cluster.itemCount,
          sources: [...new Set(siblings.map((row) => row.sourceName))],
          representativeItems: siblings.slice(0, 8),
          whySelected: [
            `${cluster.weightedDistinctSources ?? distinctSources} weighted source coverage`,
            `${distinctSources} distinct source${distinctSources === 1 ? "" : "s"} covered this event`,
            `${cluster.itemCount} item${cluster.itemCount === 1 ? "" : "s"} are attached to this cluster`,
            "hotspot ranking prioritizes cross-source consensus, then recency and activity",
          ],
          whyConsensus: [
            `${cluster.weightedDistinctSources ?? distinctSources} weighted source coverage`,
            `${distinctSources} distinct source${distinctSources === 1 ? "" : "s"} covered this event`,
            `${cluster.itemCount} item${cluster.itemCount === 1 ? "" : "s"} are attached to this cluster`,
            `cross-platform score: ${cluster.crossPlatformScore ?? 0}`,
          ],
          whyBreaking: [
            "breaking ranking rewards recent acceleration and external attention",
            `burst velocity: ${cluster.burstVelocity ?? 0}`,
            `X signal: ${cluster.xSignalScore ?? 0}, HN signal: ${cluster.hnSignalScore ?? 0}`,
            `${siblings.length} representative coverages are attached to this cluster`,
          ],
          scoreBreakdown: {
            consensus: {
              distinctSources,
              itemCount: cluster.itemCount,
              consensusScore: cluster.consensusScore ?? cluster.hotspotScore ?? 0,
              crossPlatformScore: cluster.crossPlatformScore ?? 0,
            },
            breaking: {
              breakingScore: cluster.breakingScore ?? 0,
              burstVelocity: cluster.burstVelocity ?? 0,
              xSignalScore: cluster.xSignalScore ?? 0,
              hnSignalScore: cluster.hnSignalScore ?? 0,
            },
          },
        };
        break;
      }
      case "stats.overview": {
        const input = parseCapabilityInput("stats.overview", rawInput);
        if (input.audience === "public") {
          await ensurePublicSeedBundle();
        }
        data = await getHotspotOverview({
          range: input.range,
          audience: input.audience,
          platform: input.platform,
          tag: input.tag,
          minSources: input.minSources,
          compare: input.compare,
          topN: input.topN,
          clusterSort: input.clusterSort,
          from: input.from ? new Date(input.from) : undefined,
          to: input.to ? new Date(input.to) : undefined,
        });
        break;
      }
      case "health.sources": {
        parseCapabilityInput("health.sources", rawInput);
        const rows = await listSourceHealth();
        data = {
          total: rows.length,
          sources: rows.map((row) => {
            const errorCategory = categorizeErrorMessage(row.lastError);
            const remediation = classifyRemediation(errorCategory);
            const recoveredAgoMin =
              row.lastOkAt && row.failCount === 0
                ? Math.max(0, Math.round((Date.now() - new Date(row.lastOkAt).getTime()) / 60000))
                : null;
            return { ...row, errorCategory, remediation, recoveredAgoMin };
          }),
        };
        break;
      }
      case "queue.status": {
        parseCapabilityInput("queue.status", rawInput);
        const status = await buildSystemStatusSnapshot();
        data = {
          queues: status.queues,
          latestFailed: status.queueLatestFailed,
          latestCompleted: status.queueLatestCompleted,
        };
        break;
      }
      case "ops.reenrich": {
        const input = parseCapabilityInput("ops.reenrich", rawInput);
        const ids = await listItemIdsForReEnrich({
          scope: input.scope,
          sourceId: input.sourceId,
          since: input.since ? new Date(input.since) : undefined,
          until: input.until ? new Date(input.until) : undefined,
          itemId: input.itemId,
          limit: input.limit,
        });
        if (ids.length > 0) {
          await enqueueEnrichItems(ids);
        }
        data = { queued: ids.length, itemIds: ids };
        break;
      }
      case "reports.agentBrief": {
        const input = parseCapabilityInput("reports.agentBrief", rawInput);
        const rendered = await buildDailyReport({
          audience: input.audience,
          range: input.range,
          topN: input.topN,
          minSources: input.minSources,
          reportDate: input.reportDate,
          timezone: input.timezone,
          trigger: "agent-brief",
        });
        data = buildCodexAgentBrief(rendered.draft);
        break;
      }
      case "wechatDraft.create": {
        const input = parseCapabilityInput("wechatDraft.create", rawInput);
        data = await createWechatDraftWorkflow(input);
        break;
      }
      case "system.status": {
        parseCapabilityInput("system.status", rawInput);
        data = await buildSystemStatusSnapshot();
        break;
      }
      case "ai.status": {
        parseCapabilityInput("ai.status", rawInput);
        const status = await buildSystemStatusSnapshot();
        data = {
          mode: status.env.llm.mode,
          enabled: status.env.llm.enabled,
          hasKey: status.env.llm.hasKey,
          baseUrl: status.env.llm.baseUrl,
          chatModel: status.env.llm.chatModel,
          embeddingModel: status.env.llm.embeddingModel,
          concurrency: status.env.llm.concurrency,
          dailyRequestBudget: status.env.llm.dailyRequestBudget,
          queue: status.queues["ai-enrich-item"] ?? null,
          latestFailed: status.queueLatestFailed["ai-enrich-item"] ?? null,
          recoveryHint:
            status.env.llm.mode === "core"
              ? "No LLM is required. Core crawling, clustering, hotspots, and stats run locally."
              : status.env.llm.mode === "agent"
                ? "The engine will not call an LLM; external agents should use CLI/HTTP capabilities."
                : status.env.llm.hasKey
                  ? "LLM enhancement is enabled. Watch queue pressure and budget before importing many sources."
                  : "Set LLM_API_KEY or switch AI_MODE back to core.",
        };
        break;
      }
      default: {
        throw new EngineCapabilityError("unsupported_capability", `unsupported capability: ${capability}`);
      }
    }
    return successCapability(capability, data);
  } catch (error) {
    if (error instanceof ZodError) {
      return failureCapability(capability, {
        code: "invalid_input",
        message: error.issues.map((issue) => issue.message).join("; "),
        recoveryHint: "Check the capability input schema and retry with valid arguments.",
      });
    }
    if (error instanceof EngineCapabilityError) {
      return failureCapability(capability, {
        code: error.code,
        message: error.message,
        recoveryHint: error.recoveryHint,
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    return failureCapability(capability, {
      code: "operation_failed",
      message,
      recoveryHint: "Inspect your configuration and dependencies, then retry the request.",
    });
  }
}

