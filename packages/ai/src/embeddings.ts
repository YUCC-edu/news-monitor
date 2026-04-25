import { getLlmClient, type LlmClient } from "./llm-client";
import { createHash } from "node:crypto";
import { aiMode, canonicalizeNewsText } from "@news/shared";

const TARGET_DIM = 1024;

export async function embedText(
  text: string,
  client?: LlmClient,
): Promise<number[]> {
  let vec: number[];
  if (!client && aiMode() !== "llm") {
    vec = deterministicFallbackEmbedding(text);
  } else {
    try {
      vec = await (client ?? getLlmClient()).embed(text);
    } catch (err) {
      // Fallback for providers without embeddings endpoint.
      console.warn(
        "[embedText] embedding API failed; using deterministic fallback (cluster quality may suffer)",
        err instanceof Error ? err.message : err,
      );
      vec = deterministicFallbackEmbedding(text);
    }
  }
  if (vec.length === TARGET_DIM) return vec;
  if (vec.length > TARGET_DIM) return vec.slice(0, TARGET_DIM);
  if (vec.length === 0) return Array(TARGET_DIM).fill(0);
  return [...vec, ...Array(TARGET_DIM - vec.length).fill(0)];
}

function deterministicFallbackEmbedding(text: string): number[] {
  const out = new Array<number>(TARGET_DIM).fill(0);
  const normalized = canonicalizeNewsText(text);
  const tokens = normalized.match(/[\p{Letter}\p{Number}]{2,}/gu) ?? [];
  const features = tokens.length > 0 ? tokens : [normalized || "empty"];

  for (const token of features.slice(0, 400)) {
    const digest = createHash("sha256").update(token).digest();
    const idx = digest.readUInt32BE(0) % TARGET_DIM;
    const sign = digest[4] % 2 === 0 ? 1 : -1;
    out[idx] += sign;
  }

  const norm = Math.sqrt(out.reduce((sum, v) => sum + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < out.length; i++) out[i] = out[i] / norm;
  }
  return out;
}
