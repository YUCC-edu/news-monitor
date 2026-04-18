import { getConnector } from "@news/connectors-core";
import type { Job } from "bullmq";
import {
  getSourceById,
  markSourceRun,
  recordItems,
  updateSourceAvatarUrl,
} from "@news/db";
import { publish } from "../ipc/publish";
import { filterItemsWithFirstFetchRelaxation } from "./relax-rss-wechat-first-fetch";

type FetchSourceJobData = {
  sourceId: string;
};

type FetchSourceOptions = {
  onInsertedItemIds?: (itemIds: string[]) => Promise<void>;
};

export async function handleFetchSource(
  job: Job<FetchSourceJobData>,
  options: FetchSourceOptions = {},
) {
  const source = await getSourceById(job.data.sourceId);
  if (!source || !source.enabled) return { ok: false, reason: "source-not-found-or-disabled" };

  try {
    const connector = getConnector(
      source.kind as "rss" | "hn" | "x-rsshub" | "wechat-wewe",
    );
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 25_000);
    try {
      const fetchResult = await connector.fetch({
        source: {
          id: source.id,
          config: source.config,
          lastOkAt: source.lastOkAt,
        },
        now: new Date(),
        signal: ac.signal,
      });
      const normalized = fetchResult.items;
      const avatarUrl = fetchResult.sourceMeta?.avatarUrl;
      if (avatarUrl) {
        await updateSourceAvatarUrl(source.id, avatarUrl);
      }

      const now = new Date();
      const firstFetchDefault = Number(process.env.FIRST_FETCH_MAX_AGE_DAYS ?? 1);
      const fresh = filterItemsWithFirstFetchRelaxation({
        kind: source.kind,
        lastOkAt: source.lastOkAt,
        initialFetchDays: source.initialFetchDays,
        maxItemAgeDays: source.maxItemAgeDays,
        firstFetchMaxAgeDaysDefault: firstFetchDefault,
        items: normalized,
        now,
      });

      const inserted = await recordItems(source.id, fresh);
      await markSourceRun(source.id, { ok: true });
      if (inserted.length > 0 && options.onInsertedItemIds) {
        await options.onInsertedItemIds(inserted.map((row) => row.id));
      }

      for (const row of inserted) {
        await publish("news.events", {
          type: "item.created",
          item: {
            id: row.id,
            sourceId: source.id,
            sourceName: source.name,
            platform: source.kind,
            title: row.title,
          },
        });
      }
      return { ok: true, fetched: normalized.length, inserted: inserted.length };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markSourceRun(source.id, { ok: false, error: message });
    throw error;
  }
}
