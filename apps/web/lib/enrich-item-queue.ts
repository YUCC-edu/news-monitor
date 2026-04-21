import Redis from "ioredis";
import { Queue } from "bullmq";

const QUEUE_NAME = "enrich-item";

let enrichQueue: Queue | null = null;

function getEnrichItemQueue() {
  if (!enrichQueue) {
    const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
    const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    enrichQueue = new Queue(QUEUE_NAME, { connection });
  }
  return enrichQueue;
}

export async function enqueueEnrichItems(itemIds: string[]) {
  const q = getEnrichItemQueue();
  await Promise.all(
    itemIds.map((itemId) =>
      q.add(
        "enrich-item",
        { itemId },
        { removeOnComplete: 100, removeOnFail: 200, attempts: 3 },
      ),
    ),
  );
}
