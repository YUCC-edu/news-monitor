import type { Job } from "bullmq";
import { publishReport } from "@news/engine";

export async function handlePublishReport(job: Job) {
  const data = (job.data ?? {}) as {
    reportId?: string;
    targetKinds?: Array<"wechat" | "feishu" | "obsidian">;
    trigger?: string;
  };
  if (!data.reportId) throw new Error("reportId is required");
  return publishReport({
    reportId: data.reportId,
    targetKinds: data.targetKinds,
    trigger: data.trigger ?? "worker",
  });
}
