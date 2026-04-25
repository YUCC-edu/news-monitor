import type { AssistantToolName } from "./assistant-tools";

export type AssistantIntent = "add_source" | "stats" | "health" | "general";

export type ActionCard = {
  id: string;
  tool: AssistantToolName;
  label: string;
  args: Record<string, unknown>;
  requiresConfirmation: boolean;
  mode?: "execute" | "navigate";
  targetPath?: string;
};

type ExistingSourceLite = {
  id: string;
  name: string;
  kind: string;
};

export function detectAssistantIntent(message: string): AssistantIntent {
  if (/(新增信源|add source|添加信源|rss\s+信源)/i.test(message)) return "add_source";
  if (/(统计|stats|报告)/i.test(message)) return "stats";
  if (/(健康|health|信源状态)/i.test(message)) return "health";
  return "general";
}

export function pickStatsRangeFromMessage(message: string): "7d" | "30d" | "90d" {
  if (/(90|90d)/i.test(message)) return "90d";
  if (/(30|30d)/i.test(message)) return "30d";
  return "7d";
}

export function extractFeedUrl(message: string) {
  return message.match(/https?:\/\/\S+/)?.[0] ?? null;
}

export function buildAddSourceAction(message: string): ActionCard {
  const url = extractFeedUrl(message) ?? "https://example.com/feed.xml";
  return {
    id: `add_source-${Date.now()}`,
    tool: "add_source",
    label: "确认新增信源",
    requiresConfirmation: true,
    mode: "execute",
    args: {
      kind: "rss",
      name: `Assistant Source ${new Date().toLocaleTimeString()}`,
      config: { feedUrl: url },
      fetchIntervalSec: 600,
      initialFetchDays: 1,
    },
  };
}

export function buildOpenExistingSourceAction(existing: ExistingSourceLite): ActionCard {
  return {
    id: `open-source-${existing.id}`,
    tool: "search_items",
    label: `打开已存在来源：${existing.name}`,
    requiresConfirmation: false,
    mode: "navigate",
    targetPath: `/sources?focus=${encodeURIComponent(existing.id)}`,
    args: {
      sourceId: existing.id,
      sourceName: existing.name,
      sourceKind: existing.kind,
    },
  };
}

export function buildAddSourceExecutionFeedback(
  data: { conflict: true; existing: ExistingSourceLite } | { conflict: false; source?: ExistingSourceLite },
  pagePath = "/sources",
) {
  if (data.conflict) {
    return {
      answer: `来源已存在（未新增）：${data.existing.name}（${data.existing.kind}）。我已为你准备“打开已有来源”入口。`,
      actions: [buildOpenExistingSourceAction(data.existing)],
      nextStage: "reported" as const,
    };
  }

  const sourceName = data.source?.name ?? "该来源";
  const sourceId = data.source?.id;
  return {
    answer: `新增成功：${sourceName}${sourceId ? `（${sourceId}）` : ""}。你可以回到来源页继续检查抓取状态。`,
    actions: sourceId
      ? [
          {
            id: `open-source-${sourceId}`,
            tool: "search_items" as const,
            label: "查看新增来源",
            requiresConfirmation: false,
            mode: "navigate" as const,
            targetPath: `${pagePath.includes("?") ? pagePath : "/sources"}${pagePath.includes("?") ? "&" : "?"}focus=${encodeURIComponent(sourceId)}`,
            args: { sourceId },
          },
        ]
      : [],
    nextStage: "reported" as const,
  };
}

export function buildCannedAnswer(
  intent: AssistantIntent,
  context: {
    range?: string;
    totalItems?: number;
    totalClusters?: number;
    hotspotIndex?: number;
    attentionIndex?: number;
    totalSources?: number;
    highRiskSources?: number;
  } = {},
) {
  if (intent === "stats") {
    return `统计摘要：${context.range ?? "7d"} 范围内条目 ${context.totalItems ?? 0}，活跃簇 ${context.totalClusters ?? 0}，值得关注度 ${(context.attentionIndex ?? context.hotspotIndex ?? 0).toFixed(2)}。`;
  }
  if (intent === "health") {
    return `当前共有 ${context.totalSources ?? 0} 个信源，高风险 ${context.highRiskSources ?? 0} 个。建议优先处理连续失败源并触发重抓。`;
  }
  if (intent === "add_source") {
    return "我可以帮你新增 RSS 信源。请确认后执行。";
  }
  return "我已收到你的问题。你可以让我查看统计、信源健康，或者执行新增信源。";
}

export function buildSuggestedRecoveryActions(errorMessage: string) {
  const msg = errorMessage.toLowerCase();
  if (msg.includes("permission denied") || msg.includes("forbidden")) {
    return ["检查 x-assistant-role 是否为 assistant_write_low", "确认 ASSISTANT_API_KEY 与请求头 x-assistant-key 一致"];
  }
  if (msg.includes("assistant_actions") && msg.includes("does not exist")) {
    return ["执行数据库迁移：pnpm --filter @news/db migrate", "重启 web 与 worker 重新加载连接"];
  }
  if (msg.includes("rate limit")) {
    return ["等待 1 分钟后重试", "减少短时间内重复请求"];
  }
  return ["稍后重试", "如果持续失败，请附带 requestId 与错误信息反馈"];
}

export function shouldAutoScrollToBottom(input: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  threshold?: number;
}) {
  const threshold = input.threshold ?? 48;
  return input.scrollTop + input.clientHeight >= input.scrollHeight - threshold;
}
