import { getPublishAttempt } from "@news/db";
import { enqueuePublishReport } from "@news/engine";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string; attemptId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id, attemptId } = await params;
  const attempt = await getPublishAttempt(attemptId);
  if (!attempt || attempt.reportId !== id) {
    return NextResponse.json({ error: "publish attempt not found" }, { status: 404 });
  }
  await enqueuePublishReport({
    reportId: id,
    targetKinds: [attempt.targetKind as "wechat" | "feishu" | "obsidian"],
    trigger: "retry",
  });
  return NextResponse.json({ ok: true, queued: true });
}
