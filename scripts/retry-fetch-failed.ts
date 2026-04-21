/**
 * 将 fetch-source 队列中 failed 状态作业重新入队重试（与 retry-enrich-failed 对称）。
 *
 *   pnpm exec tsx --env-file=.env scripts/retry-fetch-failed.ts
 */
import { Queue } from "bullmq";
import Redis from "ioredis";

async function main() {
  const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue("fetch-source", { connection });

  try {
    const failed = await queue.getFailed(0, 2000);
    let retried = 0;
    for (const job of failed) {
      await job.retry();
      retried += 1;
    }
    console.log(JSON.stringify({ failed: failed.length, retried }, null, 2));
  } finally {
    await queue.close();
    await connection.quit();
  }
}

void main();
