import { promises as fs } from "node:fs";
import path from "node:path";
import {
  createPublishAttempt,
  ensurePublishTargets,
  finishPublishAttempt,
  getReportWithAttempts,
  setReportStatus,
} from "@news/db";
import {
  generateAndSaveDailyReport,
  normalizeReportAudience,
  normalizeReportRange,
  type ReportAudience,
  type ReportRange,
} from "./reports";
import {
  createWechatDraftWithArticle,
  getWechatAccessTokenForPublish,
  resolveWechatThumbMediaId,
  uploadWechatPermanentImageMaterialBytes,
} from "./publishers";
import { buildWechatDraftArticle, type ReportWithStyledFields } from "./writing-style";

export type WechatDraftImageProvider = "agent-image2" | "http-api" | "none";
export type WechatDraftMode = "prepare" | "complete";

export type WechatDraftReturnedImage = {
  slotId: string;
  localPath?: string;
  url?: string;
  alt?: string;
};

export type WechatDraftInput = {
  intent?: string;
  topic?: string;
  audience?: ReportAudience;
  range?: ReportRange;
  topN?: number;
  minSources?: number;
  imageProvider?: WechatDraftImageProvider;
  mode?: WechatDraftMode;
  reportId?: string;
  images?: WechatDraftReturnedImage[];
  allowWebSupplement?: boolean;
};

export type NormalizedWechatDraftInput = {
  intent: string;
  topic?: string;
  audience: ReportAudience;
  range: ReportRange;
  topN: number;
  minSources: number;
  imageProvider: WechatDraftImageProvider;
  mode: WechatDraftMode;
  reportId?: string;
  images?: WechatDraftReturnedImage[];
  allowWebSupplement: boolean;
};

export type WechatDraftImageSlot = {
  slotId: "cover" | `section-${number}`;
  kind: "cover" | "section";
  topic: string;
  prompt: string;
  required: boolean;
};

export type UploadedWechatImage = {
  slotId: string;
  url: string;
  alt?: string;
};

export type WechatDraftWorkflowReport = ReportWithStyledFields & {
  id: string;
  styleImageBriefs?: unknown;
};

export type WechatDraftPrepareResult = {
  status: "needs_images" | "ready_without_images";
  reportId: string;
  title: string;
  digest: string;
  contentSource: "styled" | "factual";
  markdown: string;
  wechatHtml: string;
  imageProvider: WechatDraftImageProvider;
  imageSlots: WechatDraftImageSlot[];
  nextAction: string;
};

export type WechatDraftCompleteResult = {
  status: "draft_created";
  reportId: string;
  attemptId: string;
  draftMediaId: string;
  title: string;
  uploadedImages: Array<{
    slotId: string;
    mediaId: string;
    url?: string;
  }>;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const int = Math.trunc(value);
  if (int < min || int > max) return fallback;
  return int;
}

function normalizeImageProvider(value: unknown): WechatDraftImageProvider {
  if (value === "http-api" || value === "none") return value;
  return "agent-image2";
}

export function normalizeWechatDraftInput(raw: unknown): NormalizedWechatDraftInput {
  const input = raw && typeof raw === "object" ? raw as WechatDraftInput : {};
  return {
    intent: cleanText(input.intent) || "最近热点内容",
    topic: cleanText(input.topic) || undefined,
    audience: normalizeReportAudience(input.audience),
    range: normalizeReportRange(input.range),
    topN: clampInt(input.topN, 10, 1, 30),
    minSources: clampInt(input.minSources, 1, 1, 20),
    imageProvider: normalizeImageProvider(input.imageProvider),
    mode: input.mode === "complete" ? "complete" : "prepare",
    reportId: cleanText(input.reportId) || undefined,
    images: Array.isArray(input.images) ? input.images : undefined,
    allowWebSupplement: input.allowWebSupplement === true,
  };
}

