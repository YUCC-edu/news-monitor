CREATE TABLE IF NOT EXISTS "writing_style_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "status" text NOT NULL DEFAULT 'active',
  "rules" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "sample_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "writing_style_samples" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "profile_id" uuid NOT NULL,
  "title" text NOT NULL,
  "source_url" text,
  "content_markdown" text NOT NULL,
  "wechat_html" text,
  "cover_image_url" text,
  "inline_images" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "image_notes" text,
  "extracted" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "writing_style_samples" ADD CONSTRAINT "writing_style_samples_profile_id_profiles_id_fk"
    FOREIGN KEY ("profile_id") REFERENCES "writing_style_profiles"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "style_profile_id" uuid;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "styled_title" text;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "styled_markdown" text;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "styled_wechat_html" text;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "style_image_briefs" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "styled_at" timestamp with time zone;

DO $$ BEGIN
  ALTER TABLE "reports" ADD CONSTRAINT "reports_style_profile_id_profiles_id_fk"
    FOREIGN KEY ("style_profile_id") REFERENCES "writing_style_profiles"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "writing_style_profiles_status_idx" ON "writing_style_profiles" ("status");
CREATE INDEX IF NOT EXISTS "writing_style_profiles_updated_idx" ON "writing_style_profiles" ("updated_at");
CREATE INDEX IF NOT EXISTS "writing_style_samples_profile_idx" ON "writing_style_samples" ("profile_id");
CREATE INDEX IF NOT EXISTS "writing_style_samples_created_idx" ON "writing_style_samples" ("created_at");
CREATE INDEX IF NOT EXISTS "reports_style_profile_idx" ON "reports" ("style_profile_id");

INSERT INTO "writing_style_profiles" ("name", "description", "status", "rules", "sample_count")
SELECT 'Default WeChat Style', 'Imported WeChat article style profile', 'active', '{}'::jsonb, 0
WHERE NOT EXISTS (
  SELECT 1 FROM "writing_style_profiles" WHERE "status" = 'active'
);
