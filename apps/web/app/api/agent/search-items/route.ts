import { executeCapability } from "@news/engine";
import { NextResponse } from "next/server";
import { makeRequestId, toolError, toolOk } from "@/lib/assistant-contract";

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? makeRequestId();
  const startedAt = Date.now();
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "20"), 1), 100);
    const sortBy = url.searchParams.get("sort") === "fetched" ? "fetched" : "published";
    const result = await executeCapability("items.search", {
      q,
      limit,
      sortBy,
      range: "7d",
    });
    if (!result.ok) {
      return NextResponse.json(toolError("search_items", requestId, startedAt, result.error.message), {
        status: 400,
      });
    }
    const data = result.data as {
      total: number;
      items: Array<{
        id: string;
        title?: string | null;
        titleZh?: string | null;
        sourceName: string;
        platform: string;
        publishedAt?: string | null;
        fetchedAt: string;
        tags?: string[] | null;
        categoryDomain?: string[] | null;
        categoryTopic?: string[] | null;
        categoryEntity?: string[] | null;
        url?: string | null;
      }>;
    };
    return NextResponse.json(
      toolOk("search_items", requestId, startedAt, {
        total: data.total,
        items: data.items.map((r) => ({
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
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(toolError("search_items", requestId, startedAt, message), {
      status: 500,
    });
  }
}
