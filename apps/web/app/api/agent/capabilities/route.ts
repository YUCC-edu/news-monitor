import { capabilityCatalog } from "@news/engine";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    capabilities: Object.entries(capabilityCatalog).map(([name, meta]) => ({
      name,
      summary: meta.summary,
      writesData: meta.writesData,
    })),
  });
}
