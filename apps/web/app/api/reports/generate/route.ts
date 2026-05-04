import { generateAndSaveDailyReport, normalizeReportAudience, normalizeReportRange } from "@news/engine";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    audience?: "public" | "personal";
    range?: "24h" | "72h" | "7d" | "30d" | "90d";
    topN?: number;
    minSources?: number;
  };
  const report = await generateAndSaveDailyReport({
    audience: normalizeReportAudience(body.audience),
    range: normalizeReportRange(body.range),
    topN: Number(body.topN ?? 10) || 10,
    minSources: Number(body.minSources ?? 1) || 1,
    trigger: "manual",
    timezone: process.env.REPORT_TIMEZONE ?? "Asia/Shanghai",
  });
  return NextResponse.json({ report });
}
