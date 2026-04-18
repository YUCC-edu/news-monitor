import { listSourceHealth } from "@news/db";
import { NextResponse } from "next/server";

export async function GET() {
  const rows = await listSourceHealth();
  return NextResponse.json(rows);
}
