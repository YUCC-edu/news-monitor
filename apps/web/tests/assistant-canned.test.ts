import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAddSourceExecutionFeedback,
  buildCannedAnswer,
  buildOpenExistingSourceAction,
  buildSuggestedRecoveryActions,
  detectAssistantIntent,
  pickStatsRangeFromMessage,
  shouldAutoScrollToBottom,
} from "../lib/assistant-canned";

test("intent detector recognizes health and stats intent", () => {
  assert.equal(detectAssistantIntent("查看当前信源健康状态"), "health");
  assert.equal(detectAssistantIntent("帮我生成近30天统计摘要"), "stats");
});

test("intent detector recognizes add source intent from url", () => {
  assert.equal(
    detectAssistantIntent("帮我新增 RSS 信源 https://example.com/feed.xml"),
    "add_source",
  );
});

test("stats range parser infers range from message", () => {
  assert.equal(pickStatsRangeFromMessage("给我近90天统计"), "90d");
  assert.equal(pickStatsRangeFromMessage("给我最近30天报告"), "30d");
  assert.equal(pickStatsRangeFromMessage("给我本周摘要"), "7d");
});

test("canned answer and recovery helper provide deterministic text", () => {
  const answer = buildCannedAnswer("health", {
    totalSources: 12,
    highRiskSources: 3,
  });
  assert.match(answer, /12/);
  assert.match(answer, /3/);

  const recovery = buildSuggestedRecoveryActions("permission denied");
  assert.ok(recovery.length > 0);
  assert.match(recovery.join(" "), /权限|assistant/i);
});

test("add_source execution feedback distinguishes conflict and created", () => {
  const conflict = buildAddSourceExecutionFeedback(
    {
      conflict: true,
      existing: { id: "src_1", name: "bmcnursing", kind: "rss" },
    },
    "/sources",
  );
  assert.match(conflict.answer, /已存在|未新增/);
  assert.equal(conflict.actions.length, 1);

  const created = buildAddSourceExecutionFeedback(
    {
      conflict: false,
      source: { id: "src_2", name: "new-source", kind: "rss" },
    },
    "/sources",
  );
  assert.match(created.answer, /新增成功/);
});

test("open existing source action builds navigation card", () => {
  const action = buildOpenExistingSourceAction({
    id: "abc123",
    name: "bmcnursing",
    kind: "rss",
  });
  assert.equal(action.mode, "navigate");
  assert.match(action.targetPath ?? "", /\/sources\?focus=abc123/);
});

test("auto scroll helper respects user reading history", () => {
  assert.equal(shouldAutoScrollToBottom({ scrollTop: 900, clientHeight: 100, scrollHeight: 1020 }), true);
  assert.equal(shouldAutoScrollToBottom({ scrollTop: 100, clientHeight: 100, scrollHeight: 1500 }), false);
});
