import { executeCapability, type ParsedCapabilityInput } from "@news/engine";
import { NextResponse } from "next/server";

type ReEnrichInput = ParsedCapabilityInput<"ops.reenrich">;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<ReEnrichInput>;
  const result = await executeCapability("ops.reenrich", body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error.message, code: result.error.code }, { status: 400 });
  }
  const data = result.data as { queued: number; itemIds: string[] };
  return NextResponse.json({ ok: true, ...data });
}
