import { z } from "zod";

const Schema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  RSSHUB_BASE: z.string().url(),
  WEWE_RSS_BASE: z.string().url().optional(),
  WEWE_RSS_AUTH_CODE: z.string().optional(),
  LLM_BASE_URL: z.string().url(),
  LLM_API_KEY: z.string().optional().default(""),
  LLM_CHAT_MODEL: z.string().default("gpt-4o-mini"),
  LLM_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
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
