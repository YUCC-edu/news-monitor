import { describe, expect, it } from "vitest";
import { translateAndTag } from "../src/translate-tag";

describe("translateAndTag", () => {
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
});
