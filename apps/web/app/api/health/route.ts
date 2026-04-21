import { listSourceHealth } from "@news/db";
import { NextResponse } from "next/server";
import { categorizeErrorMessage, classifyRemediation, createLogger } from "@news/shared";

const log = createLogger("api:health");

export async function GET() {
  const t0 = Date.now();
  const rows = await listSourceHealth();
  const enriched = rows.map((row) => {
    const errorCategory = categorizeErrorMessage(row.lastError);
    const remediation = classifyRemediation(errorCategory);
    const recoveredAgoMin =
      row.lastOkAt && row.failCount === 0
        ? Math.max(0, Math.round((Date.now() - new Date(row.lastOkAt).getTime()) / 60000))
        : null;
    return { ...row, errorCategory, remediation, recoveredAgoMin };
  });
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
