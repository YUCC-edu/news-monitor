import { createHmac } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  createPublishAttempt,
  ensurePublishTargets,
  finishPublishAttempt,
  getPublishAttempt,
  getReportWithAttempts,
  listWritingStyleSamples,
  setReportStatus,
  type PublishTargetKind,
} from "@news/db";
import { renderTopicCards, type ReportDraft } from "./reports";
import { buildWechatDraftArticle } from "./writing-style";

export type PublishReportInput = {
  reportId: string;
  targetKinds?: PublishTargetKind[];
  trigger?: string;
};

type PublishResult = {
  externalId?: string | null;
  externalUrl?: string | null;
  output?: unknown;
};

let wechatTokenCache: { token: string; expiresAt: number; appId: string } | null = null;
let wechatThumbMediaIdCache: string | null = null;

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function getWechatAccessToken() {
  const appId = requireEnv("WECHAT_MP_APP_ID");
  const secret = requireEnv("WECHAT_MP_APP_SECRET");
  if (wechatTokenCache && wechatTokenCache.appId === appId && wechatTokenCache.expiresAt > Date.now() + 120_000) {
    return wechatTokenCache.token;
  }
  const response = await fetch("https://api.weixin.qq.com/cgi-bin/stable_token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credential",
      appid: appId,
      secret,
      force_refresh: false,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    errcode?: number;
    errmsg?: string;
  };
  if (!response.ok || !data.access_token) {
    throw new Error(`WeChat token failed: ${data.errmsg ?? response.statusText}`);
  }
  wechatTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, data.expires_in ?? 7200) * 1000,
    appId,
  };
  return data.access_token;
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

async function getFallbackWechatCoverImageUrl() {
  const samples = await listWritingStyleSamples(20);
  return samples.find((sample) => sample.coverImageUrl?.trim())?.coverImageUrl?.trim() ?? "";
}

export async function uploadWechatPermanentImageMaterial(input: {
  accessToken: string;
  imageUrl: string;
  fetchImpl?: FetchLike;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const imageResponse = await fetchImpl(input.imageUrl, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!imageResponse.ok) {
    throw new Error(`WeChat cover image download failed: ${imageResponse.statusText || imageResponse.status}`);
  }
  const contentType = imageResponse.headers.get("content-type") ?? "image/jpeg";
  const bytes = await imageResponse.arrayBuffer();
  if (bytes.byteLength === 0) throw new Error("WeChat cover image is empty");
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("WeChat cover image is larger than 10MB");

  const form = new FormData();
  const filename = contentType.includes("png") ? "news-monitor-cover.png" : "news-monitor-cover.jpg";
  form.append("media", new Blob([bytes], { type: contentType }), filename);
  const uploadResponse = await fetchImpl(
    `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${encodeURIComponent(input.accessToken)}&type=image`,
    { method: "POST", body: form },
  );
  const data = (await uploadResponse.json().catch(() => ({}))) as {
    media_id?: string;
    url?: string;
    errcode?: number;
    errmsg?: string;
  };
  if (!uploadResponse.ok || !data.media_id) {
    throw new Error(`WeChat material upload failed: ${data.errmsg ?? uploadResponse.statusText}`);
  }
  return data.media_id;
}

export async function resolveWechatThumbMediaId(input: {
  accessToken: string;
  configuredMediaId?: string | null;
  fallbackImageUrl?: string | null;
  fetchImpl?: FetchLike;
}) {
  const configuredMediaId = input.configuredMediaId?.trim();
  if (configuredMediaId) return configuredMediaId;
  if (wechatThumbMediaIdCache) return wechatThumbMediaIdCache;
  const fallbackImageUrl = input.fallbackImageUrl?.trim();
  if (!fallbackImageUrl) {
    throw new Error("WECHAT_MP_DEFAULT_THUMB_MEDIA_ID is not configured and no writing-style cover image is available");
  }
  wechatThumbMediaIdCache = await uploadWechatPermanentImageMaterial({
    accessToken: input.accessToken,
    imageUrl: fallbackImageUrl,
    fetchImpl: input.fetchImpl,
  });
  return wechatThumbMediaIdCache;
}

async function publishWechatDraft(report: NonNullable<Awaited<ReturnType<typeof getReportWithAttempts>>>): Promise<PublishResult> {
  const accessToken = await getWechatAccessToken();
  const thumbMediaId = await resolveWechatThumbMediaId({
    accessToken,
    configuredMediaId: process.env.WECHAT_MP_DEFAULT_THUMB_MEDIA_ID,
    fallbackImageUrl: await getFallbackWechatCoverImageUrl(),
  });
  const article = buildWechatDraftArticle(report);
  const response = await fetch(`https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      articles: [
        {
          title: article.title.slice(0, 64),
          author: article.author,
          digest: article.digest,
          content: article.content,
          thumb_media_id: thumbMediaId,
          show_cover_pic: 0,
          need_open_comment: 0,
          only_fans_can_comment: 0,
        },
      ],
    }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    media_id?: string;
    errcode?: number;
    errmsg?: string;
  };
  if (!response.ok || !data.media_id) {
    throw new Error(`WeChat draft failed: ${data.errmsg ?? response.statusText}`);
  }
  return { externalId: data.media_id, output: data };
}

export function signFeishuWebhook(timestamp: string, secret: string) {
  return createHmac("sha256", `${timestamp}\n${secret}`).digest("base64");
}

async function publishFeishu(report: NonNullable<Awaited<ReturnType<typeof getReportWithAttempts>>>): Promise<PublishResult> {
  const webhookUrl = requireEnv("FEISHU_WEBHOOK_URL");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const secret = process.env.FEISHU_WEBHOOK_SECRET?.trim();
  const body = {
    ...(report.feishuPayload && typeof report.feishuPayload === "object" ? report.feishuPayload as Record<string, unknown> : {}),
    ...(secret ? { timestamp, sign: signFeishuWebhook(timestamp, secret) } : {}),
  };
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as {
    code?: number;
    StatusCode?: number;
    msg?: string;
    message?: string;
  };
  const code = data.code ?? data.StatusCode ?? 0;
  if (!response.ok || code !== 0) {
    throw new Error(`Feishu webhook failed: ${data.msg ?? data.message ?? response.statusText}`);
  }
  return { output: data };
}

function safeVaultPath(vaultRoot: string, relativePath: string) {
  const root = path.resolve(vaultRoot);
  const full = path.resolve(root, relativePath);
  const rootCmp = root.toLowerCase();
  const fullCmp = full.toLowerCase();
  if (fullCmp !== rootCmp && !fullCmp.startsWith(`${rootCmp}${path.sep}`)) {
    throw new Error(`Refusing to write outside Obsidian vault: ${relativePath}`);
  }
  return full;
}

export function obsidianRelativePaths(draft: ReportDraft) {
  return {
    daily: path.join("Daily", `${draft.reportDate}.md`),
    topics: renderTopicCards(draft).map((card) => path.join("Topics", `${card.slug}.md`)),
  };
}

async function publishObsidian(report: NonNullable<Awaited<ReturnType<typeof getReportWithAttempts>>>): Promise<PublishResult> {
  const vaultRoot = requireEnv("OBSIDIAN_VAULT_PATH");
  const draft = report.draft as ReportDraft;
  const dailyPath = safeVaultPath(vaultRoot, path.join("Daily", `${draft.reportDate}.md`));
  await fs.mkdir(path.dirname(dailyPath), { recursive: true });
  await fs.writeFile(dailyPath, report.obsidianMarkdown, "utf-8");

  const topicOutputs: string[] = [];
  for (const card of renderTopicCards(draft)) {
    const topicPath = safeVaultPath(vaultRoot, path.join("Topics", `${card.slug}.md`));
    await fs.mkdir(path.dirname(topicPath), { recursive: true });
    let existing = "";
    try {
      existing = await fs.readFile(topicPath, "utf-8");
    } catch {
      existing = `# ${card.title}\n\n`;
    }
    if (!existing.includes(`## ${draft.reportDate} - ${card.title}`)) {
      await fs.writeFile(topicPath, `${existing.trimEnd()}\n\n${card.markdown}`, "utf-8");
    }
    topicOutputs.push(topicPath);
  }
  return {
    externalId: dailyPath,
    externalUrl: dailyPath,
    output: { dailyPath, topicPaths: topicOutputs },
  };
}

