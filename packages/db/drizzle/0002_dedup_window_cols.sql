ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "dedup_key" text;
--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "initial_fetch_days" integer;
--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "max_item_age_days" integer;
