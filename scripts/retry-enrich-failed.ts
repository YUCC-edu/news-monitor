import { Queue } from "bullmq";
import Redis from "ioredis";

async function main() {
  const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue("enrich-item", { connection });

  const failed = await queue.getFailed(0, 1000);
  let retried = 0;
  for (const job of failed) {
    await job.retry();
    retried += 1;
  }

  console.log(JSON.stringify({ failed: failed.length, retried }));

  await queue.close();
  await connection.quit();
}

void main();
