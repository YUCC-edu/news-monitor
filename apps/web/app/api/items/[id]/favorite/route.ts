import { addFavorite, removeFavorite } from "@news/db";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  let note: string | undefined;
  try {
    const body = (await request.json()) as { note?: string };
    note = body?.note;
  } catch {
    // no body
  }
  await addFavorite(id, note);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const ok = await removeFavorite(id);
  return NextResponse.json({ ok });
}