async function publishOne(kind: PublishTargetKind, report: NonNullable<Awaited<ReturnType<typeof getReportWithAttempts>>>) {
  switch (kind) {
    case "wechat":
      return publishWechatDraft(report);
    case "feishu":
      return publishFeishu(report);
    case "obsidian":
      return publishObsidian(report);
  }
}

export async function publishReport(input: PublishReportInput) {
  const report = await getReportWithAttempts(input.reportId);
  if (!report) throw new Error("report not found");
  const targets = await ensurePublishTargets();
  const enabledTargets = targets.filter((target) => target.enabled);
  const selectedKinds = input.targetKinds?.length ? new Set(input.targetKinds) : null;
  const selectedTargets = enabledTargets.filter((target) =>
    selectedKinds ? selectedKinds.has(target.kind as PublishTargetKind) : true,
  );
  const results = [];
  for (const target of selectedTargets) {
    const targetKind = target.kind as PublishTargetKind;
    const attempt = await createPublishAttempt({
      reportId: report.id,
      targetId: target.id,
      targetKind,
      trigger: input.trigger ?? "manual",
    });
    if (!attempt) continue;
    try {
      const result = await publishOne(targetKind, report);
      results.push(await finishPublishAttempt({ id: attempt.id, status: "ok", ...result }));
    } catch (error) {
      results.push(await finishPublishAttempt({
        id: attempt.id,
        status: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
      }));
    }
  }
  const okCount = results.filter((result) => result?.status === "ok").length;
  const errorCount = results.filter((result) => result?.status === "error").length;
  await setReportStatus(report.id, errorCount === 0 ? "published" : okCount > 0 ? "partial" : "failed");
  return { reportId: report.id, attempts: results, okCount, errorCount };
}

export async function retryPublishAttempt(attemptId: string) {
  const attempt = await getPublishAttempt(attemptId);
  if (!attempt) throw new Error("publish attempt not found");
  return publishReport({
    reportId: attempt.reportId,
    targetKinds: [attempt.targetKind as PublishTargetKind],
    trigger: "retry",
  });
}
