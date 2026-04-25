import { describe, expect, it } from "vitest";
import { embedText } from "../src/embeddings";

describe("embedText", () => {
  it("uses canonicalized fallback embeddings for equivalent model-name variants", async () => {
    const prevMode = process.env.AI_MODE;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_BASE_URL;
    process.env.AI_MODE = "core";
    try {
      const a = await embedText("DeepSeek V4 发布");
      const b = await embedText("DeepSeek-V4 发布");
      expect(a).toEqual(b);
    } finally {
      if (prevMode === undefined) delete process.env.AI_MODE;
      else process.env.AI_MODE = prevMode;
    }
  });
});