export function imageSlotsFromBriefs(briefs: unknown): WechatDraftImageSlot[] {
  if (!Array.isArray(briefs)) return [];
  let sectionIndex = 0;
  const slots: WechatDraftImageSlot[] = [];
  for (const brief of briefs) {
    if (!brief || typeof brief !== "object") continue;
    const row = brief as { kind?: unknown; topic?: unknown; prompt?: unknown };
    const kind = row.kind === "cover" ? "cover" : "section";
    const slotId = kind === "cover" ? "cover" : `section-${++sectionIndex}` as const;
    slots.push({
      slotId,
      kind,
      topic: cleanText(row.topic) || "AI",
      prompt: cleanText(row.prompt) || "clean editorial AI image",
      required: kind === "cover",
    });
  }
  return slots;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function validateReturnedImages(
  slots: WechatDraftImageSlot[],
  images: WechatDraftReturnedImage[] | null | undefined,
) {
  const returned = images ?? [];
  const slotIds = new Set(slots.map((slot) => slot.slotId));
  for (const image of returned) {
    if (!slotIds.has(image.slotId as WechatDraftImageSlot["slotId"])) {
      throw new Error(`unknown_image_slot: ${image.slotId}`);
    }
    if (!cleanText(image.localPath) && !cleanText(image.url)) {
      throw new Error(`missing_image_location: ${image.slotId}`);
    }
  }
  const returnedIds = new Set(returned.map((image) => image.slotId));
  const missing = slots.find((slot) => slot.required && !returnedIds.has(slot.slotId));
  if (missing) {
    throw new Error(`missing_required_image: ${missing.slotId}`);
  }
  return returned;
}

export function replaceImagePlaceholders(html: string, images: UploadedWechatImage[]) {
  let out = html;
  for (const image of images) {
    const alt = escapeHtml(cleanText(image.alt) || image.slotId);
    const img = `<img src="${escapeHtml(image.url)}" alt="${alt}" style="max-width:100%;height:auto;display:block;margin:18px auto;" />`;
    const escapedSlot = image.slotId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(
      new RegExp(`<p[^>]*>\\s*image2:\\s*${escapedSlot}\\s*</p>`, "gi"),
      `<p style="text-align:center;">${img}</p>`,
    );
    out = out.replace(new RegExp(`\\[\\[image2:${escapedSlot}\\]\\]`, "gi"), img);
  }
  return out;
}

export function buildWechatDraftPrepareResult(input: {
  report: WechatDraftWorkflowReport;
  input: NormalizedWechatDraftInput;
}): WechatDraftPrepareResult {
  const article = buildWechatDraftArticle(input.report);
  const imageSlots = imageSlotsFromBriefs(input.report.styleImageBriefs);
  const needsImages = input.input.imageProvider !== "none" && imageSlots.length > 0;
  return {
    status: needsImages ? "needs_images" : "ready_without_images",
    reportId: input.report.id,
    title: article.title,
    digest: article.digest,
    contentSource: article.contentSource,
    markdown: article.markdown,
    wechatHtml: article.content,
    imageProvider: input.input.imageProvider,
    imageSlots,
    nextAction: needsImages
      ? "Generate the returned imageSlots with image2, then call mode=complete with reportId and images."
      : "No generated images are required before creating or reviewing the draft.",
  };
}

async function loadWorkflowReport(reportId: string) {
  const report = await getReportWithAttempts(reportId);
  if (!report) throw new Error(`report_not_found: ${reportId}`);
  return report as WechatDraftWorkflowReport;
}

async function prepareWechatDraft(input: NormalizedWechatDraftInput): Promise<WechatDraftPrepareResult> {
  const report = input.reportId
    ? await loadWorkflowReport(input.reportId)
    : await generateAndSaveDailyReport({
        audience: input.audience,
        range: input.range,
        topN: input.topN,
        minSources: input.minSources,
        trigger: "agent-wechat-draft",
        timezone: process.env.REPORT_TIMEZONE ?? "Asia/Shanghai",
      }) as WechatDraftWorkflowReport | null;
  if (!report) throw new Error("report_create_failed");
  return buildWechatDraftPrepareResult({ report, input });
}

function contentTypeForPath(localPath: string) {
  const ext = path.extname(localPath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

function filenameForReturnedImage(image: WechatDraftReturnedImage) {
  const source = image.localPath || image.url || `${image.slotId}.jpg`;
  const parsed = source.startsWith("http://") || source.startsWith("https://")
    ? new URL(source).pathname
    : source;
  const base = path.basename(parsed) || `${image.slotId}.jpg`;
  return base.includes(".") ? base : `${base}.jpg`;
}

async function loadReturnedImage(image: WechatDraftReturnedImage) {
  if (image.localPath) {
    const resolved = path.resolve(image.localPath);
    const bytes = await fs.readFile(resolved);
    return {
      bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      contentType: contentTypeForPath(resolved),
      filename: filenameForReturnedImage(image),
    };
  }
  if (image.url) {
    const response = await fetch(image.url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!response.ok) throw new Error(`image_download_failed: ${image.slotId}`);
    return {
      bytes: await response.arrayBuffer(),
      contentType: response.headers.get("content-type") ?? "image/jpeg",
      filename: filenameForReturnedImage(image),
    };
  }
  throw new Error(`missing_image_location: ${image.slotId}`);
}

async function requestHttpProviderImages(slots: WechatDraftImageSlot[]) {
  const endpoint = process.env.IMAGE_PROVIDER_ENDPOINT?.trim();
  if (!endpoint) throw new Error("IMAGE_PROVIDER_ENDPOINT is not configured");
  const headers: Record<string, string> = { "content-type": "application/json" };
  const key = process.env.IMAGE_PROVIDER_API_KEY?.trim();
  if (key) headers.authorization = `Bearer ${key}`;
  const timeoutMs = Number(process.env.IMAGE_PROVIDER_TIMEOUT_MS ?? 120000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 120000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ slots }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({})) as { images?: WechatDraftReturnedImage[]; error?: string };
    if (!response.ok || !Array.isArray(data.images)) {
      throw new Error(`image_provider_failed: ${data.error ?? response.statusText}`);
    }
    return data.images;
  } finally {
    clearTimeout(timer);
  }
}

export async function completeWechatDraft(input: NormalizedWechatDraftInput): Promise<WechatDraftCompleteResult> {
  if (!input.reportId) throw new Error("reportId is required for complete mode");
  const report = await loadWorkflowReport(input.reportId);
  const slots = imageSlotsFromBriefs(report.styleImageBriefs);
  const returnedImages = validateReturnedImages(slots, input.images);
  const targets = await ensurePublishTargets();
  const wechatTarget = targets.find((target) => target.kind === "wechat");
  const attempt = await createPublishAttempt({
    reportId: report.id,
    targetId: wechatTarget?.id ?? null,
    targetKind: "wechat",
    trigger: "agent",
  });
  if (!attempt) throw new Error("publish_attempt_create_failed");
  try {
    const accessToken = await getWechatAccessTokenForPublish();
    const uploadedImages = [];
    for (const image of returnedImages) {
      const loaded = await loadReturnedImage(image);
      const uploaded = await uploadWechatPermanentImageMaterialBytes({
        accessToken,
        bytes: loaded.bytes,
        contentType: loaded.contentType,
        filename: loaded.filename,
      });
      uploadedImages.push({
        slotId: image.slotId,
        mediaId: uploaded.mediaId,
        url: uploaded.url,
        alt: image.alt,
      });
    }
    const cover = uploadedImages.find((image) => image.slotId === "cover");
    const thumbMediaId = cover?.mediaId ?? await resolveWechatThumbMediaId({
      accessToken,
      configuredMediaId: process.env.WECHAT_MP_DEFAULT_THUMB_MEDIA_ID,
    });
    const article = buildWechatDraftArticle(report);
    const content = replaceImagePlaceholders(
      article.content,
      uploadedImages
        .filter((image): image is typeof image & { url: string } => Boolean(image.url))
        .map((image) => ({ slotId: image.slotId, url: image.url, alt: image.alt })),
    );
    const draft = await createWechatDraftWithArticle({
      accessToken,
      thumbMediaId,
      article: { ...article, content },
    });
    const finished = await finishPublishAttempt({
      id: attempt.id,
      status: "ok",
      externalId: draft.media_id,
      output: { draft, uploadedImages },
    });
    await setReportStatus(report.id, "published");
    return {
      status: "draft_created",
      reportId: report.id,
      attemptId: finished?.id ?? attempt.id,
      draftMediaId: draft.media_id ?? "",
      title: article.title,
      uploadedImages: uploadedImages.map(({ alt: _alt, ...image }) => image),
    };
  } catch (error) {
    await finishPublishAttempt({
      id: attempt.id,
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    await setReportStatus(report.id, "failed");
    throw error;
  }
}

export async function createWechatDraftWorkflow(rawInput: unknown) {
  const input = normalizeWechatDraftInput(rawInput);
  if (input.mode === "complete") return completeWechatDraft(input);
  const prepared = await prepareWechatDraft(input);
  if (input.imageProvider === "http-api" && prepared.imageSlots.length > 0) {
    const images = await requestHttpProviderImages(prepared.imageSlots);
    return completeWechatDraft({ ...input, mode: "complete", reportId: prepared.reportId, images });
  }
  return prepared;
}
