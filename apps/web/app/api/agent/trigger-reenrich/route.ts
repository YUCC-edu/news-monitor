import { listItemIdsForReEnrich, type ReEnrichScope } from "@news/db";
import { NextResponse } from "next/server";
import { enqueueEnrichItems } from "@/lib/enrich-item-queue";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    scope?: ReEnrichScope;
    sourceId?: string;
    since?: string;
    until?: string;
    itemId?: string;
    limit?: number;
  };
  const scope = body.scope;
  if (scope !== "source" && scope !== "window" && scope !== "item") {
    return NextResponse.json({ error: "scope must be source | window | item" }, { status: 400 });
  }
  const ids = await listItemIdsForReEnrich({
    scope,
    sourceId: body.sourceId,
    itemId: body.itemId,
    since: body.since ? new Date(body.since) : undefined,
    until: body.until ? new Date(body.until) : undefined,
    limit: Math.min(Math.max(Number(body.limit) || 100, 1), 500),
  });
  if (ids.length === 0) {
    return NextResponse.json({ tool: "trigger_reenrich", ok: true, queued: 0, itemIds: [] });
  }
  await enqueueEnrichItems(ids);
  return NextResponse.json({ tool: "trigger_reenrich", ok: true, queued: ids.length, itemIds: ids });
}
