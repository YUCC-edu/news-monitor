import Redis from "ioredis";
import { Queue } from "bullmq";

const JOB_NAME = "fetch-source";

let fetchQueue: Queue | null = null;

function getFetchSourceQueue() {
  if (!fetchQueue) {
    const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
    const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    fetchQueue = new Queue(JOB_NAME, { connection });
  }
  return fetchQueue;
}

/** Enqueue a one-off fetch job (same as PATCH save / manual「立即抓」). */
export async function enqueueFetchSource(sourceId: string) {
  await getFetchSourceQueue().add(
    JOB_NAME,
    { sourceId },
    { removeOnComplete: 100, removeOnFail: 200 },
  );
}
