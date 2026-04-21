import { NextResponse } from "next/server";
import Redis from "ioredis";
import { Queue } from "bullmq";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createLogger } from "@news/shared";

const log = createLogger("api:system");

function maskUrl(raw: string | undefined) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.hostname}:${u.port || "(default)"}${u.pathname}`;
  } catch {
    return raw;
  }
}

async function pingRedis(url: string) {
  const r = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
  try {
    await r.connect();
    const pong = await r.ping();
    return pong === "PONG";
  } catch {
    return false;
  } finally {
    try {
      r.disconnect();
    } catch {
      // ignore
    }
  }
}

async function pingHttp(url: string) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(url, { signal: controller.signal, method: "GET" });
    clearTimeout(timeout);
    return res.status < 500;
  } catch {
    return false;
  }
}

async function queueCounts(name: string, url: string) {
  const u = new URL(url);
  const q = new Queue(name, {
    connection: {
      host: u.hostname || "127.0.0.1",
      port: Number(u.port || 6379),
      password: u.password || undefined,
    },
  });
  try {
    const counts = await q.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed",
      "paused",
    );
    return counts;
  } catch {
    return null;
  } finally {
    await q.close().catch(() => undefined);
  }
}

async function listBackups() {
  const dir = path.resolve(process.cwd(), "..", "..", "backups");
  try {
    const files = await fs.readdir(dir);
    const stats = await Promise.all(
      files
        .filter((f) => f.endsWith(".sql.gz"))
        .map(async (f) => {
          const st = await fs.stat(path.join(dir, f));
          return { name: f, size: st.size, mtime: st.mtime };
        }),
    );
    return stats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime()).slice(0, 5);
  } catch {
    return [];
  }
}

export async function GET() {
  const t0 = Date.now();
  const redisUrl = process.env.REDIS_URL ?? "";
  const [redisOk, rsshubOk, weweOk] = await Promise.all([
    redisUrl ? pingRedis(redisUrl) : Promise.resolve(false),
    process.env.RSSHUB_BASE ? pingHttp(process.env.RSSHUB_BASE) : Promise.resolve(false),
    process.env.WEWE_RSS_BASE ? pingHttp(process.env.WEWE_RSS_BASE) : Promise.resolve(false),
  ]);

  const queues: Record<string, Awaited<ReturnType<typeof queueCounts>>> = {};
  if (redisUrl) {
    for (const name of ["fetch-source", "enrich-item", "name-cluster", "retention"]) {
      queues[name] = await queueCounts(name, redisUrl);
    }
  }

  const backups = await listBackups();

  const payload = {
    env: {
      database: {
        url: maskUrl(process.env.DATABASE_URL),
        set: !!process.env.DATABASE_URL,
      },
      redis: {
        url: maskUrl(process.env.REDIS_URL),
        set: !!process.env.REDIS_URL,
        ok: redisOk,
      },
      rsshub: {
        url: process.env.RSSHUB_BASE ?? null,
        set: !!process.env.RSSHUB_BASE,
        ok: rsshubOk,
      },
      wewe: {
        url: process.env.WEWE_RSS_BASE ?? null,
        set: !!process.env.WEWE_RSS_BASE,
        ok: weweOk,
      },
      llm: {
        baseUrl: process.env.LLM_BASE_URL ?? null,
        chatModel: process.env.LLM_CHAT_MODEL ?? null,
        embeddingModel: process.env.LLM_EMBEDDING_MODEL ?? null,
        hasKey: !!process.env.LLM_API_KEY,
      },
    },
    queues,
    backups: backups.map((b) => ({
      name: b.name,
      sizeKB: Math.round(b.size / 1024),
      mtime: b.mtime,
    })),
    node: {
      version: process.version,
      platform: process.platform,
      uptimeSec: Math.floor(process.uptime()),
    },
  };
  log.debug("system snapshot generated", {
    latencyMs: Date.now() - t0,
    redisOk,
    rsshubOk,
    weweOk,
    queueNames: Object.keys(queues).join(","),
  });
  return NextResponse.json(payload);
}
