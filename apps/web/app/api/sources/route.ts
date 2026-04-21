import { NextResponse } from "next/server";
import { listSources, upsertSource } from "@news/db";
import { createLogger } from "@news/shared";
import Redis from "ioredis";
import { enqueueFetchSource } from "@/lib/fetch-source-queue";

let publishRedis: Redis | null = null;
const log = createLogger("api:sources");

function getPublishRedis() {
  if (!publishRedis) {
    publishRedis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
  }
  return publishRedis;
}

export async function GET() {
  const t0 = Date.now();
  try {
    const rows = await listSources();
    log.debug("sources listed", { latencyMs: Date.now() - t0, count: rows.length });
    return NextResponse.json(rows);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error("sources list failed", { errorClass: e instanceof Error ? e.name : typeof e, message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const t0 = Date.now();
  const body = (await request.json()) as {
    kind: "rss" | "hn" | "x-rsshub" | "wechat-wewe";
    name: string;
    config: unknown;
    enabled?: boolean;
    fetchIntervalSec?: number;
    initialFetchDays?: number | null;
    maxItemAgeDays?: number | null;
  };
  const created = await upsertSource(body);
  if (!created) {
    log.warn("source create rejected", { reason: "failed to create source" });
    return NextResponse.json({ error: "failed to create source" }, { status: 400 });
  }
  if ("conflict" in created) {
    log.warn("source create conflict", { kind: body.kind, name: body.name, existingId: created.existing.id });
    return NextResponse.json({ existing: created.existing }, { status: 409 });
  }
  try {
    await getPublishRedis().publish(
      "sources.changed",
      JSON.stringify({ op: "upsert", id: created.id }),
    );
  } catch (e) {
    log.warn("source created but redis publish failed", { sourceId: created.id, error: e });
  }
  try {
    await enqueueFetchSource(created.id);
  } catch (e) {
    log.warn("source created but initial enqueue failed", { sourceId: created.id, error: e });
  }
  log.info("source created", {
    latencyMs: Date.now() - t0,
    sourceId: created.id,
    kind: created.kind,
    fetchIntervalSec: created.fetchIntervalSec,
  });
  return NextResponse.json(created, { status: 201 });
}
