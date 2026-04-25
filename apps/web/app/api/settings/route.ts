import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createLogger } from "@news/shared";

const ENV_KEYS = [
  "DATABASE_URL",
  "REDIS_URL",
  "RSSHUB_BASE",
  "WEWE_RSS_BASE",
  "WEWE_RSS_AUTH_CODE",
  "AI_MODE",
  "LLM_BASE_URL",
  "LLM_API_KEY",
  "LLM_CHAT_MODEL",
  "LLM_EMBEDDING_MODEL",
  "LLM_CONCURRENCY",
  "LLM_DAILY_REQUEST_BUDGET",
] as const;

const URL_KEYS = new Set(["DATABASE_URL", "REDIS_URL", "RSSHUB_BASE", "WEWE_RSS_BASE", "LLM_BASE_URL"]);

type ParsedLine =
  | { type: "raw"; raw: string }
  | { type: "key"; key: string; value: string; raw: string };

const ENV_PATH = path.resolve(process.cwd(), "..", "..", ".env");
const log = createLogger("api:settings");

/** WeWe 前端会把 AUTH 放进 fetch Headers；非 ISO-8859-1 字符会整页报错。仅保留可打印 ASCII。 */
function sanitizeWeWeAuthCode(raw: string) {
  return raw.replace(/\uFEFF/g, "").replace(/[^\x20-\x7E]/g, "").trim();
}

function checksum(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function parseEnvLines(content: string): ParsedLine[] {
  return content.split(/\r?\n/).map((line) => {
    if (!line.trim() || line.trimStart().startsWith("#")) return { type: "raw", raw: line };
    const idx = line.indexOf("=");
    if (idx === -1) return { type: "raw", raw: line };
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1);
    if (!key) return { type: "raw", raw: line };
    return { type: "key", key, value, raw: line };
  });
}

