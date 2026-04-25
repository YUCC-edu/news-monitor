import {
  logAssistantAction,
} from "@news/db";
import { executeCapability, type CapabilityName } from "@news/engine";
import { createLogger } from "@news/shared";
import type { AssistantRole } from "./assistant-contract";
import { buildPolicyRejectionMessage, isToolAllowedByPolicy } from "./assistant-policy";

const log = createLogger("assistant:tools");

export type AssistantToolName =
  | "search_items"
  | "list_trending_clusters"
  | "list_source_health"
  | "stats_report"
  | "add_source"
  | "trigger_fetch_source"
  | "trigger_reenrich";

const TOOL_ROLES: Record<AssistantToolName, AssistantRole> = {
  search_items: "assistant_read",
  list_trending_clusters: "assistant_read",
  list_source_health: "assistant_read",
  stats_report: "assistant_read",
  add_source: "assistant_write_low",
  trigger_fetch_source: "assistant_write_low",
  trigger_reenrich: "assistant_write_low",
};

const TOOL_TO_CAPABILITY: Record<AssistantToolName, CapabilityName> = {
  search_items: "items.search",
  list_trending_clusters: "clusters.list",
  list_source_health: "health.sources",
  stats_report: "stats.overview",
  add_source: "sources.add",
  trigger_fetch_source: "sources.fetch",
  trigger_reenrich: "ops.reenrich",
};

export function isToolAllowed(role: AssistantRole, tool: AssistantToolName) {
  if (role === "assistant_write_low") return true;
  return TOOL_ROLES[tool] === "assistant_read";
}

