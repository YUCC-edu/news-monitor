import { NextResponse } from "next/server";
import { checkAssistantWritePermission, resolveAssistantActor } from "@/lib/assistant-auth";
import { makeRequestId, toolError, toolOk } from "@/lib/assistant-contract";
import { runAssistantTool } from "@/lib/assistant-tools";

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? makeRequestId();
  const startedAt = Date.now();
  const actor = resolveAssistantActor(request);
  const gate = checkAssistantWritePermission(request);
  if (!gate.allowed) {
    return NextResponse.json(toolError("trigger_reenrich", requestId, startedAt, gate.reason ?? "forbidden"), {
      status: 403,
    });
  }

  const body = (await request.json().catch(() => ({}))) as {
    scope?: "source" | "window" | "item";
    sourceId?: string;
    since?: string;
    until?: string;
    itemId?: string;
    limit?: number;
  };
  const scope = body.scope;
  if (scope !== "source" && scope !== "window" && scope !== "item") {
    return NextResponse.json(
      toolError("trigger_reenrich", requestId, startedAt, "scope must be source | window | item"),
      { status: 400 },
    );
  }
  try {
    const data = await runAssistantTool({
      requestId,
      actor: actor.actor,
      role: "assistant_write_low",
      tool: "trigger_reenrich",
      args: body as Record<string, unknown>,
    });
    return NextResponse.json(toolOk("trigger_reenrich", requestId, startedAt, data));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(toolError("trigger_reenrich", requestId, startedAt, message), {
      status: 400,
    });
  }
}
