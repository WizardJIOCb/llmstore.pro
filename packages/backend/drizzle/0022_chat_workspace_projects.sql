CREATE TABLE IF NOT EXISTS "chat_workspace_projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "title" varchar(255) NOT NULL,
  "slug" varchar(120) NOT NULL,
  "description" text,
  "root_path" text NOT NULL,
  "git_remote_url" text,
  "status" varchar(32) DEFAULT 'active' NOT NULL,
  "last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "chat_workspace_projects_user_slug_idx"
  ON "chat_workspace_projects" ("user_id", "slug");
CREATE INDEX IF NOT EXISTS "chat_workspace_projects_user_activity_idx"
  ON "chat_workspace_projects" ("user_id", "last_activity_at");

CREATE TABLE IF NOT EXISTS "chat_workspace_folders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "chat_workspace_projects"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "parent_folder_id" uuid REFERENCES "chat_workspace_folders"("id") ON DELETE cascade,
  "title" varchar(255) NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "chat_workspace_folders_project_parent_idx"
  ON "chat_workspace_folders" ("project_id", "parent_folder_id", "sort_order");
CREATE INDEX IF NOT EXISTS "chat_workspace_folders_user_idx"
  ON "chat_workspace_folders" ("user_id", "created_at");

ALTER TABLE "chat_conversations"
  ADD COLUMN IF NOT EXISTS "project_id" uuid REFERENCES "chat_workspace_projects"("id") ON DELETE set null,
  ADD COLUMN IF NOT EXISTS "project_folder_id" uuid REFERENCES "chat_workspace_folders"("id") ON DELETE set null,
  ADD COLUMN IF NOT EXISTS "project_sort_order" integer DEFAULT 0 NOT NULL;

CREATE INDEX IF NOT EXISTS "chat_conversations_project_idx"
  ON "chat_conversations" ("project_id", "project_folder_id", "project_sort_order");
