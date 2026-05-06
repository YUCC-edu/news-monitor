import { executeCapability } from "@news/engine";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = await executeCapability("wechatDraft.create", body);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
