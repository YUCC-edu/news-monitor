import { deleteKeywordRule, updateKeywordRule } from "@news/db";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json()) as {
    pattern: string;
    isRegex?: boolean;
    notify?: boolean;
  };
  if (!body.pattern?.trim()) {
    return NextResponse.json({ error: "pattern is required" }, { status: 400 });
  }
  const updated = await updateKeywordRule(id, {
    pattern: body.pattern.trim(),
    isRegex: body.isRegex ?? false,
    notify: body.notify ?? true,
  });
  if (!updated) return NextResponse.json({ error: "rule not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const ok = await deleteKeywordRule(id);
  if (!ok) return NextResponse.json({ error: "rule not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
