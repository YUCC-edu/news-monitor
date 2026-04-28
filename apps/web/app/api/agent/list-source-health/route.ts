import { NextResponse } from "next/server";
import { resolveAssistantActor } from "@/lib/assistant-auth";
import { makeRequestId, toolError, toolOk } from "@/lib/assistant-contract";
import { runAssistantTool } from "@/lib/assistant-tools";

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? makeRequestId();
  const startedAt = Date.now();
  const actor = resolveAssistantActor(request);
  try {
    const data = await runAssistantTool({
      requestId,
      actor: actor.actor,
      role: actor.role,
      tool: "list_source_health",
      args: {},
    }) as {
      total: number;
      sources: Array<Record<string, unknown>>;
    };
    return NextResponse.json(
      toolOk("list_source_health", requestId, startedAt, {
        total: data.total,
        sources: data.sources,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(toolError("list_source_health", requestId, startedAt, message), {
      status: 500,
    });
  }
}
