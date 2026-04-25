import { describe, expect, it } from "vitest";
import { dateTimeValue, toDateValue } from "../src/ops";

describe("hotspot date normalization", () => {
  it("normalizes string timestamps into Date objects", () => {
    const raw = "2026-04-24T08:30:00.000Z";
    const date = toDateValue(raw);

    expect(date).toBeInstanceOf(Date);
    expect(date?.toISOString()).toBe(raw);
  });

  it("returns 0 for invalid timestamps in sort fallbacks", () => {
    expect(dateTimeValue("not-a-date")).toBe(0);
    expect(dateTimeValue(null)).toBe(0);
  });
});
