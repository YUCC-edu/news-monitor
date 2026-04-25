import assert from "node:assert/strict";
import test from "node:test";
import {
  getPreferredContent,
  getUiCopy,
  normalizeTheme,
  normalizeUiLocale,
} from "../lib/ui-preferences";

test("normalizeUiLocale falls back to zh-CN", () => {
  assert.equal(normalizeUiLocale("zh-CN"), "zh-CN");
  assert.equal(normalizeUiLocale("en-US"), "en-US");
  assert.equal(normalizeUiLocale("en"), "zh-CN");
});

test("normalizeTheme accepts supported themes and falls back to dark", () => {
  assert.equal(normalizeTheme("dark"), "dark");
  assert.equal(normalizeTheme("light"), "light");
  assert.equal(normalizeTheme("paper"), "paper");
  assert.equal(normalizeTheme("claude"), "dark");
});

test("getPreferredContent uses translated fields for Chinese mode and raw fields for English mode", () => {
  const sample = {
    title: "OpenAI releases model update",
    titleZh: "OpenAI 发布模型更新",
    contentText: "Raw English body",
    contentZh: "中文摘要",
  };
  assert.equal(getPreferredContent(sample, "zh-CN", "title"), "OpenAI 发布模型更新");
  assert.equal(getPreferredContent(sample, "zh-CN", "content"), "中文摘要");
  assert.equal(getPreferredContent(sample, "en-US", "title"), "OpenAI releases model update");
  assert.equal(getPreferredContent(sample, "en-US", "content"), "Raw English body");
});

test("getPreferredContent falls back when preferred language is missing", () => {
  const sample = {
    title: "English only headline",
    titleZh: null,
    contentText: null,
    contentZh: "Only Chinese summary",
  };
  assert.equal(getPreferredContent(sample, "zh-CN", "title"), "English only headline");
  assert.equal(getPreferredContent(sample, "en-US", "content"), "Only Chinese summary");
});

test("getUiCopy returns localized labels", () => {
  assert.equal(getUiCopy("zh-CN").settingsTitle, "设置");
  assert.equal(getUiCopy("en-US").settingsTitle, "Settings");
  assert.equal(getUiCopy("en-US").appearanceLabel, "Appearance");
});
