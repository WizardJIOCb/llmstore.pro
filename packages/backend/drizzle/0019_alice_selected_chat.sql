ALTER TABLE "alice_user_settings"
ADD COLUMN "selected_chat_id" uuid;

ALTER TABLE "alice_user_settings"
ADD CONSTRAINT "alice_user_settings_selected_chat_id_chat_conversations_id_fk"
FOREIGN KEY ("selected_chat_id") REFERENCES "public"."chat_conversations"("id")
ON DELETE set null ON UPDATE no action;
