import { listClusterSiblingItems } from "@news/db";
import { NextResponse } from "next/server";

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ clusterId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { clusterId } = await params;
  if (!uuidRe.test(clusterId)) {
    return NextResponse.json({ error: "invalid cluster id" }, { status: 400 });
  }
  const url = new URL(request.url);
  const exclude = url.searchParams.get("exclude") ?? undefined;
  const excludeSource = url.searchParams.get("excludeSource") ?? undefined;
  if (exclude && !uuidRe.test(exclude)) {
    return NextResponse.json({ error: "invalid exclude item id" }, { status: 400 });
  }
  if (excludeSource && !uuidRe.test(excludeSource)) {
    return NextResponse.json({ error: "invalid exclude source id" }, { status: 400 });
  }
  const limitRaw = url.searchParams.get("limit");
  const limitParsed = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
  const limit =
    limitParsed != null && Number.isFinite(limitParsed) ? limitParsed : undefined;
  const rows = await listClusterSiblingItems({
    clusterId,
    excludeItemId: exclude,
    excludeSourceId: excludeSource,
    limit,
  });
  return NextResponse.json(rows);
}
