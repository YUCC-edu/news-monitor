import { listItemIdsForReEnrich, type ReEnrichScope } from "@news/db";
import { NextResponse } from "next/server";
import { enqueueEnrichItems } from "@/lib/enrich-item-queue";

const MAX_ITEMS = 500;

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

  const limit = Math.min(Math.max(Number(body.limit) || 200, 1), MAX_ITEMS);
  const since = body.since ? new Date(body.since) : undefined;
  const until = body.until ? new Date(body.until) : undefined;
  if (since && Number.isNaN(since.getTime())) {
    return NextResponse.json({ error: "invalid since" }, { status: 400 });
  }
  if (until && Number.isNaN(until.getTime())) {
    return NextResponse.json({ error: "invalid until" }, { status: 400 });
  }

  if (scope === "source" && !body.sourceId) {
    return NextResponse.json({ error: "sourceId required for scope=source" }, { status: 400 });
  }
  if (scope === "item" && !body.itemId) {
    return NextResponse.json({ error: "itemId required for scope=item" }, { status: 400 });
  }
  if (scope === "window" && !since && !until) {
    return NextResponse.json(
      { error: "scope=window requires at least one of since, until" },
      { status: 400 },
    );
  }

  const ids = await listItemIdsForReEnrich({
    scope,
    sourceId: body.sourceId,
    since,
    until,
    itemId: body.itemId,
    limit,
  });

  if (ids.length === 0) {
    return NextResponse.json({ ok: true, queued: 0, itemIds: [] });
  }

  await enqueueEnrichItems(ids);
  return NextResponse.json({ ok: true, queued: ids.length, itemIds: ids });
}
