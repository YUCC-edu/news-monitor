import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error("REDIS_URL is not set");
}

const publisher = new Redis(redisUrl, { maxRetriesPerRequest: null });

export async function publish(channel: string, payload: unknown) {
  await publisher.publish(channel, JSON.stringify(payload));
}

export async function closePublisher() {
  await publisher.quit();
}
