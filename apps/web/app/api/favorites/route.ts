import { listFavorites } from "@news/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
  const rows = await listFavorites(Number.isFinite(limit) ? limit : 100);
  return NextResponse.json(rows);
}
