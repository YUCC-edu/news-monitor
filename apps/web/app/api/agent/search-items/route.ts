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
    const q = (url.searchParams.get("q") ?? "").trim();
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "20"), 1), 100);
    const sortBy = url.searchParams.get("sort") === "fetched" ? "fetched" : "published";
    const data = await runAssistantTool({
      requestId,
      actor: actor.actor,
      role: actor.role,
      tool: "search_items",
      args: {
      q,
      limit,
      sortBy,
      range: "7d",
      },
    }) as { total: number; items: Array<Record<string, unknown>> };
    return NextResponse.json(
      toolOk("search_items", requestId, startedAt, {
        total: data.total,
        items: data.items.map((r) => ({
          id: r.id,
          title: r.title,
          sourceName: r.sourceName,
          platform: r.platform,
          url: r.url,
        })),
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(toolError("search_items", requestId, startedAt, message), {
      status: 500,
    });
  }
}
