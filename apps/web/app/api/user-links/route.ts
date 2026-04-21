import { addUserLink, listUserLinks } from "@news/db";
import { NextResponse } from "next/server";

export async function GET() {
  const rows = await listUserLinks(200);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = (await request.json()) as { url?: string; note?: string | null };
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }
  const row = await addUserLink(url, body.note ?? null);
  if (!row) {
    return NextResponse.json({ error: "failed to save" }, { status: 500 });
  }
  return NextResponse.json(row);
}
