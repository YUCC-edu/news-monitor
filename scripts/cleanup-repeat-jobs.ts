import { Queue } from "bullmq";
import Redis from "ioredis";
import { listSources } from "@news/db";

async function main() {
  const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue("fetch-source", { connection });

  const sources = await listSources();
  const validKeys = new Set(
    sources
      .filter((s) => s.enabled)
      .map((s) => `source:${s.id}`),
  );

  const schedulers = await queue.getJobSchedulers();
  let removed = 0;
  const kept: string[] = [];
  for (const scheduler of schedulers) {
    const key = scheduler.key ?? scheduler.id ?? "";
    if (!validKeys.has(key)) {
      await queue.removeJobScheduler(key);
      removed += 1;
    } else {
      kept.push(key);
    }
  }

  console.log(
    JSON.stringify(
      {
        valid_sources: validKeys.size,
        schedulers_before: schedulers.length,
        removed,
        kept: kept.length,
      },
      null,
      2,
    ),
  );

  await queue.close();
  await connection.quit();
}

void main();
