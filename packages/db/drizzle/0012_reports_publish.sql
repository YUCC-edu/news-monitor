CREATE TABLE IF NOT EXISTS "reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "report_date" text NOT NULL,
  "title" text NOT NULL,
  "audience" text NOT NULL DEFAULT 'personal',
  "range" text NOT NULL DEFAULT '24h',
  "top_n" integer NOT NULL DEFAULT 10,
  "min_sources" integer NOT NULL DEFAULT 1,
  "status" text NOT NULL DEFAULT 'draft',
  "draft" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "markdown" text NOT NULL,
  "wechat_html" text NOT NULL,
  "feishu_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "obsidian_markdown" text NOT NULL,
  "edited" boolean NOT NULL DEFAULT false,
  "generated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "reports_daily_unique" UNIQUE("report_date", "audience", "range")
);

CREATE TABLE IF NOT EXISTS "report_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "report_id" uuid,
  "trigger" text NOT NULL DEFAULT 'manual',
  "status" text NOT NULL DEFAULT 'running',
  "params" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error_message" text,
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "finished_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "publish_targets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "publish_targets_kind_unique" UNIQUE("kind")
);

CREATE TABLE IF NOT EXISTS "publish_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "report_id" uuid NOT NULL,
  "target_id" uuid,
  "target_kind" text NOT NULL,
  "trigger" text NOT NULL DEFAULT 'manual',
  "status" text NOT NULL DEFAULT 'running',
  "external_id" text,
  "external_url" text,
  "output" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error_message" text,
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_report_id_reports_id_fk"
    FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "publish_attempts" ADD CONSTRAINT "publish_attempts_report_id_reports_id_fk"
    FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "publish_attempts" ADD CONSTRAINT "publish_attempts_target_id_publish_targets_id_fk"
    FOREIGN KEY ("target_id") REFERENCES "publish_targets"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "reports_created_idx" ON "reports" ("created_at");
CREATE INDEX IF NOT EXISTS "reports_date_idx" ON "reports" ("report_date");
CREATE INDEX IF NOT EXISTS "reports_status_idx" ON "reports" ("status");
CREATE INDEX IF NOT EXISTS "report_runs_report_idx" ON "report_runs" ("report_id");
CREATE INDEX IF NOT EXISTS "report_runs_started_idx" ON "report_runs" ("started_at");
CREATE INDEX IF NOT EXISTS "report_runs_status_idx" ON "report_runs" ("status");
CREATE INDEX IF NOT EXISTS "publish_targets_enabled_idx" ON "publish_targets" ("enabled");
CREATE INDEX IF NOT EXISTS "publish_attempts_report_idx" ON "publish_attempts" ("report_id");
CREATE INDEX IF NOT EXISTS "publish_attempts_target_idx" ON "publish_attempts" ("target_kind");
CREATE INDEX IF NOT EXISTS "publish_attempts_status_idx" ON "publish_attempts" ("status");
CREATE INDEX IF NOT EXISTS "publish_attempts_created_idx" ON "publish_attempts" ("created_at");

INSERT INTO "publish_targets" ("kind", "enabled", "config")
VALUES
  ('wechat', true, '{}'::jsonb),
  ('feishu', true, '{}'::jsonb),
  ('obsidian', true, '{}'::jsonb)
ON CONFLICT ("kind") DO NOTHING;
