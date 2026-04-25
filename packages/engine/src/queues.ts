import Redis from "ioredis";
import { Queue } from "bullmq";

const FETCH_QUEUE_NAME = "fetch-source";
const ENRICH_QUEUE_NAME = "enrich-item";

let fetchQueue: Queue | null = null;
let enrichQueue: Queue | null = null;

function getConnection() {
  const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  return new Redis(redisUrl, { maxRetriesPerRequest: null });
}

function getFetchQueue() {
  if (!fetchQueue) {
    fetchQueue = new Queue(FETCH_QUEUE_NAME, { connection: getConnection() });
  }
  return fetchQueue;
}

function getEnrichQueue() {
  if (!enrichQueue) {
    enrichQueue = new Queue(ENRICH_QUEUE_NAME, { connection: getConnection() });
  }
  return enrichQueue;
}

export async function enqueueFetchSource(sourceId: string) {
  await getFetchQueue().add(
    FETCH_QUEUE_NAME,
    { sourceId },
    { removeOnComplete: 100, removeOnFail: 200 },
  );
}

export async function enqueueEnrichItems(itemIds: string[]) {
  const queue = getEnrichQueue();
  await Promise.all(
    itemIds.map((itemId) =>
      queue.add(
        ENRICH_QUEUE_NAME,
        { itemId },
        { removeOnComplete: 100, removeOnFail: 200, attempts: 3 },
      ),
    ),
  );
}
