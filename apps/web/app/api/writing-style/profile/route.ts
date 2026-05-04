import {
  ensureDefaultWritingStyleProfile,
  getActiveWritingStyleProfile,
  listWritingStyleSamples,
  updateWritingStyleProfile,
} from "@news/db";
import { NextResponse } from "next/server";

export async function GET() {
  const profile = await getActiveWritingStyleProfile();
  const samples = profile ? await listWritingStyleSamples(20, profile.id) : [];
  return NextResponse.json({ profile, samples });
}

export async function PUT(request: Request) {
  const current = await ensureDefaultWritingStyleProfile();
  if (!current) return NextResponse.json({ error: "style profile unavailable" }, { status: 500 });
  const body = await request.json().catch(() => ({})) as {
    name?: string;
    description?: string | null;
    rules?: unknown;
  };
  const profile = await updateWritingStyleProfile({
    id: current.id,
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : undefined,
    description: body.description === null || typeof body.description === "string" ? body.description : undefined,
    rules: body.rules,
  });
  return NextResponse.json({ profile });
}
