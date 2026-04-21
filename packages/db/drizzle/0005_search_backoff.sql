ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "next_run_after" timestamp with time zone;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "items_title_trgm_idx" ON "items" USING gin ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "item_enrichments_embedding_ivfflat_idx" ON "item_enrichments" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 50);
