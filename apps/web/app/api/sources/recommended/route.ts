import { NextResponse } from "next/server";
import {
  buildRecommendedSourceSections,
  listRecommendedAiSources,
} from "@/lib/recommended-ai-sources";

export async function GET() {
  const items = listRecommendedAiSources();
  const sections = buildRecommendedSourceSections(items).map((section) => ({
    key: section.key,
    label: section.label,
    description: section.description,
    itemCount: section.items.length,
  }));

  return NextResponse.json({
    items,
    sections,
  });
}
