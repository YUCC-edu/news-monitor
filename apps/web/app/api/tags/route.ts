import { listTagCounts } from "@news/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = Number.parseInt(url.searchParams.get("days") ?? "30", 10);
  const rows = await listTagCounts(Number.isFinite(days) ? days : 30);
  return NextResponse.json(rows);
}
