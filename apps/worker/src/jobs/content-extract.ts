type ExtractedContent = {
  text: string;
  source: "url" | "feed" | "none";
  qualityScore: number;
};

function decodeHtmlEntities(input: string) {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<(?:p|div|section|article|br|li|h[1-6])\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function extractArticleHtml(html: string) {
  const articleMatch = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch?.[1]) return articleMatch[1];
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch?.[1]) return mainMatch[1];
  return html;
}

function qualityForText(text: string, source: ExtractedContent["source"]) {
  if (!text) return 0;
  const lengthScore = Math.min(70, Math.floor(text.length / 40));
  const sourceBonus = source === "url" ? 25 : source === "feed" ? 10 : 0;
  return Math.min(100, lengthScore + sourceBonus);
}

export async function extractFullContent(input: {
  url?: string | null;
  fallbackText?: string | null;
  signal?: AbortSignal;
}): Promise<ExtractedContent> {
  const fallback = input.fallbackText?.replace(/\s+/g, " ").trim() ?? "";
  if (!input.url || !/^https?:\/\//i.test(input.url)) {
    return {
      text: fallback,
      source: fallback ? "feed" : "none",
      qualityScore: qualityForText(fallback, fallback ? "feed" : "none"),
    };
  }

  try {
    const response = await fetch(input.url, {
      signal: input.signal,
      headers: {
        "user-agent": "news-monitor/0.0 (+https://local)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new Error(`unsupported response ${response.status} ${contentType}`);
    }
    const html = await response.text();
    const text = stripHtml(extractArticleHtml(html)).slice(0, 30_000);
    if (text.length >= Math.max(400, fallback.length * 1.5)) {
      return { text, source: "url", qualityScore: qualityForText(text, "url") };
    }
  } catch {
    // Extraction is best-effort. The enrichment pipeline falls back to feed text.
  }

  return {
    text: fallback,
    source: fallback ? "feed" : "none",
    qualityScore: qualityForText(fallback, fallback ? "feed" : "none"),
  };
}
