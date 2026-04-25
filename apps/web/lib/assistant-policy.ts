import type { AssistantToolName } from "./assistant-tools";

export type AssistantToolCapabilities = {
  writesBusinessData: boolean;
  writesSystemFiles: boolean;
  writesSystemConfig: boolean;
};

const DEFAULT_CAPABILITIES: AssistantToolCapabilities = {
  writesBusinessData: false,
  writesSystemFiles: false,
  writesSystemConfig: false,
};

const TOOL_CAPABILITIES: Record<AssistantToolName, AssistantToolCapabilities> = {
  search_items: DEFAULT_CAPABILITIES,
  list_trending_clusters: DEFAULT_CAPABILITIES,
  list_source_health: DEFAULT_CAPABILITIES,
  stats_report: DEFAULT_CAPABILITIES,
  add_source: {
    writesBusinessData: true,
    writesSystemFiles: false,
    writesSystemConfig: false,
  },
  trigger_fetch_source: {
    writesBusinessData: true,
    writesSystemFiles: false,
    writesSystemConfig: false,
  },
  trigger_reenrich: {
    writesBusinessData: true,
    writesSystemFiles: false,
    writesSystemConfig: false,
  },
};

export function getToolCapabilities(tool: AssistantToolName): AssistantToolCapabilities {
  return TOOL_CAPABILITIES[tool];
}

export function isToolAllowedByPolicy(tool: string): tool is AssistantToolName {
  if (!(tool in TOOL_CAPABILITIES)) return false;
  const capabilities = TOOL_CAPABILITIES[tool as AssistantToolName];
  return !capabilities.writesSystemFiles && !capabilities.writesSystemConfig;
}

export function buildPolicyRejectionMessage(tool: string) {
  return `tool "${tool}" rejected by policy: system file/config writes are not allowed`;
}
