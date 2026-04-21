import { listItems } from "@news/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "20"), 1), 100);
  const rows = await listItems({ feed: "curated", limit, sortBy: "published" });
  return NextResponse.json({
    tool: "list_trending_clusters",
    total: rows.length,
    clusters: rows.map((r) => ({
      clusterId: r.clusterId,
      topic: r.clusterTopic,
      relatedSourceCount: r.relatedCount ?? 1,
      representativeItem: {
        id: r.id,
        title: r.titleZh ?? r.title,
        sourceName: r.sourceName,
        publishedAt: r.publishedAt,
        fetchedAt: r.fetchedAt,
        url: r.url,
      },
    })),
  });
}
