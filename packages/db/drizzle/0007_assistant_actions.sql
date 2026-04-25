CREATE TABLE IF NOT EXISTS "assistant_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_id" text NOT NULL,
  "actor" text NOT NULL,
  "role" text DEFAULT 'assistant_read' NOT NULL,
  "tool" text NOT NULL,
  "status" text NOT NULL,
  "input_summary" text,
  "output_summary" text,
  "error_message" text,
  "latency_ms" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_actions_request_idx" ON "assistant_actions" USING btree ("request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_actions_created_idx" ON "assistant_actions" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_actions_tool_idx" ON "assistant_actions" USING btree ("tool");
