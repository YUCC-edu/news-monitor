import assert from "node:assert/strict";
import test from "node:test";
import { filterAndScore } from "../lib/global-search";

test("filterAndScore prioritizes exact and prefix matches", () => {
  const rows = [
    { title: "设置", subtitle: "系统设置" },
    { title: "设置面板", subtitle: "环境变量编辑" },
    { title: "统计", subtitle: "数据看板" },
  ];
  const out = filterAndScore(rows, "设置");
  assert.equal(out.length, 2);
  assert.equal(out[0]?.row.title, "设置");
  assert.equal(out[1]?.row.title, "设置面板");
  assert.ok(out[0]!.score > out[1]!.score);
});

test("filterAndScore returns all rows when query empty", () => {
  const rows = [{ title: "A" }, { title: "B" }];
  const out = filterAndScore(rows, "");
  assert.equal(out.length, 2);
});
