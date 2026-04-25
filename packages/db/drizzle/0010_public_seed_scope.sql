ALTER TABLE "sources"
  ADD COLUMN IF NOT EXISTS "scope" text NOT NULL DEFAULT 'personal';

UPDATE "sources"
SET "scope" = COALESCE(NULLIF("scope", ''), 'personal')
WHERE "scope" IS NULL
   OR "scope" NOT IN ('public_seed', 'personal');

CREATE INDEX IF NOT EXISTS "sources_scope_idx" ON "sources" ("scope");
