import { Queue } from "bullmq";
import type Redis from "ioredis";
import { listSources } from "@news/db";

const FETCH_QUEUE_NAME = "fetch-source";

export async function syncRepeatJobs(queue: Queue) {
  const sources = await listSources();
  const enabled = sources.filter((source) => source.enabled);
  await Promise.all(
    enabled.map((source) =>
      queue.upsertJobScheduler(
        `source:${source.id}`,
        { every: source.fetchIntervalSec * 1000 },
        {
          name: FETCH_QUEUE_NAME,
          data: { sourceId: source.id },
          opts: { removeOnComplete: 100, removeOnFail: 200 },
        },
      ),
    ),
  );
}

export async function removeSourceSchedule(queue: Queue, sourceId: string) {
  await queue.removeJobScheduler(`source:${sourceId}`);
}

export function subscribeSourceChanges(subscriber: Redis, queue: Queue) {
  subscriber.subscribe("sources.changed");
  subscriber.on("message", async (channel, raw) => {
    if (channel !== "sources.changed") return;
    try {
      const message = JSON.parse(raw) as { op?: string; id?: string };
      if (message.op === "delete" && message.id) {
        await removeSourceSchedule(queue, message.id);
        return;
      }
      await syncRepeatJobs(queue);
    } catch (error) {
      console.error("[worker] failed to process sources.changed", error);
    }
  });
}

export { FETCH_QUEUE_NAME };
