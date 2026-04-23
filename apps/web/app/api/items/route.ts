import { listItems } from "@news/db";
import { deriveTaxonomyWithMeta } from "@news/shared";
import { NextResponse } from "next/server";

function publishedSinceFromRange(range: string | null): Date | undefined {
  const ms = Date.now();
  switch (range) {
    case "24h":
      return new Date(ms - 24 * 3600 * 1000);
    case "72h":
      return new Date(ms - 72 * 3600 * 1000);
    case "7d":
      return new Date(ms - 7 * 24 * 3600 * 1000);
    case "30d":
      return new Date(ms - 30 * 24 * 3600 * 1000);
    default:
      return undefined;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const before = url.searchParams.get("before");
  const platform = url.searchParams.get("platform") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
  const tagsRaw = url.searchParams.get("tags");
  const tags = tagsRaw
    ? tagsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;
  const feedRaw = url.searchParams.get("feed");
  const feed =
    feedRaw === "curated" ? ("curated" as const) : ("all" as const);
  const range = url.searchParams.get("range");
  const sortRaw = url.searchParams.get("sort");
  const sortBy = sortRaw === "fetched" ? "fetched" : "published";
  const taxonomyOnly =
    url.searchParams.get("taxonomyOnly") === "1" ||
    url.searchParams.get("taxonomyOnly") === "true";
  const publishedSince = publishedSinceFromRange(range);
  const rows = await listItems({
    feed,
    before: before ? new Date(before) : undefined,
    publishedSince,
    platform,
    q,
    limit,
    tags,
    sortBy,
    taxonomyOnly,
  });
  const withMeta = rows.map((row) => {
    const tax = deriveTaxonomyWithMeta({
      title: row.titleZh ?? row.title,
      content: row.contentZh ?? row.contentText,
      tags: row.tags ?? [],
      llmDomain: row.categoryDomain ?? [],
      llmTopic: row.categoryTopic ?? [],
      llmEntity: row.categoryEntity ?? [],
    });
    return {
      ...row,
      categoryMeta: {
        confidence: tax.confidence,
        source: tax.source,
      },
    };
  });
  return NextResponse.json(withMeta);
}
