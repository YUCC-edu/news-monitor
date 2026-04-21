import OpenAI from "openai";

export type LlmChatInput = {
  system: string;
  user: string;
};

export type LlmClient = {
  chatJson(input: LlmChatInput): Promise<string>;
  embed(text: string): Promise<number[]>;
};

let singleton: LlmClient | null = null;

function llmBaseForErrors(): string {
  const raw = process.env.LLM_BASE_URL ?? "";
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/+$/, "") || "";
    return `${u.origin}${path}` || raw;
  } catch {
    return raw.slice(0, 120);
  }
}

function rethrowWithLlmContext(label: "chat.completions" | "embeddings", err: unknown): never {
  const base = llmBaseForErrors();
  let status: number | undefined;
  if (err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number") {
    status = (err as { status: number }).status;
  }
  const msg = err instanceof Error ? err.message : String(err);
  const chatModel = process.env.LLM_CHAT_MODEL ?? "gpt-4o-mini";
  const embedModel = process.env.LLM_EMBEDDING_MODEL ?? "text-embedding-3-small";
  if (status === 404 || /\b404\b/.test(msg)) {
    throw new Error(
      `${label} HTTP 404: check LLM_BASE_URL (OpenAI-compatible base usually ends with /v1; avoid /v1/v1). ` +
        `SDK calls ${base}/chat/completions and ${base}/embeddings. ` +
        `Models: LLM_CHAT_MODEL=${chatModel} LLM_EMBEDDING_MODEL=${embedModel}. Original: ${msg}`,
    );
  }
  throw err instanceof Error ? err : new Error(msg);
}

export function getLlmClient(): LlmClient {
  if (singleton) return singleton;
  const baseURL = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_CHAT_MODEL ?? "gpt-4o-mini";
  const embeddingModel = process.env.LLM_EMBEDDING_MODEL ?? "text-embedding-3-small";
  if (!baseURL) throw new Error("LLM_BASE_URL is not set");
  if (!apiKey) throw new Error("LLM_API_KEY is not set");

  const openai = new OpenAI({ baseURL, apiKey });
  singleton = {
    async chatJson(input) {
      try {
        const resp = await openai.chat.completions.create({
          model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.user },
          ],
        });
        return resp.choices[0]?.message?.content ?? "{}";
      } catch (err) {
        rethrowWithLlmContext("chat.completions", err);
      }
    },
    async embed(text) {
      try {
        const resp = await openai.embeddings.create({
          model: embeddingModel,
          input: text,
        });
        return resp.data[0]?.embedding ?? [];
      } catch (err) {
        rethrowWithLlmContext("embeddings", err);
      }
    },
  };
  return singleton;
}
