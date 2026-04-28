ALTER TABLE "item_enrichments"
  ADD COLUMN IF NOT EXISTS "full_content_text" text,
  ADD COLUMN IF NOT EXISTS "content_summary_zh" text,
  ADD COLUMN IF NOT EXISTS "content_extract_source" text NOT NULL DEFAULT 'feed',
  ADD COLUMN IF NOT EXISTS "content_quality_score" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "summary_version" text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "llm_keywords" text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS "event_summary" text;

CREATE INDEX IF NOT EXISTS "enr_llm_keywords_gin_idx" ON "item_enrichments" USING gin ("llm_keywords");
