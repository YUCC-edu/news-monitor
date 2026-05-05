import assert from "node:assert/strict";
import test from "node:test";
import { DASH_NAV, filterAndScore, PRODUCT_NAV_SECTIONS } from "../lib/global-search";

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

test("product navigation exposes the five approved sections", () => {
  assert.deepEqual(
    PRODUCT_NAV_SECTIONS.map((section) => section.id),
    ["today", "read", "briefs", "sources", "settings"],
  );
  assert.deepEqual(
    PRODUCT_NAV_SECTIONS.map((section) => section.label),
    ["Today", "Read", "Briefs", "Sources", "Settings"],
  );
});

test("command navigation still includes existing feature pages", () => {
  const hrefs = new Set(DASH_NAV.map((entry) => entry.href));
  for (const href of [
    "/",
    "/all",
    "/reports",
    "/sources",
    "/recommended-sources",
    "/creators",
    "/health",
    "/settings",
    "/ops",
  ]) {
    assert.equal(hrefs.has(href), true, `${href} should remain discoverable`);
  }
});

test("command navigation keeps english product labels for localized consumers", () => {
  assert.equal(DASH_NAV.find((entry) => entry.href === "/all")?.labelEn, "Read");
  assert.equal(DASH_NAV.find((entry) => entry.href === "/search")?.labelEn, "Search");
});
