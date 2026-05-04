import Redis from "ioredis";
import { Queue } from "bullmq";

const FETCH_QUEUE_NAME = "fetch-source";
const ENRICH_QUEUE_NAME = "enrich-item";
const GENERATE_REPORT_QUEUE_NAME = "generate-report";
const PUBLISH_REPORT_QUEUE_NAME = "publish-report";

let fetchQueue: Queue | null = null;
let enrichQueue: Queue | null = null;
let generateReportQueue: Queue | null = null;
let publishReportQueue: Queue | null = null;

function getConnection() {
  const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
  redis.on("error", () => {
    // Queue callers handle command failures; keep ioredis from emitting unhandled errors.
  });
  return redis;
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

function getGenerateReportQueue() {
  if (!generateReportQueue) {
    generateReportQueue = new Queue(GENERATE_REPORT_QUEUE_NAME, { connection: getConnection() });
  }
  return generateReportQueue;
}

function getPublishReportQueue() {
  if (!publishReportQueue) {
    publishReportQueue = new Queue(PUBLISH_REPORT_QUEUE_NAME, { connection: getConnection() });
  }
  return publishReportQueue;
}

export async function enqueueFetchSource(sourceId: string) {
  await getFetchQueue().add(
    FETCH_QUEUE_NAME,
    { sourceId },
    { removeOnComplete: 100, removeOnFail: 200 },
  );
}

export async function enqueueGenerateReport(input?: {
  audience?: "public" | "personal";
  range?: "24h" | "72h" | "7d" | "30d" | "90d";
  topN?: number;
  minSources?: number;
  trigger?: string;
  publishAfterGenerate?: boolean;
}) {
  await getGenerateReportQueue().add(
    GENERATE_REPORT_QUEUE_NAME,
    input ?? {},
    { removeOnComplete: 100, removeOnFail: 200, attempts: 2 },
  );
}

export async function enqueuePublishReport(input: {
  reportId: string;
  targetKinds?: Array<"wechat" | "feishu" | "obsidian">;
  trigger?: string;
}) {
  await getPublishReportQueue().add(
    PUBLISH_REPORT_QUEUE_NAME,
    input,
    { removeOnComplete: 100, removeOnFail: 200, attempts: 1 },
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
