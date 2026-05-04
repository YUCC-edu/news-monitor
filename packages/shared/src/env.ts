import { z } from "zod";

export const aiModeSchema = z.enum(["core", "llm", "agent"]).default("core");
export type AiMode = z.infer<typeof aiModeSchema>;

export function normalizeAiMode(raw: string | undefined): AiMode {
  return aiModeSchema.catch("core").parse(raw);
}

export function aiMode(input: NodeJS.ProcessEnv = process.env): AiMode {
  return normalizeAiMode(input.AI_MODE);
}

const BaseSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  RSSHUB_BASE: z.string().url(),
  WEWE_RSS_BASE: z.string().url().optional(),
  WEWE_RSS_AUTH_CODE: z.string().optional(),
  AI_MODE: aiModeSchema,
  LLM_BASE_URL: z.union([z.string().url(), z.literal("")]).optional().default(""),
  LLM_API_KEY: z.string().optional().default(""),
  LLM_CHAT_MODEL: z.string().default("gpt-4o-mini"),
  LLM_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  LLM_CONCURRENCY: z.coerce.number().int().min(1).max(16).optional().default(2),
  LLM_DAILY_REQUEST_BUDGET: z.coerce.number().int().min(0).max(1_000_000).optional().default(500),
  WECHAT_MP_APP_ID: z.string().optional().default(""),
  WECHAT_MP_APP_SECRET: z.string().optional().default(""),
  WECHAT_MP_DEFAULT_THUMB_MEDIA_ID: z.string().optional().default(""),
  FEISHU_WEBHOOK_URL: z.union([z.string().url(), z.literal("")]).optional().default(""),
  FEISHU_WEBHOOK_SECRET: z.string().optional().default(""),
  OBSIDIAN_VAULT_PATH: z.string().optional().default(""),
  REPORT_DAILY_TIME: z.string().regex(/^\d{2}:\d{2}$/).optional().default("08:30"),
  REPORT_TIMEZONE: z.string().optional().default("Asia/Shanghai"),
  ALLOW_LAN: z.enum(["0", "1"]).optional().default("0"),
  APP_ENFORCE_AUTH: z.enum(["0", "1"]).optional().default("1"),
  APP_ADMIN_TOKEN: z.string().optional().default(""),
  ASSISTANT_ENFORCE_AUTH: z.enum(["0", "1"]).optional().default("0"),
  ASSISTANT_API_KEY: z.string().optional().default(""),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional().default("info"),
  LOG_MODULES: z.string().optional().default(""),
});

const Schema = BaseSchema.superRefine((value, ctx) => {
  if (value.AI_MODE !== "llm") return;
  if (!value.LLM_BASE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["LLM_BASE_URL"],
      message: "LLM_BASE_URL is required when AI_MODE=llm",
    });
  }
  if (!value.LLM_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["LLM_API_KEY"],
      message: "LLM_API_KEY is required when AI_MODE=llm",
    });
  }
});

export type Env = z.infer<typeof Schema>;

export function parseEnv(input: NodeJS.ProcessEnv = process.env): Env {
  return Schema.parse(input);
}

let cached: Env | null = null;
export function env(): Env {
  if (!cached) cached = parseEnv();
  return cached;
}
