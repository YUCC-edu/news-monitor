import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/env";

const base = {
  DATABASE_URL: "postgres://news:news@127.0.0.1:55432/news",
  REDIS_URL: "redis://127.0.0.1:6379",
  RSSHUB_BASE: "http://127.0.0.1:1200",
};

describe("parseEnv", () => {
  it("defaults to core mode without LLM configuration", () => {
    const parsed = parseEnv(base);
    expect(parsed.AI_MODE).toBe("core");
    expect(parsed.LLM_BASE_URL).toBe("");
    expect(parsed.LLM_API_KEY).toBe("");
  });

  it("requires LLM settings only in llm mode", () => {
    expect(() => parseEnv({ ...base, AI_MODE: "llm" })).toThrow(/LLM_BASE_URL/);
    expect(() =>
      parseEnv({
        ...base,
        AI_MODE: "llm",
        LLM_BASE_URL: "https://api.example.com/v1",
        LLM_API_KEY: "test-key",
      }),
    ).not.toThrow();
  });
});
