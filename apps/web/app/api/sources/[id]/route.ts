import { NextResponse } from "next/server";
import { deleteSource, resetSourceFirstFetch, upsertSource } from "@news/db";
import Redis from "ioredis";
import { enqueueFetchSource } from "@/lib/fetch-source-queue";

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const redis = new Redis(redisUrl);

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json()) as {
    kind: "rss" | "hn" | "x-rsshub" | "wechat-wewe";
    name: string;
    config: unknown;
    enabled?: boolean;
    fetchIntervalSec?: number;
    initialFetchDays?: number | null;
    maxItemAgeDays?: number | null;
  };
  const updated = await upsertSource({ id, ...body });
  if (!updated) {
    return NextResponse.json({ error: "source not found" }, { status: 404 });
  }
  if ("conflict" in updated) {
    return NextResponse.json({ existing: updated.existing }, { status: 409 });
  }
  await redis.publish("sources.changed", JSON.stringify({ op: "upsert", id }));
  await enqueueFetchSource(id);
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const ok = await deleteSource(id);
  if (!ok) {
    return NextResponse.json({ error: "source not found" }, { status: 404 });
  }
  await redis.publish("sources.changed", JSON.stringify({ op: "delete", id }));
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const body = (await request.json()) as { resetFirstFetch?: boolean };
    if (body?.resetFirstFetch) {
      await resetSourceFirstFetch(id);
      await redis.publish("sources.changed", JSON.stringify({ op: "upsert", id }));
    }
  } catch {
    /* no body */
  }
  await enqueueFetchSource(id);
  return NextResponse.json({ ok: true });
}
