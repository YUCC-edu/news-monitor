import { describe, expect, it } from "vitest";
import { translateAndTag } from "../src/translate-tag";

describe("translateAndTag", () => {
  it("uses rule-based enrichment in core mode without calling the default LLM client", async () => {
    const prevMode = process.env.AI_MODE;
    const prevKey = process.env.LLM_API_KEY;
    const prevBase = process.env.LLM_BASE_URL;
    process.env.AI_MODE = "core";
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_BASE_URL;
    try {
      const out = await translateAndTag({
        title: "OpenAI launches agent platform",
        contentText: "Developers build AI agents",
      });
      expect(out.lang).toBe("en");
      expect(out.categoryDomain).toBeDefined();
    } finally {
      if (prevMode === undefined) delete process.env.AI_MODE;
      else process.env.AI_MODE = prevMode;
      if (prevKey === undefined) delete process.env.LLM_API_KEY;
      else process.env.LLM_API_KEY = prevKey;
      if (prevBase === undefined) delete process.env.LLM_BASE_URL;
      else process.env.LLM_BASE_URL = prevBase;
    }
  });

  it("parses JSON response and keeps controlled tags", async () => {
    const mockClient = {
      chatJson: async () =>
        JSON.stringify({
          lang: "en",
          title_zh: "OpenAI 发布新模型",
          tags: ["模型发布", "Agent", "CustomTagA", "CustomTagB", "CustomTagC"],
          category_entity: ["OpenAI"],
        }),
      embed: async () => Array(1024).fill(0),
    };

    const out = await translateAndTag(
      { title: "OpenAI released new model", contentText: "coding benchmark improved" },
      mockClient,
    );

    expect(out.lang).toBe("en");
    expect(out.titleZh).toBe("OpenAI 发布新模型");
    expect(out.tags).toEqual(["模型发布", "Agent", "CustomTagA", "CustomTagB"]);
    expect(out.categoryEntity).toContain("OpenAI");
  });

  it("accepts string taxonomy fields from LLM response", async () => {
    const mockClient = {
      chatJson: async () =>
        JSON.stringify({
          lang: "en",
          title_zh: "云服务发布更新",
          content_zh: "新增实例类型与区域。",
          tags: "云计算, 发布",
          category_domain: "Cloud",
          category_topic: "Release",
          category_entity: "AWS, EC2",
        }),
      embed: async () => Array(1024).fill(0),
    };

    const out = await translateAndTag(
      { title: "Cloud service update", contentText: "new instance types and regions" },
      mockClient,
    );

    expect(out.titleZh).toBe("云服务发布更新");
    expect(out.contentZh).toBe("新增实例类型与区域。");
    expect(out.categoryDomain.length).toBeGreaterThan(0);
    expect(out.categoryTopic.length).toBeGreaterThan(0);
    expect(out.categoryEntity).toContain("AWS");
  });

  it("falls back to rule-based enrichment when LLM returns invalid JSON", async () => {
    const mockClient = {
      chatJson: async () => "not json",
      embed: async () => Array(1024).fill(0),
    };

    const out = await translateAndTag(
      { title: "OpenAI launches agent platform", contentText: "developers build AI agents" },
      mockClient,
    );

    expect(out.lang).toBe("en");
    expect(out.tags).toEqual([]);
    expect(out.categoryDomain).toBeDefined();
    expect(out.categoryTopic).toBeDefined();
  });
});
