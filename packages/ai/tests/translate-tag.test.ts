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
  });
});
