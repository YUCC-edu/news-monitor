import { deleteSource, listSources, upsertSource } from "@news/db";
import { NextResponse } from "next/server";

type CreatorSourceRow = {
  id: string;
  kind: string;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  fetchIntervalSec: number;
  initialFetchDays: number | null;
  maxItemAgeDays: number | null;
  lastOkAt: string | null;
  lastError: string | null;
  failCount: number;
};

function isLinkSavedSource(config: unknown) {
  return Boolean(
    config &&
      typeof config === "object" &&
      !Array.isArray(config) &&
      (config as Record<string, unknown>).origin === "link-saves",
  );
}

function normalizeName(url: string, note?: string | null) {
  const trimmedNote = typeof note === "string" ? note.trim() : "";
  if (trimmedNote) return trimmedNote;
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "") || url;
  } catch {
    return url;
  }
}

export async function GET() {
  const rows = await listSources();
  const links = rows
    .filter((row) => isLinkSavedSource(row.config))
    .map((row) => row as CreatorSourceRow);
  return NextResponse.json(links);
}

export async function POST(request: Request) {
  const body = (await request.json()) as { url?: string; name?: string | null; note?: string | null };
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }
  const preferredName =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : typeof body.note === "string"
        ? body.note.trim()
        : "";

  const source = await upsertSource({
    kind: "rss",
    name: normalizeName(url, preferredName || null),
    scope: "personal",
    config: {
      feedUrl: url,
      origin: "link-saves",
      note: preferredName || null,
    },
    enabled: true,
    fetchIntervalSec: 300,
    initialFetchDays: 1,
    maxItemAgeDays: null,
  });

  if (!source) {
    return NextResponse.json({ error: "failed to save" }, { status: 500 });
  }
  if ("conflict" in source) {
    return NextResponse.json({ existing: source.existing }, { status: 409 });
  }

  return NextResponse.json(
    {
      id: source.id,
      kind: source.kind,
      name: source.name,
      config: source.config,
      enabled: source.enabled,
      fetchIntervalSec: source.fetchIntervalSec,
      initialFetchDays: source.initialFetchDays,
      maxItemAgeDays: source.maxItemAgeDays,
      lastOkAt: source.lastOkAt,
      lastError: source.lastError,
      failCount: source.failCount,
    },
    { status: 201 },
  );
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const ok = await deleteSource(id);
  if (!ok) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
