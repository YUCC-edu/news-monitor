import { NextResponse } from "next/server";
import { deleteSource, resetSourceFirstFetch } from "@news/db";
import { executeCapability } from "@news/engine";
import { createLogger } from "@news/shared";
import { enqueueFetchSource } from "@/lib/fetch-source-queue";
import { publishSourceChanged } from "@/lib/redis-publish";

const log = createLogger("api:sources:id");

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const t0 = Date.now();
  const { id } = await params;
  const body = (await request.json()) as {
    kind: "rss" | "hn" | "x-rsshub" | "x-rsshub-search" | "wechat-wewe";
    name: string;
    config: unknown;
    scope?: "public_seed" | "personal";
    enabled?: boolean;
    fetchIntervalSec?: number;
    initialFetchDays?: number | null;
    maxItemAgeDays?: number | null;
  };
  const result = await executeCapability("sources.update", { id, ...body, scope: body.scope });
  if (!result.ok) {
    if (result.error.code === "not_found") {
      log.warn("source patch not found", { sourceId: id });
      return NextResponse.json({ error: result.error.message, code: result.error.code }, { status: 404 });
    }
    if (result.error.code === "conflict") {
      log.warn("source patch conflict", { sourceId: id });
      return NextResponse.json({ error: result.error.message, code: result.error.code }, { status: 409 });
    }
    log.warn("source patch rejected", { sourceId: id, kind: body.kind, message: result.error.message });
    return NextResponse.json({ error: result.error.message, code: result.error.code }, { status: 400 });
  }
  const payload = result.data as { conflict?: boolean; existing?: { id?: string }; source?: { kind: string } };
  if (payload.conflict) {
    log.warn("source patch conflict", { sourceId: id, existingId: payload.existing?.id });
    return NextResponse.json({ existing: payload.existing }, { status: 409 });
  }
  const updated = payload.source as { kind: string };
  await publishSourceChanged({ op: "upsert", id });
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
  await publishSourceChanged({ op: "delete", id });
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
      await publishSourceChanged({ op: "upsert", id });
    }
  } catch {
    /* no body */
  }
  await enqueueFetchSource(id);
  log.info("source run now enqueued", { sourceId: id, latencyMs: Date.now() - t0 });
  return NextResponse.json({ ok: true });
}
