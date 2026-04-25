import { executeCapability } from "@news/engine";
import { NextResponse } from "next/server";
import { makeRequestId, toolError, toolOk } from "@/lib/assistant-contract";

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? makeRequestId();
  const startedAt = Date.now();
  try {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "20"), 1), 100);
    const result = await executeCapability("clusters.list", {
      limit,
      range: "7d",
      minSources: 2,
      clusterSort: "hybrid",
    });
    if (!result.ok) {
      return NextResponse.json(toolError("list_trending_clusters", requestId, startedAt, result.error.message), {
        status: 400,
      });
    }
    const data = result.data as {
      total: number;
      clusters: Array<{ id: string; topic: string | null; distinctSources?: number | null }>;
    };
    return NextResponse.json(
      toolOk("list_trending_clusters", requestId, startedAt, {
        total: data.total,
        clusters: data.clusters.map((r) => ({
          clusterId: r.id,
          topic: r.topic,
          relatedSourceCount: r.distinctSources ?? 1,
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
