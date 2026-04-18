import { getStatsOverview } from "@news/db";
import { NextResponse } from "next/server";

export async function GET() {
  const data = await getStatsOverview();
  return NextResponse.json(data);
}
