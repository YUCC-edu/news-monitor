import { getLlmClient } from "@news/ai";
import { NextResponse } from "next/server";
import { checkAssistantWritePermission, resolveAssistantActor } from "@/lib/assistant-auth";
import {
  buildAddSourceAction,
  buildAddSourceExecutionFeedback,
  buildCannedAnswer,
  buildSuggestedRecoveryActions,
  detectAssistantIntent,
  pickStatsRangeFromMessage,
} from "@/lib/assistant-canned";
import { makeRequestId } from "@/lib/assistant-contract";
import { checkAssistantRateLimit } from "@/lib/assistant-rate-limit";
import { runAssistantTool, type AssistantToolName } from "@/lib/assistant-tools";

type ActionCard = {
  id: string;
  tool: AssistantToolName;
  label: string;
  args: Record<string, unknown>;
  requiresConfirmation: boolean;
  mode?: "execute" | "navigate";
  targetPath?: string;
};

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? makeRequestId();
  const actor = resolveAssistantActor(request);
  const quota = await checkAssistantRateLimit(`${actor.actor}:chat`, 45);
  if (!quota.ok) {
    return NextResponse.json(
      { ok: false, requestId, error: "rate limit exceeded, please retry later" },
      { status: 429 },
    );
  }
  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    pageContext?: { path?: string; filters?: Record<string, unknown> };
    action?: { tool: AssistantToolName; args: Record<string, unknown>; confirm?: boolean };
  };

  try {
    if (body.action) {
      if (!body.action.confirm) {
        return NextResponse.json({
          ok: true,
          requestId,
          answer: "该操作需要确认后执行。",
          actions: [toActionCard(body.action.tool, body.action.args)],
          traces: [],
        });
      }
      const isWriteTool =
        body.action.tool === "add_source" ||
        body.action.tool === "trigger_fetch_source" ||
        body.action.tool === "trigger_reenrich";
      if (isWriteTool) {
        const gate = checkAssistantWritePermission(request);
        if (!gate.allowed) {
          return NextResponse.json(
            { ok: false, requestId, error: gate.reason ?? "forbidden" },
            { status: 403 },
          );
        }
      }
      const executionRole = isWriteTool ? "assistant_write_low" : actor.role;
      const data = await runAssistantTool({
        requestId,
        actor: actor.actor,
        role: executionRole,
        tool: body.action.tool,
        args: body.action.args,
      });
      if (body.action.tool === "add_source") {
        const result = data as
          | { conflict: true; existing: { id: string; name: string; kind: string } }
          | { conflict: false; source?: { id: string; name: string; kind: string } };
        const feedback = buildAddSourceExecutionFeedback(result, body.pageContext?.path ?? "/sources");
        return NextResponse.json({
          ok: true,
          requestId,
          stage: feedback.nextStage,
          answer: feedback.answer,
          actions: feedback.actions,
          traces: [{ tool: body.action.tool, ok: true, data }],
        });
      }
      return NextResponse.json({
        ok: true,
        requestId,
        stage: "reported",
        answer: `已执行 ${body.action.tool}。`,
        actions: [],
        traces: [{ tool: body.action.tool, ok: true, data }],
      });
    }

    const message = String(body.message ?? "").trim();
    if (!message) {
      return NextResponse.json({ ok: false, requestId, error: "message is required" }, { status: 400 });
    }

    // Deterministic canned routing first, then LLM fallback.
    const intent = detectAssistantIntent(message);
    if (intent === "add_source") {
      return NextResponse.json({
        ok: true,
        requestId,
        stage: "action_proposed",
        answer: buildCannedAnswer("add_source"),
        actions: [buildAddSourceAction(message)],
        traces: [],
      });
    }

    if (intent === "stats") {
      const range = pickStatsRangeFromMessage(message);
      const result = await runAssistantTool({
        requestId,
        actor: actor.actor,
        role: actor.role,
        tool: "stats_report",
        args: { range, minSources: 2 },
      });
      const data = result as {
        totals: { items_window: number; clusters_window: number };
        hotspot: { hotspotIndex: number };
      };
      return NextResponse.json({
        ok: true,
        requestId,
        stage: "reported",
        answer: buildCannedAnswer("stats", {
          range,
          totalItems: data.totals.items_window,
          totalClusters: data.totals.clusters_window,
          hotspotIndex: data.hotspot.hotspotIndex,
        }),
        actions: [],
        traces: [{ tool: "stats_report", ok: true, data }],
      });
    }

    if (intent === "health") {
      const data = await runAssistantTool({
        requestId,
        actor: actor.actor,
        role: actor.role,
        tool: "list_source_health",
        args: {},
      }) as { total: number; sources?: Array<{ failCountRecent?: number | null }> };
      const highRiskSources = (data.sources ?? []).filter(
        (row) => Number(row.failCountRecent ?? 0) >= 3,
      ).length;
      return NextResponse.json({
        ok: true,
        requestId,
        stage: "reported",
        answer: buildCannedAnswer("health", {
          totalSources: data.total,
          highRiskSources,
        }),
        actions: [],
        traces: [{ tool: "list_source_health", ok: true, data }],
      });
    }

    const llmAnswer = await llmReply({
      message,
      path: body.pageContext?.path ?? "/",
      requestId,
    });
    return NextResponse.json({
      ok: true,
      requestId,
      stage: "reported",
      answer: llmAnswer,
      actions: [],
      traces: [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        requestId,
        error: error instanceof Error ? error.message : String(error),
        suggestions: buildSuggestedRecoveryActions(
          error instanceof Error ? error.message : String(error),
        ),
      },
      { status: 500 },
    );
  }
}

function toActionCard(tool: AssistantToolName, args: Record<string, unknown>): ActionCard {
  return {
    id: `${tool}-${Date.now()}`,
    tool,
    label: tool === "add_source" ? "确认新增信源" : `确认执行 ${tool}`,
    args,
    requiresConfirmation: true,
  };
}

async function llmReply(input: { message: string; path: string; requestId: string }) {
  try {
    const llm = getLlmClient();
    const raw = await llm.chatJson({
      system:
        "你是 news-monitor 的站内助手。请基于用户问题，输出 JSON：{\"answer\":\"...\"}。回答中文，简洁、可执行。",
      user: `requestId=${input.requestId}\npath=${input.path}\nquestion=${input.message}`,
    });
    const parsed = JSON.parse(raw) as { answer?: string };
    return parsed.answer?.trim() || "我已收到你的问题，但当前未能生成结构化回答。";
  } catch {
    return "我已收到你的问题。当前 LLM 服务不可用，你可以先问我统计、信源健康或让我新增信源。";
  }
}
