import type { Job } from "bullmq";
import { runRetention } from "@news/db";

type RetentionJobData = {
  days?: number;
};

export async function handleRetention(job: Job<RetentionJobData>) {
  const days = job.data.days ?? 90;
  const result = await runRetention(days);
  return { ok: true, days, ...result };
}
