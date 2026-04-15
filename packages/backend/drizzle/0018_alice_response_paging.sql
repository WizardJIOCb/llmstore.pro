ALTER TABLE "alice_user_settings"
  ADD COLUMN IF NOT EXISTS "last_task_response_offset" integer NOT NULL DEFAULT 0;
