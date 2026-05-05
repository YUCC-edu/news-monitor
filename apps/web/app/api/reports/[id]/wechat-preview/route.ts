import { getReportWithAttempts } from "@news/db";
import { buildWechatDraftArticle } from "@news/engine";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const report = await getReportWithAttempts(id);
  if (!report) return NextResponse.json({ error: "report not found" }, { status: 404 });

  const article = buildWechatDraftArticle(report);
  return NextResponse.json({
    article: {
      ...article,
      contentLength: article.content.length,
      markdownLength: article.markdown.length,
    },
  });
}
