ALTER TABLE "chat_conversations"
ADD COLUMN "pinned_at" timestamp with time zone;

CREATE INDEX "chat_conversations_user_pinned_idx"
ON "chat_conversations" USING btree ("user_id","pinned_at");
