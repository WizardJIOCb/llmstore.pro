CREATE TABLE "chat_conversation_daily_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "day" date NOT NULL,
  "total_views" integer DEFAULT 0 NOT NULL,
  "unique_views" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_conversation_daily_views"
ADD CONSTRAINT "chat_conversation_daily_views_conversation_id_chat_conversations_id_fk"
FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "chat_conversation_daily_views_conversation_day_idx"
ON "chat_conversation_daily_views" USING btree ("conversation_id","day");
--> statement-breakpoint
CREATE INDEX "chat_conversation_daily_views_conversation_idx"
ON "chat_conversation_daily_views" USING btree ("conversation_id");
--> statement-breakpoint
CREATE INDEX "chat_conversation_daily_views_day_idx"
ON "chat_conversation_daily_views" USING btree ("day");
