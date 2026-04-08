CREATE TABLE IF NOT EXISTS "chat_project_deployment_services" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "deployment_id" uuid NOT NULL REFERENCES "chat_project_deployments"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "service_key" varchar(120) NOT NULL,
  "kind" varchar(32) NOT NULL,
  "label" varchar(160) NOT NULL,
  "mode" varchar(24) NOT NULL DEFAULT 'managed',
  "engine" varchar(64),
  "env_prefix" varchar(48) NOT NULL DEFAULT '',
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "config_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "env_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "last_error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "chat_project_deployment_services_deployment_key_idx"
  ON "chat_project_deployment_services" ("deployment_id", "service_key");

CREATE INDEX IF NOT EXISTS "chat_project_deployment_services_deployment_idx"
  ON "chat_project_deployment_services" ("deployment_id");

CREATE INDEX IF NOT EXISTS "chat_project_deployment_services_user_idx"
  ON "chat_project_deployment_services" ("user_id", "created_at");

CREATE INDEX IF NOT EXISTS "chat_project_deployment_services_status_idx"
  ON "chat_project_deployment_services" ("status");
