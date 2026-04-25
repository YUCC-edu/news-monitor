import assert from "node:assert/strict";
import test from "node:test";
import {
  recommendedActionButtonStyle,
  recommendedActionGridStyle,
  recommendedCardStyle,
} from "../lib/recommended-source-layout";

test("recommended source card layout enforces consistent card and action sizing", () => {
  assert.equal(recommendedCardStyle.height, "100%");
  assert.equal(recommendedCardStyle.display, "flex");
  assert.equal(recommendedCardStyle.flexDirection, "column");
  assert.equal(recommendedActionGridStyle.gridTemplateColumns, "repeat(2, minmax(0, 1fr))");
  assert.equal(recommendedActionButtonStyle.width, "100%");
  assert.equal(recommendedActionButtonStyle.minHeight, 40);
});
