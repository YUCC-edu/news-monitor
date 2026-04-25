import { describe, expect, it } from "vitest";
import { executeCapability, parseCapabilityInput } from "../src/index";

describe("engine capability contract", () => {
  it("parses defaults for hotspots.list", () => {
    const parsed = parseCapabilityInput("hotspots.list", {});
    expect(parsed.limit).toBe(20);
    expect(parsed.mode).toBe("consensus");
    expect(parsed.range).toBe("7d");
    expect(parsed.sortBy).toBe("published");
  });

  it("parses defaults for stats.overview dual hotspot views", () => {
    const parsed = parseCapabilityInput("stats.overview", {});
    expect(parsed.clusterSort).toBe("hybrid");
    expect(parsed.minSources).toBe(2);
  });

  it("returns invalid_input envelope for malformed sources.fetch", async () => {
    const result = await executeCapability("sources.fetch", { sourceId: "nope" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_input");
    }
  });
});
