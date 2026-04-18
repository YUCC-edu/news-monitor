import { findDuplicateGroups } from "@news/db";
import { NextResponse } from "next/server";

export async function GET() {
  const groups = await findDuplicateGroups();
  return NextResponse.json(groups);
}
