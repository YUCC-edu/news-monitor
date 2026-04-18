import { NextResponse } from "next/server";
import { listSources, upsertSource } from "@news/db";
import Redis from "ioredis";
import { enqueueFetchSource } from "@/lib/fetch-source-queue";

let publishRedis: Redis | null = null;

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
  try {
    const rows = await listSources();
    return NextResponse.json(rows);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api/sources GET]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
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
    return NextResponse.json({ error: "failed to create source" }, { status: 400 });
  }
  if ("conflict" in created) {
    return NextResponse.json({ existing: created.existing }, { status: 409 });
  }
  try {
    await getPublishRedis().publish(
      "sources.changed",
      JSON.stringify({ op: "upsert", id: created.id }),
    );
  } catch (e) {
    console.error("[api/sources POST] redis publish", e);
  }
  try {
    await enqueueFetchSource(created.id);
  } catch (e) {
    console.error("[api/sources POST] enqueue fetch-source", e);
  }
  return NextResponse.json(created, { status: 201 });
}
