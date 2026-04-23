import { getStatsOverview } from "@news/db";
import { createLogger } from "@news/shared";
import { NextResponse } from "next/server";

const log = createLogger("api:stats");
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rangeRaw = url.searchParams.get("range");
    const range = rangeRaw === "30d" || rangeRaw === "90d" || rangeRaw === "custom" ? rangeRaw : "7d";
    const platform = url.searchParams.get("platform")?.trim() || undefined;
    const tag = url.searchParams.get("tag")?.trim() || undefined;
    let compare =
      url.searchParams.get("compare") === "1" ||
      url.searchParams.get("compare") === "true";
    const startRaw = url.searchParams.get("start");
    const endRaw = url.searchParams.get("end");
    const from = range === "custom" && startRaw ? new Date(startRaw) : undefined;
    let to = range === "custom" && endRaw ? new Date(endRaw) : undefined;
    if (range === "custom" && to && /^\d{4}-\d{2}-\d{2}$/.test(endRaw ?? "")) {
      to = new Date(to.getTime() + 24 * 3600 * 1000);
    }
    if (range === "custom") {
      if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return NextResponse.json(
          { code: "stats_invalid_range", error: "自定义时间范围无效，请选择开始与结束日期" },
          { status: 400, headers: NO_STORE_HEADERS },
        );
      }
      if (from >= to) {
        return NextResponse.json(
          { code: "stats_invalid_range", error: "开始日期必须早于结束日期" },
          { status: 400, headers: NO_STORE_HEADERS },
        );
      }
      const spanDays = (to.getTime() - from.getTime()) / (24 * 3600 * 1000);
      if (spanDays > 180) {
        return NextResponse.json(
          { code: "stats_invalid_range", error: "自定义范围最多支持 180 天" },
          { status: 400, headers: NO_STORE_HEADERS },
        );
      }
    }
    if (range === "custom") compare = false;
    const clusterSortRaw = url.searchParams.get("clusterSort");
    const clusterSort =
      clusterSortRaw === "sources" ||
      clusterSortRaw === "items" ||
      clusterSortRaw === "recency" ||
      clusterSortRaw === "cohesion"
        ? clusterSortRaw
        : "hybrid";
    const topNRaw = Number.parseInt(url.searchParams.get("topN") ?? "", 10);
    const topN = Number.isFinite(topNRaw) ? topNRaw : undefined;
    const minSourcesRaw = Number.parseInt(url.searchParams.get("minSources") ?? "", 10);
    const minSources = Number.isFinite(minSourcesRaw) ? minSourcesRaw : undefined;
    const data = await getStatsOverview({
      range,
      platform,
      tag,
      compare,
      topN,
      minSources,
      clusterSort,
      from,
      to,
    });
    log.debug("stats loaded", { range, platform, compare, minSources, clusterSort, topN });
    return NextResponse.json(data, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to load stats overview";
    log.error("stats load failed", {
      errorClass: error instanceof Error ? error.name : typeof error,
      message,
      url: request.url,
    });
    return NextResponse.json(
      { code: "stats_fetch_failed", error: message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
