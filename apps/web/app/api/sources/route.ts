import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { deleteAllSources } from "@news/db";
import { executeCapability } from "@news/engine";
import { createLogger } from "@news/shared";
import { enqueueFetchSource } from "@/lib/fetch-source-queue";
import { publishSourceChanged } from "@/lib/redis-publish";

const log = createLogger("api:sources");
const PUBLIC_SEED_DISABLED_PATH = path.resolve(process.cwd(), "..", "..", "data", "public-seed-disabled");

export async function GET(request: Request) {
  const t0 = Date.now();
  try {
    const scope = new URL(request.url).searchParams.get("scope");
    const result = await executeCapability("sources.list", {
      scope: scope === "public_seed" || scope === "personal" ? scope : undefined,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error.message, code: result.error.code }, { status: 500 });
    }
    const data = result.data as { sources: unknown[] };
    const rows = data.sources;
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
    kind: "rss" | "hn" | "x-rsshub" | "x-rsshub-search" | "wechat-wewe";
    name: string;
    config: unknown;
    scope?: "public_seed" | "personal";
    enabled?: boolean;
    fetchIntervalSec?: number;
    initialFetchDays?: number | null;
    maxItemAgeDays?: number | null;
  };
  const result = await executeCapability("sources.add", { ...body, scope: body.scope ?? "personal" });
  if (!result.ok) {
    if (result.error.code === "conflict") {
      return NextResponse.json({ error: result.error.message, code: result.error.code }, { status: 409 });
    }
    log.warn("source create rejected", { kind: body.kind, message: result.error.message, code: result.error.code });
    return NextResponse.json({ error: result.error.message, code: result.error.code }, { status: 400 });
  }
  const payload = result.data as { conflict?: boolean; existing?: unknown; source?: Record<string, unknown> };
  if (payload.conflict) {
    return NextResponse.json({ existing: payload.existing }, { status: 409 });
  }
  const created = payload.source as {
    id: string;
    kind: string;
    fetchIntervalSec: number;
  };
  try {
    await publishSourceChanged({ op: "upsert", id: created.id });
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

export async function DELETE(request: Request) {
  const t0 = Date.now();
  const body = await request.json().catch(() => null) as { confirm?: string } | null;
  if (body?.confirm !== "DELETE ALL SOURCES") {
    return NextResponse.json(
      { error: "Confirmation phrase mismatch" },
      { status: 400 },
    );
  }
  try {
    const result = await deleteAllSources();
    await fs.mkdir(path.dirname(PUBLIC_SEED_DISABLED_PATH), { recursive: true });
    await fs.writeFile(
      PUBLIC_SEED_DISABLED_PATH,
      `disabled_at=${new Date().toISOString()}\nreason=user-cleared-source-library\n`,
      "utf-8",
    );
    try {
      await publishSourceChanged({ op: "delete-all" });
    } catch (e) {
      log.warn("sources cleared but redis publish failed", { error: e });
    }
    log.warn("all sources deleted", {
      latencyMs: Date.now() - t0,
      deletedSources: result.deletedSources,
      deletedClusters: result.deletedClusters,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error("sources clear failed", { errorClass: e instanceof Error ? e.name : typeof e, message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
