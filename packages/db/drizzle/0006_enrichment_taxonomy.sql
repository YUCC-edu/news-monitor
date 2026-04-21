ALTER TABLE "item_enrichments"
  ADD COLUMN "category_domain" text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN "category_topic" text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN "category_entity" text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX "enr_category_domain_gin_idx" ON "item_enrichments" USING gin ("category_domain");
CREATE INDEX "enr_category_topic_gin_idx" ON "item_enrichments" USING gin ("category_topic");
CREATE INDEX "enr_category_entity_gin_idx" ON "item_enrichments" USING gin ("category_entity");
