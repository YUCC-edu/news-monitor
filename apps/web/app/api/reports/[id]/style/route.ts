import { generateStyledReportForReport } from "@news/engine";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const report = await generateStyledReportForReport(id);
  if (!report) {
    return NextResponse.json({ error: "no active style samples found" }, { status: 400 });
  }
  return NextResponse.json({ report });
}
