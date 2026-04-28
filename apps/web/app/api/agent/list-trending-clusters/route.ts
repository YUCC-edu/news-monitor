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
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "20"), 1), 100);
    const data = await runAssistantTool({
      requestId,
      actor: actor.actor,
      role: actor.role,
      tool: "list_trending_clusters",
      args: {
      limit,
      minSources: Number(url.searchParams.get("minSources") ?? "2") || 2,
      },
    }) as {
      total: number;
      clusters: Array<{ clusterId: string; topic: string | null; relatedSourceCount?: number | null }>;
    };
    return NextResponse.json(
      toolOk("list_trending_clusters", requestId, startedAt, {
        total: data.total,
        clusters: data.clusters.map((r) => ({
          clusterId: r.clusterId,
          topic: r.topic,
          relatedSourceCount: r.relatedSourceCount ?? 1,
          representativeItem: null,
        })),
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(toolError("list_trending_clusters", requestId, startedAt, message), {
      status: 500,
    });
  }
}
