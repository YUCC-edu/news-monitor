/**
 * 聚类展示 BullMQ 失败作业，用于定位 fetch-source / enrich-item 根因。
 *
 *   pnpm exec tsx --env-file=.env scripts/inspect-queue-failures.ts
 *   pnpm exec tsx --env-file=.env scripts/inspect-queue-failures.ts --queue fetch-source
 */
import { Queue } from "bullmq";
import Redis from "ioredis";
import { categorizeErrorMessage, classifyRemediation } from "@news/shared";

const DEFAULT_QUEUES = ["fetch-source", "enrich-item"] as const;

function parseArgs() {
  const argv = process.argv.slice(2);
  const qIdx = argv.indexOf("--queue");
  const rIdx = argv.indexOf("--recent-minutes");
  const recentMinutes =
    rIdx !== -1 && argv[rIdx + 1] ? Number.parseInt(argv[rIdx + 1] ?? "", 10) : undefined;
  const parsedRecentMinutes = Number.isFinite(recentMinutes) && recentMinutes! > 0 ? recentMinutes : undefined;
  if (qIdx !== -1 && argv[qIdx + 1]) {
    return { queueNames: [argv[qIdx + 1]] as string[], recentMinutes: parsedRecentMinutes };
  }
  return { queueNames: [...DEFAULT_QUEUES], recentMinutes: parsedRecentMinutes };
}

function bucketReason(raw: string | undefined): string {
  if (!raw) return "(empty)";
  const oneLine = raw.split("\n")[0]?.trim() ?? raw;
  return oneLine.length > 160 ? `${oneLine.slice(0, 160)}…` : oneLine;
}

async function main() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.error("REDIS_URL is not set");
    process.exit(1);
  }
  const { queueNames, recentMinutes } = parseArgs();
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const sampleSize = 80;

  try {
    for (const name of queueNames) {
      const q = new Queue(name, { connection });
      try {
        const counts = await q.getJobCounts("waiting", "active", "completed", "failed", "delayed", "paused");
        const failedRaw = await q.getFailed(0, sampleSize - 1);
        const cutoffMs = recentMinutes ? Date.now() - recentMinutes * 60_000 : null;
        const failed = failedRaw.filter((job) => {
          if (!cutoffMs) return true;
          const ts = (job.failedOn ?? job.finishedOn ?? job.timestamp ?? 0) as number;
          return ts >= cutoffMs;
        });
        const buckets = new Map<string, number>();
        const byCategory = new Map<string, number>();
        const byRemediation = new Map<string, number>();
        for (const job of failed) {
          const k = bucketReason(job.failedReason);
          buckets.set(k, (buckets.get(k) ?? 0) + 1);
          const category = categorizeErrorMessage(job.failedReason);
          const remediation = classifyRemediation(category);
          byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
          byRemediation.set(remediation, (byRemediation.get(remediation) ?? 0) + 1);
        }
        const top = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
        const topCategories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
        const remediationSummary = [...byRemediation.entries()].sort((a, b) => b[1] - a[1]);

        console.log("\n===", name, "===");
        console.log(JSON.stringify({ counts, recentMinutes: recentMinutes ?? null }, null, 2));
        console.log(`failed (sampled up to ${failed.length} jobs${recentMinutes ? ` within ${recentMinutes}m` : ""}):`);
        if (topCategories.length > 0) {
          console.log("categories:");
          for (const [cat, n] of topCategories) {
            console.log(`  [${n}x] ${cat}`);
          }
        }
        if (remediationSummary.length > 0) {
          console.log("remediation suggestion:");
          for (const [mode, n] of remediationSummary) {
            console.log(`  [${n}x] ${mode}`);
          }
        }
        for (const [reason, n] of top) {
          console.log(`  [${n}x] ${reason}`);
        }
        if (failed.length > 0) {
          console.log("\nSample job payloads (first 5):");
          for (const job of failed.slice(0, 5)) {
            console.log(
              JSON.stringify(
                { id: job.id, name: job.name, data: job.data, failedReason: job.failedReason?.slice(0, 400) },
                null,
                2,
              ),
            );
          }
        }
      } finally {
        await q.close();
      }
    }
  } finally {
    await connection.quit();
  }
}

void main();
