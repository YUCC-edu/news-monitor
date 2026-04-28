import { Worker, Queue } from "bullmq";
import Redis from "ioredis";
import { register } from "@news/connectors-core";
import { hnConnector } from "@news/connectors-hn";
import { rssConnector } from "@news/connectors-rss";
import { xRsshubConnector, xRsshubSearchConnector } from "@news/connectors-x-rsshub";
import { wechatWeweConnector } from "@news/connectors-wechat-wewe";
import { aiMode, categorizeErrorMessage, classifyRemediation, createLogger } from "@news/shared";
import { handleFetchSource } from "./jobs/fetch-source";
import { handleEnrichItem } from "./jobs/enrich-item";
import { handleNameCluster } from "./jobs/name-cluster";
import { handleRetention } from "./jobs/retention";
import { handleRecommendXSignals } from "./jobs/recommend-x-signals";
import {
  FETCH_QUEUE_NAME,
  removeSourceSchedule,
  subscribeSourceChanges,
  syncRepeatJobs,
} from "./scheduler";
import { closePublisher } from "./ipc/publish";

const log = createLogger("worker:index");

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error("REDIS_URL is not set");
}

register(hnConnector);
register(rssConnector);
register(xRsshubConnector);
register(xRsshubSearchConnector);
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
const recommendXSignalsQueue = new Queue("recommend-x-signals", { connection: enrichQueueConnection });
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
      onAfterFetchFailure: async ({ sourceId, meta }) => {
        if (meta?.autoDisabled) {
          await removeSourceSchedule(queue, sourceId);
          await queueConnection.publish(
            "sources.changed",
            JSON.stringify({ op: "upsert", id: sourceId }),
          );
        }
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
const recommendXSignalsWorker = new Worker(
  "recommend-x-signals",
  async (job) => {
    const result = await handleRecommendXSignals(job);
    if (result.ok && Array.isArray(result.created) && result.created.length > 0) {
      await syncRepeatJobs(queue);
      await Promise.all(
        result.created.map((sourceId) =>
          queue.add(FETCH_QUEUE_NAME, { sourceId }, { removeOnComplete: 100, removeOnFail: 200 }),
        ),
      );
    }
    return result;
  },
  {
    connection: enrichWorkerConnection,
    concurrency: 1,
  },
);

function logJobFailure(queueName: string, job: { id?: string; name?: string; data?: unknown } | undefined, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const errorClass = error instanceof Error ? error.name : typeof error;
  const category = categorizeErrorMessage(message);
  const remediation = classifyRemediation(category);
  const payload = {
    queue: queueName,
    jobName: job?.name,
    jobId: job?.id,
    data: job?.data,
    errorClass,
    errorCategory: category,
    remediation,
    error,
  };
  if (remediation === "retry") {
    log.warn("job failed (likely transient; retry path preferred)", payload);
    return;
  }
  if (remediation === "manual") {
    log.warn("job failed (manual fix required)", payload);
    return;
  }
  log.error("job failed (unknown classification)", payload);
}

async function main() {
  log.info("worker booting", {
    aiMode: aiMode(),
    fetchConcurrency: 8,
    enrichConcurrency: 4,
    nameClusterConcurrency: 2,
    retentionConcurrency: 1,
  });
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
  await recommendXSignalsQueue.upsertJobScheduler(
    "daily-recommend-x-signals",
    { pattern: "0 20 3 * * *" },
    {
      name: "recommend-x-signals",
      data: { limit: 8 },
      opts: { removeOnComplete: 50, removeOnFail: 200 },
    },
  );
  subscribeSourceChanges(subConnection, queue);
  log.info("scheduler ready");
}

worker.on("completed", (job, result) => {
  log.info("job completed", { queue: FETCH_QUEUE_NAME, jobName: job.name, jobId: job.id, data: job.data, result });
});
worker.on("failed", (job, error) => {
  logJobFailure(FETCH_QUEUE_NAME, job, error);
});
enrichWorker.on("completed", (job, result) => {
  log.info("job completed", { queue: "enrich-item", jobName: job.name, jobId: job.id, data: job.data, result });
});
enrichWorker.on("failed", (job, error) => {
  logJobFailure("enrich-item", job, error);
});
nameClusterWorker.on("completed", (job, result) => {
  log.info("job completed", { queue: "name-cluster", jobName: job.name, jobId: job.id, data: job.data, result });
});
nameClusterWorker.on("failed", (job, error) => {
  logJobFailure("name-cluster", job, error);
});
retentionWorker.on("completed", (job, result) => {
  log.info("job completed", { queue: "retention", jobName: job.name, jobId: job.id, data: job.data, result });
});
retentionWorker.on("failed", (job, error) => {
  logJobFailure("retention", job, error);
});
recommendXSignalsWorker.on("completed", (job, result) => {
  log.info("job completed", { queue: "recommend-x-signals", jobName: job.name, jobId: job.id, data: job.data, result });
});
recommendXSignalsWorker.on("failed", (job, error) => {
  logJobFailure("recommend-x-signals", job, error);
});

async function shutdown() {
  log.info("worker shutting down");
  await worker.close();
  await enrichWorker.close();
  await nameClusterWorker.close();
  await retentionWorker.close();
  await recommendXSignalsWorker.close();
  await queue.close();
  await enrichQueue.close();
  await nameClusterQueue.close();
  await retentionQueue.close();
  await recommendXSignalsQueue.close();
  await subConnection.quit();
  await queueConnection.quit();
  await workerConnection.quit();
  await enrichQueueConnection.quit();
  await enrichWorkerConnection.quit();
  await closePublisher();
}

void main().catch((error) => {
  log.error("worker crashed during startup", { error });
  process.exit(1);
});

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});
