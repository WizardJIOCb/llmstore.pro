ALTER TABLE "alice_user_settings"
  ADD COLUMN IF NOT EXISTS "last_task_command" text,
  ADD COLUMN IF NOT EXISTS "last_task_status" varchar(32),
  ADD COLUMN IF NOT EXISTS "last_task_response_text" text,
  ADD COLUMN IF NOT EXISTS "last_task_error" text,
  ADD COLUMN IF NOT EXISTS "last_task_started_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "last_task_completed_at" timestamp with time zone;
