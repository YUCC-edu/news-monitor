import { upsertSource } from "@news/db";
import { createLogger } from "@news/shared";
import Redis from "ioredis";
import { NextResponse } from "next/server";
import { enqueueFetchSource } from "@/lib/fetch-source-queue";
import { collectPresetItems, listPresetPacks } from "@/lib/source-presets";

let publishRedis: Redis | null = null;
const log = createLogger("api:sources:import-presets");

function getHomepageUrl(item: unknown) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
  const homepageUrl = (item as Record<string, unknown>).homepageUrl;
  return typeof homepageUrl === "string" && homepageUrl.trim() ? homepageUrl.trim() : undefined;
}

function getPublishRedis() {
  if (!publishRedis) {
    publishRedis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
  }
  return publishRedis;
}

export async function POST(request: Request) {
  const t0 = Date.now();
  const body = (await request.json().catch(() => null)) as
    | {
        presetKey?: string;
        presetKeys?: string[];
        enabled?: boolean;
        selectedItems?: Array<{
          id: string;
          name: string;
          description?: string;
  kind: "rss" | "hn" | "x-rsshub" | "x-rsshub-search" | "wechat-wewe";
          config: Record<string, unknown>;
          homepageUrl?: string;
          fetchIntervalSec: number;
          initialFetchDays?: number | null;
          maxItemAgeDays?: number | null;
          category: "hotspot" | "research";
          tags?: string[];
          priority?: number;
        }>;
      }
    | null;
  const presetKey = body?.presetKey ?? "ai-hotspot-research";
  const enabled = body?.enabled ?? true;
  const presetKeys =
    Array.isArray(body?.presetKeys) && body!.presetKeys.length > 0
      ? body!.presetKeys
      : [presetKey];
  const selectedItems = Array.isArray(body?.selectedItems) ? body?.selectedItems : undefined;
  const items = collectPresetItems({ presetKeys, selectedItems });
  if (items.length === 0) {
    return NextResponse.json({ error: `unknown presetKey: ${presetKey}` }, { status: 400 });
  }

  const created: Array<{ id: string; name: string; kind: string }> = [];
  const conflicts: Array<{ id: string; name: string; kind: string }> = [];
  const failed: Array<{ name: string; reason: string }> = [];

  for (const item of items) {
    try {
      const out = await upsertSource({
        kind: item.kind,
        name: item.name,
        scope: "public_seed",
        config: getHomepageUrl(item) ? { ...item.config, homepageUrl: getHomepageUrl(item) } : item.config,
        enabled,
        fetchIntervalSec: item.fetchIntervalSec,
        initialFetchDays: item.initialFetchDays ?? null,
        maxItemAgeDays: item.maxItemAgeDays ?? null,
      });
      if (!out) {
        failed.push({ name: item.name, reason: "failed to create source" });
        continue;
      }
      if ("conflict" in out) {
        conflicts.push({ id: out.existing.id, name: out.existing.name, kind: out.existing.kind });
        continue;
      }
      created.push({ id: out.id, name: out.name, kind: out.kind });
      try {
        await enqueueFetchSource(out.id);
      } catch (e) {
        failed.push({
          name: item.name,
          reason: `created but enqueue failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    } catch (e) {
      failed.push({ name: item.name, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  try {
    if (created.length > 0) {
      await getPublishRedis().publish(
        "sources.changed",
        JSON.stringify({ op: "preset-import", presetKey, createdCount: created.length }),
      );
    }
  } catch (e) {
    log.warn("preset import redis publish failed", { presetKey, error: e });
  }

  log.info("preset import finished", {
    presetKey,
    presetKeys,
    enabled,
    requestedCount: items.length,
    importedFrom: selectedItems && selectedItems.length > 0 ? "manual-selection" : "preset-all",
    createdCount: created.length,
    conflictCount: conflicts.length,
    failedCount: failed.length,
    latencyMs: Date.now() - t0,
  });

  return NextResponse.json({
    presetKey,
    presetKeys,
    requestedCount: items.length,
    importedFrom: selectedItems && selectedItems.length > 0 ? "manual-selection" : "preset-all",
    createdCount: created.length,
    conflictCount: conflicts.length,
    failedCount: failed.length,
    created,
    conflicts,
    failed,
  });
}

export async function GET() {
  const packs = listPresetPacks().map((pack) => ({
    key: pack.key,
    label: pack.label,
    description: pack.description,
    itemCount: pack.items.length,
    items: pack.items,
  }));
  return NextResponse.json({ packs });
}

