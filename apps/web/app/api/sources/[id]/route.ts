import { NextResponse } from "next/server";
import { deleteSource, resetSourceFirstFetch, upsertSource } from "@news/db";
import { createLogger } from "@news/shared";
import Redis from "ioredis";
import { enqueueFetchSource } from "@/lib/fetch-source-queue";

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const redis = new Redis(redisUrl);
const log = createLogger("api:sources:id");

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const t0 = Date.now();
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
    log.warn("source patch not found", { sourceId: id });
    return NextResponse.json({ error: "source not found" }, { status: 404 });
  }
  if ("conflict" in updated) {
    log.warn("source patch conflict", { sourceId: id, existingId: updated.existing.id });
    return NextResponse.json({ existing: updated.existing }, { status: 409 });
  }
  await redis.publish("sources.changed", JSON.stringify({ op: "upsert", id }));
  await enqueueFetchSource(id);
  log.info("source updated", { sourceId: id, latencyMs: Date.now() - t0, kind: updated.kind });
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const t0 = Date.now();
  const { id } = await params;
  const ok = await deleteSource(id);
  if (!ok) {
    log.warn("source delete not found", { sourceId: id });
    return NextResponse.json({ error: "source not found" }, { status: 404 });
  }
  await redis.publish("sources.changed", JSON.stringify({ op: "delete", id }));
  log.info("source deleted", { sourceId: id, latencyMs: Date.now() - t0 });
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request, { params }: Params) {
  const t0 = Date.now();
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
  log.info("source run now enqueued", { sourceId: id, latencyMs: Date.now() - t0 });
  return NextResponse.json({ ok: true });
}
