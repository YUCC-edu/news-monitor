import { executeCapability } from "@news/engine";
import { NextResponse } from "next/server";
import { createLogger } from "@news/shared";

const log = createLogger("api:health");

export async function GET() {
  const t0 = Date.now();
  const result = await executeCapability("health.sources", {});
  if (!result.ok) {
    return NextResponse.json({ error: result.error.message, code: result.error.code }, { status: 500 });
  }
  const data = result.data as {
    sources: Array<{ errorCategory: string } & Record<string, unknown>>;
  };
  const enriched = data.sources;
  const categoryCounts = enriched.reduce<Record<string, number>>((acc, row) => {
    const k = row.errorCategory;
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  log.debug("health snapshot generated", {
    latencyMs: Date.now() - t0,
    rows: enriched.length,
    categoryCounts,
  });
  return NextResponse.json(enriched);
}
