import { describe, expect, it } from "vitest";
import { capabilityCatalog, executeCapability, parseCapabilityInput } from "../src/index";

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

  it("parses defaults for reports.agentBrief", () => {
    const parsed = parseCapabilityInput("reports.agentBrief", {});
    expect(parsed.range).toBe("24h");
    expect(parsed.audience).toBe("personal");
    expect(parsed.topN).toBe(10);
    expect(parsed.minSources).toBe(1);
  });

  it("accepts the wechat draft create capability", () => {
    const parsed = parseCapabilityInput("wechatDraft.create", {
      intent: "最新研究解读",
      imageProvider: "agent-image2",
      mode: "prepare",
    });
    expect(parsed.intent).toBe("最新研究解读");
    expect(capabilityCatalog["wechatDraft.create"].writesData).toBe(true);
  });

  it("returns invalid_input envelope for malformed sources.fetch", async () => {
    const result = await executeCapability("sources.fetch", { sourceId: "nope" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_input");
    }
  });
});