function quoteIfNeeded(value: string) {
  if (!value) return "";
  if (/[\s#"]/u.test(value)) return `"${value.replace(/"/g, '\\"')}"`;
  return value;
}

function stripQuotes(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1).replace(/\\"/g, '"');
  return trimmed;
}

function maskUrl(raw: string | undefined) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.hostname}:${u.port || "(default)"}${u.pathname}`;
  } catch {
    return raw;
  }
}

function redactUrlForEditing(raw: string | undefined) {
  if (!raw) return "";
  try {
    const u = new URL(raw);
    if (u.username || u.password) {
      u.username = "***";
      u.password = "***";
      return u.toString();
    }
    return raw;
  } catch {
    return raw;
  }
}

function isRedactedUrlValue(raw: string | undefined) {
  return Boolean(raw && raw.includes("***"));
}

function validateValues(values: Record<string, string | undefined>) {
  for (const [key, raw] of Object.entries(values)) {
    if (!ENV_KEYS.includes(key as (typeof ENV_KEYS)[number])) {
      throw new Error(`Unsupported key: ${key}`);
    }
    if (raw == null || raw.trim() === "") continue;
    const value = raw.trim();
    if (key === "AI_MODE" && !["core", "llm", "agent"].includes(value)) {
      throw new Error("AI_MODE must be core, llm, or agent");
    }
    if (URL_KEYS.has(key) && isRedactedUrlValue(value)) continue;
    if (URL_KEYS.has(key)) {
      try {
        new URL(value);
      } catch {
        throw new Error(`${key} must be a valid URL`);
      }
    }
  }
}

export async function GET() {
  const t0 = Date.now();
  let content = "";
  try {
    content = await fs.readFile(ENV_PATH, "utf-8");
  } catch (error) {
    const message = error instanceof Error ? error.message : "read .env failed";
    log.error("settings read failed", { errorClass: error instanceof Error ? error.name : typeof error, message });
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const lines = parseEnvLines(content);
  const map = new Map<string, string>();
  for (const line of lines) {
    if (line.type === "key") map.set(line.key, stripQuotes(line.value));
  }
  const payload = {
    version: checksum(content),
    values: {
      DATABASE_URL: redactUrlForEditing(map.get("DATABASE_URL")),
      REDIS_URL: redactUrlForEditing(map.get("REDIS_URL")),
      RSSHUB_BASE: map.get("RSSHUB_BASE") ?? "",
      WEWE_RSS_BASE: map.get("WEWE_RSS_BASE") ?? "",
      WEWE_RSS_AUTH_CODE: sanitizeWeWeAuthCode(map.get("WEWE_RSS_AUTH_CODE") ?? ""),
      AI_MODE: map.get("AI_MODE") ?? "core",
      LLM_BASE_URL: map.get("LLM_BASE_URL") ?? "",
      LLM_CHAT_MODEL: map.get("LLM_CHAT_MODEL") ?? "",
      LLM_EMBEDDING_MODEL: map.get("LLM_EMBEDDING_MODEL") ?? "",
      LLM_CONCURRENCY: map.get("LLM_CONCURRENCY") ?? "2",
      LLM_DAILY_REQUEST_BUDGET: map.get("LLM_DAILY_REQUEST_BUDGET") ?? "500",
    },
    secure: {
      llmApiKeySet: !!map.get("LLM_API_KEY"),
      llmApiKeyMasked: map.get("LLM_API_KEY") ? "***" : "",
    },
    masked: {
      DATABASE_URL: maskUrl(map.get("DATABASE_URL")),
      REDIS_URL: maskUrl(map.get("REDIS_URL")),
    },
  };
  log.debug("settings loaded", { latencyMs: Date.now() - t0, llmApiKeySet: payload.secure.llmApiKeySet });
  return NextResponse.json(payload);
}

export async function PUT(request: Request) {
  const t0 = Date.now();
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    log.warn("settings save rejected: invalid json body");
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const rawValues =
    "values" in body && body.values && typeof body.values === "object"
      ? (body.values as Record<string, unknown>)
      : {};
  const version = typeof body.version === "string" ? body.version : undefined;
  const clearLlmApiKey = Boolean(body.clearLlmApiKey);

  const updates: Record<string, string | undefined> = {};
  for (const key of Object.keys(rawValues)) {
    if (!ENV_KEYS.includes(key as (typeof ENV_KEYS)[number])) {
      log.warn("settings save rejected: unsupported key", { key });
      return NextResponse.json({ error: `Unsupported key: ${key}` }, { status: 400 });
    }
    const value = rawValues[key];
    if (value == null) continue;
    if (typeof value !== "string") {
      log.warn("settings save rejected: value must be string", { key });
      return NextResponse.json({ error: `${key} must be a string` }, { status: 400 });
    }
    updates[key] = key === "WEWE_RSS_AUTH_CODE" ? sanitizeWeWeAuthCode(value) : value;
  }

  if (clearLlmApiKey) updates.LLM_API_KEY = "";

  try {
    validateValues(updates);
  } catch (error) {
    log.warn("settings save rejected: validation failed", {
      errorClass: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : "Invalid input",
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid input" },
      { status: 400 },
    );
  }

  let content = "";
  let st;
  try {
    [content, st] = await Promise.all([fs.readFile(ENV_PATH, "utf-8"), fs.stat(ENV_PATH)]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "read .env failed";
    log.error("settings save failed: read env", { errorClass: error instanceof Error ? error.name : typeof error, message });
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const oldVersion = checksum(content);
  if (version && version !== oldVersion) {
    log.warn("settings save rejected: version conflict");
    return NextResponse.json(
      { error: "Configuration changed by another editor, please refresh first." },
      { status: 409 },
    );
  }

  const lines = parseEnvLines(content);
  for (const line of lines) {
    if (
      line.type === "key" &&
      URL_KEYS.has(line.key) &&
      isRedactedUrlValue(updates[line.key])
    ) {
      delete updates[line.key];
    }
  }
  const handled = new Set<string>();
  const rendered = lines.map((line) => {
    if (line.type !== "key") return line.raw;
    const next = updates[line.key];
    if (next === undefined) return line.raw;
    handled.add(line.key);
    if (next.trim() === "") return "";
    return `${line.key}=${quoteIfNeeded(next.trim())}`;
  });

  for (const key of ENV_KEYS) {
    if (handled.has(key)) continue;
    const next = updates[key];
    if (next === undefined || next.trim() === "") continue;
    rendered.push(`${key}=${quoteIfNeeded(next.trim())}`);
  }

  const nextContent = `${rendered.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
  try {
    const backupDir = path.resolve(process.cwd(), "..", "..", "backups", "env");
    await fs.mkdir(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `.env.backup.${Date.now()}`);
    await fs.writeFile(backupPath, content, "utf-8");
    const fresh = await fs.stat(ENV_PATH);
    if (fresh.mtimeMs !== st.mtimeMs || fresh.size !== st.size) {
      return NextResponse.json(
        { error: "Configuration changed during save, please retry." },
        { status: 409 },
      );
    }
    await fs.writeFile(ENV_PATH, nextContent, "utf-8");
  } catch (error) {
    const message = error instanceof Error ? error.message : "write .env failed";
    log.error("settings save failed: write env", { errorClass: error instanceof Error ? error.name : typeof error, message });
    return NextResponse.json({ error: message }, { status: 500 });
  }

  log.info("settings saved", {
    latencyMs: Date.now() - t0,
    keysUpdated: Object.keys(updates).join(","),
    restartRequired: true,
  });
  return NextResponse.json({ ok: true, version: checksum(nextContent), restartRequired: true });
}
