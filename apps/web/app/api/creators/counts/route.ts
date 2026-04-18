import { listItemCountsBySource } from "@news/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const rows = await listItemCountsBySource();
    return NextResponse.json(rows);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api/creators/counts GET]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