export async function runAssistantTool(input: {
  requestId: string;
  actor: string;
  role: AssistantRole;
  tool: AssistantToolName;
  args: Record<string, unknown>;
}) {
  if (!isToolAllowedByPolicy(input.tool)) {
    const message = buildPolicyRejectionMessage(input.tool);
    await safeAudit({
      requestId: input.requestId,
      actor: input.actor,
      role: input.role,
      tool: input.tool,
      status: "rejected",
      inputSummary: JSON.stringify(input.args).slice(0, 800),
      errorMessage: message,
    });
    throw new Error(message);
  }
  validateToolArgs(input.tool, input.args);
  if (!isToolAllowed(input.role, input.tool)) {
    await safeAudit({
      requestId: input.requestId,
      actor: input.actor,
      role: input.role,
      tool: input.tool,
      status: "rejected",
      inputSummary: JSON.stringify(input.args).slice(0, 800),
      errorMessage: "permission denied",
    });
    throw new Error("permission denied");
  }

  const t0 = Date.now();
  try {
    const result = await execTool(input.tool, input.args);
    await safeAudit({
      requestId: input.requestId,
      actor: input.actor,
      role: input.role,
      tool: input.tool,
      status: "ok",
      inputSummary: JSON.stringify(input.args).slice(0, 800),
      outputSummary: JSON.stringify(result).slice(0, 1000),
      latencyMs: Date.now() - t0,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await safeAudit({
      requestId: input.requestId,
      actor: input.actor,
      role: input.role,
      tool: input.tool,
      status: "error",
      inputSummary: JSON.stringify(input.args).slice(0, 800),
      errorMessage: message,
      latencyMs: Date.now() - t0,
    });
    log.warn("assistant tool failed", { tool: input.tool, requestId: input.requestId, message });
    throw error;
  }
}

async function safeAudit(input: {
  requestId: string;
  actor: string;
  role: AssistantRole;
  tool: string;
  status: "ok" | "error" | "rejected";
  inputSummary?: string;
  outputSummary?: string;
  errorMessage?: string;
  latencyMs?: number;
}) {
  try {
    await logAssistantAction(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Auditing must never block user-visible execution flows.
    log.warn("assistant audit logging degraded", {
      tool: input.tool,
      requestId: input.requestId,
      status: input.status,
      message,
    });
  }
}

function validateToolArgs(tool: AssistantToolName, args: Record<string, unknown>) {
  if (tool === "search_items") {
    const q = args.q;
    if (q != null && typeof q !== "string") throw new Error("search_items.q must be string");
    return;
  }
  if (tool === "stats_report") {
    const range = args.range;
    if (range != null && typeof range !== "string") throw new Error("stats_report.range must be string");
    return;
  }
  if (tool === "add_source") {
    if (typeof args.name !== "string" || args.name.trim().length === 0) {
      throw new Error("add_source.name is required");
    }
    if (!["rss", "hn", "x-rsshub", "wechat-wewe"].includes(String(args.kind ?? ""))) {
      throw new Error("add_source.kind is invalid");
    }
    if (!args.config || typeof args.config !== "object") {
      throw new Error("add_source.config is required");
    }
    return;
  }
  if (tool === "trigger_fetch_source") {
    if (typeof args.sourceId !== "string" || args.sourceId.trim().length === 0) {
      throw new Error("trigger_fetch_source.sourceId is required");
    }
    return;
  }
  if (tool === "trigger_reenrich") {
    const scope = args.scope;
    if (scope !== "source" && scope !== "window" && scope !== "item") {
      throw new Error("trigger_reenrich.scope must be source | window | item");
    }
    if (scope === "source" && typeof args.sourceId !== "string") {
      throw new Error("trigger_reenrich.sourceId is required for scope=source");
    }
    if (scope === "item" && typeof args.itemId !== "string") {
      throw new Error("trigger_reenrich.itemId is required for scope=item");
    }
    if (scope === "window" && typeof args.since !== "string" && typeof args.until !== "string") {
      throw new Error("trigger_reenrich window scope requires since or until");
    }
  }
}

async function execTool(tool: AssistantToolName, args: Record<string, unknown>) {
  const capability = TOOL_TO_CAPABILITY[tool];
  const normalizedArgs =
    tool === "stats_report"
      ? {
          range: String(args.range ?? "7d"),
          minSources: Number(args.minSources ?? 2) || 2,
        }
      : tool === "list_trending_clusters"
        ? {
            limit: Math.min(Math.max(Number(args.limit ?? 10) || 10, 1), 50),
            range: "7d",
            minSources: Number(args.minSources ?? 2) || 2,
            clusterSort: "hybrid",
          }
        : tool === "search_items"
          ? {
              q: String(args.q ?? "").trim(),
              limit: Math.min(Math.max(Number(args.limit ?? 20) || 20, 1), 50),
              range: "7d",
              sortBy: "published",
            }
          : tool === "add_source"
            ? {
                kind: args.kind,
                name: String(args.name ?? "").trim(),
                config: (args.config ?? {}) as Record<string, unknown>,
                enabled: true,
                fetchIntervalSec: Math.min(Math.max(Number(args.fetchIntervalSec ?? 600) || 600, 60), 7200),
                initialFetchDays: Number(args.initialFetchDays ?? 1) || 1,
                maxItemAgeDays: null,
              }
            : tool === "trigger_fetch_source"
              ? {
                  sourceId: String(args.sourceId ?? "").trim(),
                }
              : tool === "trigger_reenrich"
                ? {
                    scope: String(args.scope ?? ""),
                    sourceId: typeof args.sourceId === "string" ? args.sourceId : undefined,
                    itemId: typeof args.itemId === "string" ? args.itemId : undefined,
                    since: typeof args.since === "string" ? args.since : undefined,
                    until: typeof args.until === "string" ? args.until : undefined,
                    limit: Math.min(Math.max(Number(args.limit ?? 100) || 100, 1), 500),
                  }
                : args;
  const result = await executeCapability(capability, normalizedArgs);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  if (tool === "stats_report") {
    const data = result.data as {
      range: string;
      totals: { items_window: number; clusters_window: number };
      hotspot: { hotspotIndex: number; attentionIndex?: number };
      topClusters: unknown[];
    };
    return {
      range: data.range,
      totals: data.totals,
      hotspot: data.hotspot,
      attention: data.hotspot,
      topClusters: data.topClusters.slice(0, 5),
    };
  }
  if (tool === "search_items") {
    const data = result.data as { total: number; items: Array<Record<string, unknown>> };
    return {
      total: data.total,
      items: data.items.map((r) => ({
        id: r.id,
        title: r.titleZh ?? r.title,
        sourceName: r.sourceName,
        platform: r.platform,
        url: r.url,
      })),
    };
  }
  if (tool === "list_trending_clusters") {
    const data = result.data as { total: number; clusters: Array<Record<string, unknown>> };
    return {
      total: data.total,
      clusters: data.clusters.map((r) => ({
        clusterId: r.id,
        topic: r.topic,
        relatedSourceCount: r.distinctSources ?? 1,
      })),
    };
  }
  return result.data;
}
