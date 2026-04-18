import { listRecentItemsBySource } from "@news/db";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const url = new URL(request.url);
  const limit = Math.min(
    Math.max(Number.parseInt(url.searchParams.get("limit") ?? "10", 10) || 10, 1),
    50,
  );
  const rows = await listRecentItemsBySource(id, limit);
  return NextResponse.json(rows);
}
