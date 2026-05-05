import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCategoryInsights } from "../lib/category-insights";

const base = {
  id: "i1",
  sourceName: "Source",
  platform: "rss",
  title: "Title",
  titleZh: null,
  contentZh: null,
  contentText: null,
  tags: [],
  publishedAt: "2026-05-05T00:00:00.000Z",
  fetchedAt: "2026-05-05T01:00:00.000Z",
};

describe("buildCategoryInsights", () => {
  it("counts classified, unclassified, source coverage, and draft candidates", () => {
    const insights = buildCategoryInsights([
      {
        ...base,
        id: "i1",
        sourceName: "A",
        categoryDomain: ["基础模型"],
        categoryTopic: ["论文研究"],
        categoryEntity: ["OpenAI"],
      },
      {
        ...base,
        id: "i2",
        sourceName: "B",
        categoryDomain: ["基础模型"],
        categoryTopic: ["论文研究"],
        categoryEntity: [],
      },
      {
        ...base,
        id: "i3",
        sourceName: "C",
        categoryDomain: [],
        categoryTopic: [],
        categoryEntity: [],
      },
    ]);

    assert.equal(insights.totalItems, 3);
    assert.equal(insights.classifiedItems, 2);
    assert.equal(insights.unclassifiedItems, 1);
    assert.equal(insights.candidateCount, 2);
    assert.equal(insights.byDimension.domain[0]?.value, "基础模型");
    assert.equal(insights.byDimension.domain[0]?.itemCount, 2);
    assert.equal(insights.byDimension.domain[0]?.sourceCount, 2);
    assert.equal(insights.byDimension.topic[0]?.value, "论文研究");
  });
});
