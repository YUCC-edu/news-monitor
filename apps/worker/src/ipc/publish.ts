import Redis from "ioredis";
import { createLogger } from "@news/shared";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error("REDIS_URL is not set");
}

const log = createLogger("worker:ipc");
const publisher = new Redis(redisUrl, { maxRetriesPerRequest: null });
publisher.on("error", (error) => {
  log.warn("redis publisher connection error", {
    message: error instanceof Error ? error.message : String(error),
  });
});

export async function publish(channel: string, payload: unknown) {
  await publisher.publish(channel, JSON.stringify(payload));
}

export async function closePublisher() {
  await publisher.quit();
}
