import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRecommendedSourceSections,
  getRecommendedSourceSignature,
  isRecommendedSourceInLibrary,
  listRecommendedAiSources,
} from "../lib/recommended-ai-sources";

test("listRecommendedAiSources returns a curated AI-only catalog", () => {
  const rows = listRecommendedAiSources();
  assert.ok(rows.length >= 22);
  assert.ok(rows.some((row) => row.id === "simon-willison"));
  assert.ok(rows.some((row) => row.id === "openai-news"));
  assert.ok(rows.some((row) => row.id === "qbitai"));
  assert.ok(rows.some((row) => row.id === "machine-heart"));
  assert.ok(rows.some((row) => row.id === "tencent-hunyuan"));
  assert.ok(rows.every((row) => (row.tags ?? []).includes("ai")));
  assert.ok(rows.every((row) => row.kind === "rss" || row.kind === "hn"));
});

test("getRecommendedSourceSignature is stable for equivalent source identities", () => {
  const rows = listRecommendedAiSources();
  const openai = rows.find((row) => row.id === "openai-news");
  assert.ok(openai);

  const sigA = getRecommendedSourceSignature({
    kind: openai!.kind,
    config: { feedUrl: "https://openai.com/news/rss.xml", extra: { b: 2, a: 1 } },
  });
  const sigB = getRecommendedSourceSignature({
    kind: openai!.kind,
    config: { feedUrl: "https://openai.com/news/rss.xml/", avatarUrl: "https://example.com/avatar.png" },
  });
  assert.equal(sigA, sigB);
});

test("buildRecommendedSourceSections groups catalog into stable newsroom sections", () => {
  const sections = buildRecommendedSourceSections(listRecommendedAiSources());
  assert.deepEqual(
    sections.map((section) => section.key),
    ["high-signal", "chinese", "official", "industry", "research"],
  );
  assert.ok(sections.every((section) => section.items.length > 0));
});

test("isRecommendedSourceInLibrary uses optimistic additions immediately", () => {
  const rows = listRecommendedAiSources();
  const item = rows.find((row) => row.id === "machine-heart");
  assert.ok(item);
  const signature = getRecommendedSourceSignature({ kind: item!.kind, config: item!.config });
  assert.equal(isRecommendedSourceInLibrary(item!, new Set(), new Set()), false);
  assert.equal(isRecommendedSourceInLibrary(item!, new Set([signature]), new Set()), true);
  assert.equal(isRecommendedSourceInLibrary(item!, new Set(), new Set([signature])), true);
});

test("isRecommendedSourceInLibrary recognizes installed sources after reload", () => {
  const rows = listRecommendedAiSources();
  const item = rows.find((row) => row.id === "openai-news");
  assert.ok(item);
  const installedSignature = getRecommendedSourceSignature({
    kind: "rss",
    config: {
      feedUrl: "https://openai.com/news/rss.xml/",
      origin: "preset-import",
      avatarUrl: "https://example.com/openai.png",
    },
  });

  assert.equal(isRecommendedSourceInLibrary(item!, new Set([installedSignature]), new Set()), true);
});
