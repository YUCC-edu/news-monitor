import { NextResponse } from "next/server";
import { checkAssistantWritePermission, resolveAssistantActor } from "@/lib/assistant-auth";
import { makeRequestId, toolError, toolOk } from "@/lib/assistant-contract";
import { checkAssistantRateLimit } from "@/lib/assistant-rate-limit";
import { runAssistantTool } from "@/lib/assistant-tools";

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? makeRequestId();
  const startedAt = Date.now();
  const actor = resolveAssistantActor(request);
  const quota = await checkAssistantRateLimit(`${actor.actor}:add_source`, 20);
  if (!quota.ok) {
    return NextResponse.json(
      toolError("add_source", requestId, startedAt, "rate limit exceeded, please retry later"),
      { status: 429 },
    );
  }
  const writeGate = checkAssistantWritePermission(request);
  if (!writeGate.allowed) {
    return NextResponse.json(
      toolError("add_source", requestId, startedAt, writeGate.reason ?? "forbidden"),
      { status: 403 },
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const data = await runAssistantTool({
      requestId,
      actor: actor.actor,
      role: actor.role,
      tool: "add_source",
      args: body,
    });
    return NextResponse.json(toolOk("add_source", requestId, startedAt, data), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(toolError("add_source", requestId, startedAt, message), {
      status: 400,
    });
  }
}
