import Redis from "ioredis";
import { createLogger } from "@news/shared";

const log = createLogger("web:redis-publish");

let redis: Redis | null = null;

function getRedis() {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
    });
    redis.on("error", (error) => {
      log.warn("redis publish connection error", {
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }
  return redis;
}

export async function publishRedisMessage(channel: string, payload: unknown) {
  const client = getRedis();
  await client.publish(channel, typeof payload === "string" ? payload : JSON.stringify(payload));
}

export async function publishSourceChanged(payload: unknown) {
  await publishRedisMessage("sources.changed", payload);
}
