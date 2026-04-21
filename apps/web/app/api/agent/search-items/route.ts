import { listItems } from "@news/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "20"), 1), 100);
  const sortBy = url.searchParams.get("sort") === "fetched" ? "fetched" : "published";
  const rows = await listItems({
    feed: "all",
    q,
    limit,
    sortBy,
  });
  return NextResponse.json({
    tool: "search_items",
    total: rows.length,
    items: rows.map((r) => ({
      id: r.id,
      title: r.titleZh ?? r.title,
      sourceName: r.sourceName,
      platform: r.platform,
      publishedAt: r.publishedAt,
      fetchedAt: r.fetchedAt,
      tags: r.tags ?? [],
      categoryDomain: r.categoryDomain ?? [],
      categoryTopic: r.categoryTopic ?? [],
      categoryEntity: r.categoryEntity ?? [],
      url: r.url,
    })),
  });
}
