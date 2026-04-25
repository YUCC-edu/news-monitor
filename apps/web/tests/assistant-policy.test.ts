import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPolicyRejectionMessage,
  getToolCapabilities,
  isToolAllowedByPolicy,
} from "../lib/assistant-policy";

test("assistant policy allows known non-file-write tools", () => {
  assert.equal(isToolAllowedByPolicy("list_source_health"), true);
  assert.equal(isToolAllowedByPolicy("add_source"), true);
  assert.equal(isToolAllowedByPolicy("trigger_fetch_source"), true);
});

test("assistant policy rejects unknown tools", () => {
  assert.equal(isToolAllowedByPolicy("unknown_tool"), false);
  const msg = buildPolicyRejectionMessage("unknown_tool");
  assert.match(msg, /policy/i);
});

test("assistant policy marks all allowed tools as file-write safe", () => {
  const tools = [
    "search_items",
    "list_trending_clusters",
    "list_source_health",
    "stats_report",
    "add_source",
    "trigger_fetch_source",
  ] as const;
  for (const tool of tools) {
    const caps = getToolCapabilities(tool);
    assert.equal(caps.writesSystemFiles, false);
  }
});
