import { getReportWithAttempts, updateReportContent } from "@news/db";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const report = await getReportWithAttempts(id);
  if (!report) return NextResponse.json({ error: "report not found" }, { status: 404 });
  return NextResponse.json({ report });
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as {
    title?: string;
    markdown?: string;
    wechatHtml?: string;
    obsidianMarkdown?: string;
    feishuPayload?: unknown;
    styledTitle?: string | null;
    styledMarkdown?: string | null;
    styledWechatHtml?: string | null;
    styleImageBriefs?: unknown;
  };
  const report = await updateReportContent({
    id,
    title: typeof body.title === "string" ? body.title : undefined,
    markdown: typeof body.markdown === "string" ? body.markdown : undefined,
    wechatHtml: typeof body.wechatHtml === "string" ? body.wechatHtml : undefined,
    obsidianMarkdown: typeof body.obsidianMarkdown === "string" ? body.obsidianMarkdown : undefined,
    feishuPayload: body.feishuPayload,
    styledTitle: typeof body.styledTitle === "string" || body.styledTitle === null ? body.styledTitle : undefined,
    styledMarkdown: typeof body.styledMarkdown === "string" || body.styledMarkdown === null ? body.styledMarkdown : undefined,
    styledWechatHtml: typeof body.styledWechatHtml === "string" || body.styledWechatHtml === null ? body.styledWechatHtml : undefined,
    styleImageBriefs: body.styleImageBriefs,
  });
  if (!report) return NextResponse.json({ error: "report not found" }, { status: 404 });
  return NextResponse.json({ report });
}
