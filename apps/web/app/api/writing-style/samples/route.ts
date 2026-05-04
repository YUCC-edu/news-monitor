import {
  createWritingStyleSample,
  ensureDefaultWritingStyleProfile,
  listWritingStyleSamples,
  refreshWritingStyleProfileFromSamples,
} from "@news/db";
import {
  extractWritingStyleSignals,
  learnWritingStyleFromSamples,
  normalizeWritingStyleSample,
} from "@news/engine";
import { NextResponse } from "next/server";

export async function GET() {
  const profile = await ensureDefaultWritingStyleProfile();
  const samples = profile ? await listWritingStyleSamples(50, profile.id) : [];
  return NextResponse.json({ profile, samples });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    title?: string;
    sourceUrl?: string | null;
    contentMarkdown?: string | null;
    wechatHtml?: string | null;
    coverImageUrl?: string | null;
    inlineImages?: string[] | null;
    imageNotes?: string | null;
  };
  const normalized = normalizeWritingStyleSample({
    title: body.title ?? "",
    sourceUrl: body.sourceUrl,
    contentMarkdown: body.contentMarkdown,
    wechatHtml: body.wechatHtml,
    coverImageUrl: body.coverImageUrl,
    inlineImages: body.inlineImages,
    imageNotes: body.imageNotes,
  });
  if (!normalized.title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (!normalized.bodyText) return NextResponse.json({ error: "content is required" }, { status: 400 });

  const profile = await ensureDefaultWritingStyleProfile();
  if (!profile) return NextResponse.json({ error: "style profile unavailable" }, { status: 500 });
  const extracted = extractWritingStyleSignals(normalized);
  const sample = await createWritingStyleSample({
    profileId: profile.id,
    title: normalized.title,
    sourceUrl: normalized.sourceUrl,
    contentMarkdown: normalized.contentMarkdown || normalized.bodyText,
    wechatHtml: normalized.wechatHtml || null,
    coverImageUrl: normalized.coverImageUrl,
    inlineImages: normalized.inlineImages,
    imageNotes: normalized.imageNotes || null,
    extracted,
  });
  const samples = await listWritingStyleSamples(200, profile.id);
  const learned = learnWritingStyleFromSamples(samples.map((item) => ({
    title: item.title,
    sourceUrl: item.sourceUrl,
    contentMarkdown: item.contentMarkdown,
    wechatHtml: item.wechatHtml,
    coverImageUrl: item.coverImageUrl,
    inlineImages: Array.isArray(item.inlineImages) ? item.inlineImages as string[] : [],
    imageNotes: item.imageNotes,
  })));
  const updatedProfile = await refreshWritingStyleProfileFromSamples(profile.id, learned.rules, learned.sampleCount);
  return NextResponse.json({ sample, profile: updatedProfile, samples });
}
