CREATE EXTENSION IF NOT EXISTS "vector";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "controlled_tags" (
	"tag" text PRIMARY KEY NOT NULL,
	"display_zh" text,
	"weight" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "item_enrichments" (
	"item_id" uuid NOT NULL,
	"lang" text,
	"title_zh" text,
	"content_zh" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"embedding" vector(1024),
	"cluster_id" uuid,
	"enriched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_enrichments_item_id_pk" PRIMARY KEY("item_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"url" text,
	"author" text,
	"title" text,
	"content_text" text,
	"media" jsonb DEFAULT '[]'::jsonb,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw" jsonb,
	CONSTRAINT "items_source_external_uniq" UNIQUE("source_id","external_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "keyword_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern" text NOT NULL,
	"is_regex" boolean DEFAULT false NOT NULL,
	"notify" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"fetch_interval_sec" integer DEFAULT 300 NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_ok_at" timestamp with time zone,
	"last_error" text,
	"fail_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_enrichments" ADD CONSTRAINT "item_enrichments_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_enrichments" ADD CONSTRAINT "item_enrichments_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "enr_cluster_idx" ON "item_enrichments" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "enr_tags_gin_idx" ON "item_enrichments" USING gin ("tags");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_source_published_idx" ON "items" USING btree ("source_id","published_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_fetched_idx" ON "items" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sources_kind_idx" ON "sources" USING btree ("kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sources_enabled_idx" ON "sources" USING btree ("enabled");