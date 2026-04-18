import { getLlmClient, type LlmClient } from "./llm-client";
import { createHash } from "node:crypto";

const TARGET_DIM = 1024;

export async function embedText(
  text: string,
  client: LlmClient = getLlmClient(),
): Promise<number[]> {
  let vec: number[];
  try {
    vec = await client.embed(text);
  } catch (err) {
    // Fallback for providers without embeddings endpoint.
    console.warn(
      "[embedText] embedding API failed; using deterministic fallback (cluster quality may suffer)",
      err instanceof Error ? err.message : err,
    );
    vec = deterministicFallbackEmbedding(text);
  }
  if (vec.length === TARGET_DIM) return vec;
  if (vec.length > TARGET_DIM) return vec.slice(0, TARGET_DIM);
  if (vec.length === 0) return Array(TARGET_DIM).fill(0);
  return [...vec, ...Array(TARGET_DIM - vec.length).fill(0)];
}

function deterministicFallbackEmbedding(text: string): number[] {
  const out = new Array<number>(TARGET_DIM);
  for (let i = 0; i < TARGET_DIM; i++) {
    const digest = createHash("sha256").update(`${i}:${text}`).digest();
    const n = digest.readUInt32BE(0);
    out[i] = (n / 0xffffffff) * 2 - 1;
  }
  return out;
}
