import { executeCapability } from "@news/engine";
import { NextResponse } from "next/server";
import {
  buildTimelineBlocks,
  DEFAULT_TIMELINE_ALL_RAW_LIMIT,
  DEFAULT_TIMELINE_ALL_VISIBLE_LIMIT,
  DEFAULT_TIMELINE_COLLAPSE_THRESHOLD,
  DEFAULT_TIMELINE_COLLAPSE_WINDOW_HOURS,
  type TimelineItemRecord,
} from "@/lib/timeline-blocks";

function parsePositiveInt(raw: string | null, fallback: number) {
  const value = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const before = url.searchParams.get("before");
  const platform = url.searchParams.get("platform") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;
  const limitRaw = url.searchParams.get("limit");
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
  const audienceRaw = url.searchParams.get("audience");
  const audience =
    audienceRaw === "public"
      ? ("public" as const)
      : audienceRaw === "personal"
        ? ("personal" as const)
        : feed === "curated"
          ? ("public" as const)
          : ("personal" as const);
  const sortRaw = url.searchParams.get("sort");
  const sortBy = sortRaw === "fetched" ? "fetched" : "published";
  const taxonomyOnly =
    url.searchParams.get("taxonomyOnly") === "1" ||
    url.searchParams.get("taxonomyOnly") === "true";
  const capability = feed === "curated" ? "hotspots.list" : "items.search";
  const visibleLimit = Math.min(
    parsePositiveInt(limitRaw, DEFAULT_TIMELINE_ALL_VISIBLE_LIMIT),
    DEFAULT_TIMELINE_ALL_RAW_LIMIT,
  );
  const rawLimit =
    feed === "all" && !taxonomyOnly
      ? Math.min(
          Math.max(
            parsePositiveInt(
              url.searchParams.get("rawLimit"),
              Number.parseInt(process.env.TIMELINE_ALL_RAW_LIMIT ?? "", 10) ||
                DEFAULT_TIMELINE_ALL_RAW_LIMIT,
            ),
            visibleLimit,
          ),
          DEFAULT_TIMELINE_ALL_RAW_LIMIT,
        )
      : visibleLimit;
  const result = await executeCapability(capability, {
    before: before ?? undefined,
    platform,
    q,
    limit: rawLimit,
    tags,
    range: range ?? undefined,
    audience,
    sortBy,
    taxonomyOnly,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error.message, code: result.error.code }, { status: 400 });
  }
  const data = result.data as { hotspots?: unknown[]; items?: unknown[] };
  if (capability === "hotspots.list") {
    return NextResponse.json(data.hotspots ?? []);
  }
  const items = Array.isArray(data.items) ? (data.items as TimelineItemRecord[]) : [];
  if (taxonomyOnly) {
    return NextResponse.json(items.slice(0, visibleLimit));
  }
  const collapseHighVolume =
    url.searchParams.get("collapseHighVolume") !== "0" &&
    url.searchParams.get("collapseHighVolume") !== "false";
  const collapseWindowHours = parsePositiveInt(
    url.searchParams.get("collapseWindowHours"),
    Number.parseInt(process.env.TIMELINE_COLLAPSE_WINDOW_HOURS ?? "", 10) ||
      DEFAULT_TIMELINE_COLLAPSE_WINDOW_HOURS,
  );
  const collapseThreshold = parsePositiveInt(
    url.searchParams.get("collapseThreshold"),
    Number.parseInt(process.env.TIMELINE_COLLAPSE_THRESHOLD ?? "", 10) ||
      DEFAULT_TIMELINE_COLLAPSE_THRESHOLD,
  );
  const blocks = buildTimelineBlocks(items, {
    collapseHighVolume,
    collapseWindowHours,
    collapseThreshold,
  });
  return NextResponse.json(blocks.slice(0, visibleLimit));
}
