import { mergeSources } from "@news/db";
import Redis from "ioredis";
import { NextResponse } from "next/server";

const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");

export async function POST(request: Request) {
  const body = (await request.json()) as {
    keepId: string;
    dropIds: string[];
  };
  if (!body.keepId || !Array.isArray(body.dropIds) || body.dropIds.length === 0) {
    return NextResponse.json({ error: "keepId and dropIds required" }, { status: 400 });
  }
  if (body.dropIds.includes(body.keepId)) {
    return NextResponse.json({ error: "keepId must not be in dropIds" }, { status: 400 });
  }
  const result = await mergeSources(body.keepId, body.dropIds);
  for (const id of body.dropIds) {
    await redis.publish("sources.changed", JSON.stringify({ op: "delete", id }));
  }
  await redis.publish(
    "sources.changed",
    JSON.stringify({ op: "upsert", id: body.keepId }),
  );
  return NextResponse.json({ ok: true, ...result });
}
