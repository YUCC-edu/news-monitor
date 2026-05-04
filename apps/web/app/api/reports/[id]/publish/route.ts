import { enqueuePublishReport, normalizeReportTargets } from "@news/engine";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as {
    targetKinds?: Array<"wechat" | "feishu" | "obsidian">;
  };
  const targetKinds = normalizeReportTargets(body.targetKinds);
  if (Array.isArray(body.targetKinds) && body.targetKinds.length > 0 && !targetKinds) {
    return NextResponse.json({ error: "invalid publish targets" }, { status: 400 });
  }
  await enqueuePublishReport({
    reportId: id,
    targetKinds,
    trigger: "manual",
  });
  return NextResponse.json({ ok: true, queued: true });
}
