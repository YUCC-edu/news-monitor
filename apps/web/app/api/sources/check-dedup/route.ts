import { computeDedupKey, findSourceByDedup } from "@news/db";
import type { SourceKind } from "@news/db";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    kind: SourceKind;
    config: unknown;
  };
  if (!body.kind) {
    return NextResponse.json({ error: "kind required" }, { status: 400 });
  }
  const dedupKey = computeDedupKey(body.kind, body.config);
  const existing = await findSourceByDedup(body.kind, dedupKey);
  return NextResponse.json({ existing: existing ?? null, dedupKey });
}
