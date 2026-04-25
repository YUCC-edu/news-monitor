import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { deleteSource, getSourceById, markSourceRun, upsertSource } from "../src/ops";

const hasDb = Boolean(process.env.DATABASE_URL);

const createdSourceIds: string[] = [];

describe.skipIf(!hasDb)("markSourceRun (integration)", () => {
  afterEach(async () => {
    while (createdSourceIds.length > 0) {
      const id = createdSourceIds.pop();
      if (id) await deleteSource(id);
    }
  });

  async function createTestSource() {
    const id = randomUUID();
    const result = await upsertSource({
      kind: "rss",
      name: `mark-source-run-test-${id}`,
      config: { feedUrl: `https://example.com/${id}.xml` },
      enabled: true,
      fetchIntervalSec: 300,
    });
    if (!result || "conflict" in result) throw new Error("failed to create test source");
    createdSourceIds.push(result.id);
    return result.id;
  }

  it("records failure metadata without masking the original fetch error", async () => {
    const sourceId = await createTestSource();
    const at = new Date("2026-01-15T12:00:00.000Z");

    const meta = await markSourceRun(sourceId, {
      ok: false,
      at,
      error: "Status code 404",
    });
    const row = await getSourceById(sourceId);

    expect(meta?.failCount).toBe(1);
    expect(meta?.enabled).toBe(true);
    expect(meta?.nextRunAfter).toBeInstanceOf(Date);
    expect(row?.lastRunAt?.toISOString()).toBe(at.toISOString());
    expect(row?.lastError).toBe("Status code 404");
    expect(row?.failCount).toBe(1);
    expect(row?.nextRunAfter).toBeInstanceOf(Date);
  });

  it("resets failure state on success and auto-disables after repeated failures", async () => {
    const sourceId = await createTestSource();

    for (let i = 0; i < 10; i += 1) {
      await markSourceRun(sourceId, { ok: false, error: `failed-${i}` });
    }
    const failed = await getSourceById(sourceId);
    expect(failed?.enabled).toBe(false);
    expect(failed?.failCount).toBe(10);
    expect(failed?.nextRunAfter).toBeInstanceOf(Date);

    await markSourceRun(sourceId, { ok: true });
    const recovered = await getSourceById(sourceId);
    expect(recovered?.failCount).toBe(0);
    expect(recovered?.lastError).toBeNull();
    expect(recovered?.nextRunAfter).toBeNull();
  });
});
