import Redis from "ioredis";
import { createLogger } from "@news/shared";

const WINDOW_MS = 60_000;
const MAX_HITS = 30;
const log = createLogger("assistant:rate-limit");

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
let redis: Redis | null | undefined;

function getRedis() {
  if (redis !== undefined) return redis;
  const url = process.env.REDIS_URL;
  if (!url) {
    redis = null;
    return redis;
  }
  redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true, connectTimeout: 1000 });
  redis.on("error", (error) => {
    log.warn("redis rate-limit connection error; using memory fallback", {
      message: error instanceof Error ? error.message : String(error),
    });
  });
  return redis;
}

function memoryLimit(key: string, maxHits: number) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || now >= current.resetAt) {
    const next = { count: 1, resetAt: now + WINDOW_MS };
    buckets.set(key, next);
    return { ok: true, remaining: maxHits - 1, resetAt: next.resetAt };
  }
  if (current.count >= maxHits) {
    return { ok: false, remaining: 0, resetAt: current.resetAt };
  }
  current.count += 1;
  buckets.set(key, current);
  return { ok: true, remaining: Math.max(0, maxHits - current.count), resetAt: current.resetAt };
}

export async function checkAssistantRateLimit(key: string, maxHits = MAX_HITS) {
  const r = getRedis();
  if (r) {
    const redisKey = `assistant:rate:${key}`;
    try {
      const count = await r.incr(redisKey);
      if (count === 1) await r.pexpire(redisKey, WINDOW_MS);
      const ttl = await r.pttl(redisKey);
      const resetAt = Date.now() + (ttl > 0 ? ttl : WINDOW_MS);
      if (count > maxHits) return { ok: false, remaining: 0, resetAt };
      return { ok: true, remaining: Math.max(0, maxHits - count), resetAt };
    } catch {
      return memoryLimit(key, maxHits);
    }
  }
  return memoryLimit(key, maxHits);
}
