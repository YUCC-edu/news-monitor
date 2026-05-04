import { listReports } from "@news/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "30") || 30;
  const reports = await listReports(limit);
  return NextResponse.json({ reports });
}
