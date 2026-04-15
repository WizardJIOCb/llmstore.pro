CREATE TABLE "alice_webhook_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "chat_id" uuid,
  "yandex_skill_user_id" varchar(255),
  "yandex_application_id" varchar(255),
  "session_id" varchar(255),
  "request_id" varchar(255),
  "message_id" integer,
  "request_type" varchar(100),
  "command" text,
  "original_utterance" text,
  "request_json" jsonb,
  "response_json" jsonb,
  "response_text" text,
  "response_status_code" integer DEFAULT 200 NOT NULL,
  "response_size_bytes" integer,
  "status" varchar(20) DEFAULT 'success' NOT NULL,
  "error_code" varchar(100),
  "error_message" text,
  "is_new_user" boolean,
  "bonus_granted" boolean,
  "ip_address" varchar(255),
  "user_agent" text,
  "duration_ms" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alice_webhook_logs"
ADD CONSTRAINT "alice_webhook_logs_user_id_users_id_fk"
FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "alice_webhook_logs"
ADD CONSTRAINT "alice_webhook_logs_chat_id_chat_conversations_id_fk"
FOREIGN KEY ("chat_id") REFERENCES "public"."chat_conversations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "alice_webhook_logs_created_idx"
ON "alice_webhook_logs" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "alice_webhook_logs_user_id_idx"
ON "alice_webhook_logs" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "alice_webhook_logs_chat_id_idx"
ON "alice_webhook_logs" USING btree ("chat_id");
--> statement-breakpoint
CREATE INDEX "alice_webhook_logs_skill_user_id_idx"
ON "alice_webhook_logs" USING btree ("yandex_skill_user_id");
--> statement-breakpoint
CREATE INDEX "alice_webhook_logs_application_id_idx"
ON "alice_webhook_logs" USING btree ("yandex_application_id");
--> statement-breakpoint
CREATE INDEX "alice_webhook_logs_session_id_idx"
ON "alice_webhook_logs" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX "alice_webhook_logs_status_idx"
ON "alice_webhook_logs" USING btree ("status");
