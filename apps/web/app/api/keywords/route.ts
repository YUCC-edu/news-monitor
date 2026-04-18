import { createKeywordRule, listKeywordRules } from "@news/db";
import { NextResponse } from "next/server";

export async function GET() {
  const rows = await listKeywordRules();
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    pattern: string;
    isRegex?: boolean;
    notify?: boolean;
  };
  if (!body.pattern?.trim()) {
    return NextResponse.json({ error: "pattern is required" }, { status: 400 });
  }
  const created = await createKeywordRule({
    pattern: body.pattern.trim(),
    isRegex: body.isRegex ?? false,
    notify: body.notify ?? true,
  });
  return NextResponse.json(created, { status: 201 });
}
