/**
 * 从 Redis 中移除 failed 作业（不自动重跑）。用于历史失败占满 removeOnFail 槽位、或已确认无需重试时清屏。
 *
 *   pnpm exec tsx --env-file=.env scripts/clean-failed-jobs.ts --queue fetch-source
 *   pnpm exec tsx --env-file=.env scripts/clean-failed-jobs.ts --queue enrich-item --apply
 *
 * 未传 --apply 时仅打印 failed 数量（dry-run）。
 */
import { Queue } from "bullmq";
import Redis from "ioredis";

function parseArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

async function main() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.error("REDIS_URL is not set");
    process.exit(1);
  }
  const queueName = parseArg("--queue");
  if (!queueName) {
    console.error('Usage: tsx scripts/clean-failed-jobs.ts --queue <fetch-source|enrich-item|...> [--apply]');
    process.exit(1);
  }
  const apply = process.argv.includes("--apply");
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(queueName, { connection });

  try {
    const counts = await queue.getJobCounts("failed");
    if (!apply) {
      console.log(
        JSON.stringify(
          {
            queue: queueName,
            dryRun: true,
            failed: counts.failed,
            hint: "Re-run with --apply to remove all failed jobs from Redis",
          },
          null,
          2,
        ),
      );
      return;
    }

    let total = 0;
    const batch = 100;
    for (;;) {
      const failed = await queue.getFailed(0, batch - 1);
      if (failed.length === 0) break;
      for (const job of failed) {
        await job.remove();
        total += 1;
      }
      if (failed.length < batch) break;
    }
    console.log(JSON.stringify({ queue: queueName, removed: total, apply: true }, null, 2));
  } finally {
    await queue.close();
    await connection.quit();
  }
}

void main();
