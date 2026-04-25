import { Queue } from "bullmq";
import Redis from "ioredis";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getDataHealthSnapshot } from "@news/db";
import { aiMode } from "@news/shared";

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
    return await q.getJobCounts("waiting", "active", "completed", "failed", "delayed", "paused");
  } catch {
    return null;
  } finally {
    await q.close().catch(() => undefined);
  }
}

async function getQueueLatestFailed(name: string, url: string) {
  const u = new URL(url);
  const q = new Queue(name, {
    connection: {
      host: u.hostname || "127.0.0.1",
      port: Number(u.port || 6379),
      password: u.password || undefined,
    },
  });
  try {
    const rows = await q.getFailed(0, 0);
    const first = rows[0];
    if (!first) return null;
    return {
      jobId: String(first.id ?? ""),
      failedReason: (first.failedReason ?? "").slice(0, 220),
      attemptsMade: first.attemptsMade ?? 0,
      finishedOn: first.finishedOn ?? null,
    };
  } catch {
    return null;
  } finally {
    await q.close().catch(() => undefined);
  }
}

async function getQueueLatestCompleted(name: string, url: string) {
  const u = new URL(url);
  const q = new Queue(name, {
    connection: {
      host: u.hostname || "127.0.0.1",
      port: Number(u.port || 6379),
      password: u.password || undefined,
    },
  });
  try {
    const rows = await q.getCompleted(0, 0);
    const first = rows[0];
    if (!first) return null;
    return {
      jobId: String(first.id ?? ""),
      returnvalue: first.returnvalue ?? null,
      finishedOn: first.finishedOn ?? null,
    };
  } catch {
    return null;
  } finally {
    await q.close().catch(() => undefined);
  }
}

async function listBackups() {
  const dir = path.resolve(process.cwd(), "backups");
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

export async function buildSystemStatusSnapshot() {
  const redisUrl = process.env.REDIS_URL ?? "";
  const [redisOk, rsshubOk, weweOk] = await Promise.all([
    redisUrl ? pingRedis(redisUrl) : Promise.resolve(false),
    process.env.RSSHUB_BASE ? pingHttp(process.env.RSSHUB_BASE) : Promise.resolve(false),
    process.env.WEWE_RSS_BASE ? pingHttp(process.env.WEWE_RSS_BASE) : Promise.resolve(false),
  ]);

  const queues: Record<string, Awaited<ReturnType<typeof queueCounts>>> = {};
  const queueLatestFailed: Record<string, Awaited<ReturnType<typeof getQueueLatestFailed>>> = {};
  const queueLatestCompleted: Record<string, Awaited<ReturnType<typeof getQueueLatestCompleted>>> = {};
  if (redisUrl) {
    const queueNames = ["fetch-source", "enrich-item", "ai-enrich-item", "name-cluster", "retention"] as const;
    const snapshots = await Promise.all(
      queueNames.map(async (name) => {
        const [counts, latestFailed, latestCompleted] = await Promise.all([
          queueCounts(name, redisUrl),
          getQueueLatestFailed(name, redisUrl),
          getQueueLatestCompleted(name, redisUrl),
        ]);
        return { name, counts, latestFailed, latestCompleted };
      }),
    );
    for (const row of snapshots) {
      queues[row.name] = row.counts;
      queueLatestFailed[row.name] = row.latestFailed;
      queueLatestCompleted[row.name] = row.latestCompleted;
    }
  }

  const [backups, dataHealth] = await Promise.all([
    listBackups(),
    getDataHealthSnapshot().catch(() => null),
  ]);

  return {
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
        mode: aiMode(),
        baseUrl: process.env.LLM_BASE_URL ?? null,
        chatModel: process.env.LLM_CHAT_MODEL ?? null,
        embeddingModel: process.env.LLM_EMBEDDING_MODEL ?? null,
        hasKey: !!process.env.LLM_API_KEY,
        enabled: aiMode() === "llm",
        concurrency: Number.parseInt(process.env.LLM_CONCURRENCY ?? "2", 10) || 2,
        dailyRequestBudget: Number.parseInt(process.env.LLM_DAILY_REQUEST_BUDGET ?? "500", 10) || 500,
      },
    },
    queues,
    queueLatestFailed,
    queueLatestCompleted,
    dataHealth,
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
}
