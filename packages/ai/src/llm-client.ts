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
    },
    async embed(text) {
      const resp = await openai.embeddings.create({
        model: embeddingModel,
        input: text,
      });
      return resp.data[0]?.embedding ?? [];
    },
  };
  return singleton;
}
