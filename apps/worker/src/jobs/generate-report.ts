import type { Job } from "bullmq";
import { generateAndSaveDailyReport } from "@news/engine";

export async function handleGenerateReport(job: Job) {
  const data = (job.data ?? {}) as {
    audience?: "public" | "personal";
    range?: "24h" | "72h" | "7d" | "30d" | "90d";
    topN?: number;
    minSources?: number;
    trigger?: string;
    publishAfterGenerate?: boolean;
  };
  const report = await generateAndSaveDailyReport({
    audience: data.audience ?? "personal",
    range: data.range ?? "24h",
    topN: data.topN ?? 10,
    minSources: data.minSources ?? 1,
    trigger: data.trigger ?? "worker",
    timezone: process.env.REPORT_TIMEZONE ?? "Asia/Shanghai",
  });
  return {
    ok: true,
    reportId: report?.id,
    publishAfterGenerate: data.publishAfterGenerate !== false,
  };
}
