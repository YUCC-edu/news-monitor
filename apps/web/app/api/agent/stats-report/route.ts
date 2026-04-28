import { NextResponse } from "next/server";
import { resolveAssistantActor } from "@/lib/assistant-auth";
import { makeRequestId, toolError, toolOk } from "@/lib/assistant-contract";
import { runAssistantTool } from "@/lib/assistant-tools";

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? makeRequestId();
  const startedAt = Date.now();
  const actor = resolveAssistantActor(request);
  try {
    const url = new URL(request.url);
    const args: Record<string, unknown> = {
      range: url.searchParams.get("range") ?? "7d",
      minSources: Number(url.searchParams.get("minSources") ?? "2") || 2,
      topN: Number(url.searchParams.get("topN") ?? "10") || 10,
      audience: url.searchParams.get("audience") === "personal" ? "personal" : "public",
    };
    const data = await runAssistantTool({
      requestId,
      actor: actor.actor,
      role: actor.role,
      tool: "stats_report",
      args,
    });
    return NextResponse.json(toolOk("stats_report", requestId, startedAt, data));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(toolError("stats_report", requestId, startedAt, message), {
      status: 400,
    });
  }
}
