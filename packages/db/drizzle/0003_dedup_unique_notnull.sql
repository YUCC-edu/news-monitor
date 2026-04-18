-- Backfill any rows still missing dedup_key (run scripts/dedup-sources.ts first for semantic keys)
UPDATE "sources" SET "dedup_key" = 'legacy:' || "id"::text WHERE "dedup_key" IS NULL OR "dedup_key" = '';
--> statement-breakpoint
ALTER TABLE "sources" ALTER COLUMN "dedup_key" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sources_kind_dedup_uniq" ON "sources" ("kind", "dedup_key");
