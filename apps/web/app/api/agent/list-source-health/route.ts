import { listSourceHealth } from "@news/db";
import { categorizeErrorMessage, classifyRemediation } from "@news/shared";
import { NextResponse } from "next/server";

export async function GET() {
  const rows = await listSourceHealth();
  return NextResponse.json({
    tool: "list_source_health",
    total: rows.length,
    sources: rows.map((row) => {
      const errorCategory = categorizeErrorMessage(row.lastError);
      return {
        ...row,
        errorCategory,
        remediation: classifyRemediation(errorCategory),
      };
    }),
  });
}
