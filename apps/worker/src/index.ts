import { Worker, Queue } from "bullmq";
import Redis from "ioredis";
import { register } from "@news/connectors-core";
import { hnConnector } from "@news/connectors-hn";
import { rssConnector } from "@news/connectors-rss";
import { xRsshubConnector } from "@news/connectors-x-rsshub";
import { wechatWeweConnector } from "@news/connectors-wechat-wewe";
import { handleFetchSource } from "./jobs/fetch-source";
import { handleEnrichItem } from "./jobs/enrich-item";
import { handleNameCluster } from "./jobs/name-cluster";
import { handleRetention } from "./jobs/retention";
import { FETCH_QUEUE_NAME, subscribeSourceChanges, syncRepeatJobs } from "./scheduler";
import { closePublisher } from "./ipc/publish";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error("REDIS_URL is not set");
}

register(hnConnector);
register(rssConnector);
register(xRsshubConnector);
register(wechatWeweConnector);

const queueConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const workerConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const enrichQueueConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const enrichWorkerConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const subConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });

const queue = new Queue(FETCH_QUEUE_NAME, { connection: queueConnection });
const enrichQueue = new Queue("enrich-item", { connection: enrichQueueConnection });
const nameClusterQueue = new Queue("name-cluster", { connection: enrichQueueConnection });
const retentionQueue = new Queue("retention", { connection: enrichQueueConnection });
const worker = new Worker(
  FETCH_QUEUE_NAME,
  async (job) =>
    handleFetchSource(job, {
      onInsertedItemIds: async (itemIds) => {
        await Promise.all(
          itemIds.map((itemId) =>
            enrichQueue.add(
              "enrich-item",
              { itemId },
              { removeOnComplete: 100, removeOnFail: 200, attempts: 3 },
            ),
          ),
        );
      },
    }),
  {
    connection: workerConnection,
    concurrency: 8,
  },
);
const enrichWorker = new Worker(
  "enrich-item",
  async (job) => {
    const result = await handleEnrichItem(job);
    if (result.ok && result.clusterId) {
      if (result.isNewCluster) {
        await nameClusterQueue.add(
          "name-cluster",
          { clusterId: result.clusterId },
          { removeOnComplete: 100, removeOnFail: 200, attempts: 3 },
        );
      } else {
        await nameClusterQueue.add(
          "name-cluster",
          { clusterId: result.clusterId },
          {
            jobId: `debounce-name-${result.clusterId}`,
            delay: 90_000,
            removeOnComplete: 100,
            removeOnFail: 200,
            attempts: 3,
          },
        );
      }
    }
    return result;
  },
  {
    connection: enrichWorkerConnection,
    concurrency: 4,
  },
);
const nameClusterWorker = new Worker(
  "name-cluster",
  async (job) => handleNameCluster(job),
  {
    connection: enrichWorkerConnection,
    concurrency: 2,
  },
);
const retentionWorker = new Worker(
  "retention",
  async (job) => handleRetention(job),
  {
    connection: enrichWorkerConnection,
    concurrency: 1,
  },
);

async function main() {
  await syncRepeatJobs(queue);
  await retentionQueue.upsertJobScheduler(
    "daily-retention",
    { pattern: "0 0 3 * * *" },
    {
      name: "retention",
      data: { days: 90 },
      opts: { removeOnComplete: 50, removeOnFail: 200 },
    },
  );
  subscribeSourceChanges(subConnection, queue);
  console.log("[worker] scheduler ready");
}

worker.on("completed", (job, result) => {
  console.log(`[worker] completed ${job.name} ${job.id}`, result);
});
worker.on("failed", (job, error) => {
  console.error(`[worker] failed ${job?.name} ${job?.id}`, error);
});
enrichWorker.on("completed", (job, result) => {
  console.log(`[worker] completed ${job.name} ${job.id}`, result);
});
enrichWorker.on("failed", (job, error) => {
  console.error(`[worker] failed ${job?.name} ${job?.id}`, error);
});
nameClusterWorker.on("completed", (job, result) => {
  console.log(`[worker] completed ${job.name} ${job.id}`, result);
});
nameClusterWorker.on("failed", (job, error) => {
  console.error(`[worker] failed ${job?.name} ${job?.id}`, error);
});
retentionWorker.on("completed", (job, result) => {
  console.log(`[worker] completed ${job.name} ${job.id}`, result);
});
retentionWorker.on("failed", (job, error) => {
  console.error(`[worker] failed ${job?.name} ${job?.id}`, error);
});

async function shutdown() {
  await worker.close();
  await enrichWorker.close();
  await nameClusterWorker.close();
  await retentionWorker.close();
  await queue.close();
  await enrichQueue.close();
  await nameClusterQueue.close();
  await retentionQueue.close();
  await subConnection.quit();
  await queueConnection.quit();
  await workerConnection.quit();
  await enrichQueueConnection.quit();
  await enrichWorkerConnection.quit();
  await closePublisher();
}

void main();

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});
