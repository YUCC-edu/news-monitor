import { describe, it, expect } from "vitest";
import { detectLangSimple } from "../src/lang";

describe("detectLangSimple", () => {
  it("detects zh when CJK is dominant", () => {
    expect(
      detectLangSimple("Claude Opus 4.7 正式发布，编码能力大幅提升"),
    ).toBe("zh");
  });

  it("treats mostly-English with sparse CJK as en (translation needed)", () => {
    expect(detectLangSimple("OpenAI 发布了 Claude Opus 4.7")).toBe("en");
  });

  it("detects en when no CJK", () => {
    expect(detectLangSimple("Anthropic released Claude Opus 4.7 today")).toBe(
      "en",
    );
  });

  it("returns en on empty input", () => {
    expect(detectLangSimple("")).toBe("en");
  });

  it("treats short mostly-CJK title as zh", () => {
    expect(detectLangSimple("模型上线")).toBe("zh");
  });
});
