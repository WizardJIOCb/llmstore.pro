CREATE TABLE IF NOT EXISTS "chat_message_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "message_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "run_id" uuid,
  "tool_call_id" varchar(255),
  "storage_filename" varchar(255) NOT NULL,
  "original_name" varchar(500) NOT NULL,
  "mime_type" varchar(200) NOT NULL,
  "kind" varchar(20) DEFAULT 'file' NOT NULL,
  "size" integer NOT NULL,
  "text_preview" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "chat_message_files" ADD CONSTRAINT "chat_message_files_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "chat_message_files" ADD CONSTRAINT "chat_message_files_message_id_chat_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_conversation_messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "chat_message_files" ADD CONSTRAINT "chat_message_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "chat_message_files" ADD CONSTRAINT "chat_message_files_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "chat_message_files_storage_filename_idx" ON "chat_message_files" USING btree ("storage_filename");
CREATE INDEX IF NOT EXISTS "chat_message_files_message_idx" ON "chat_message_files" USING btree ("message_id");
CREATE INDEX IF NOT EXISTS "chat_message_files_conversation_idx" ON "chat_message_files" USING btree ("conversation_id");
CREATE INDEX IF NOT EXISTS "chat_message_files_user_created_idx" ON "chat_message_files" USING btree ("user_id","created_at");

INSERT INTO "tool_definitions" (
  "name",
  "slug",
  "tool_type",
  "description",
  "input_schema",
  "output_schema",
  "config_json",
  "is_builtin",
  "is_active"
) VALUES (
  'Create Chat Files',
  'create-chat-files',
  'mock_tool',
  'Creates downloadable files for the current chat response. Use it when the user asks for a file, export, report, dataset, code file, CSV, JSON, HTML, markdown, or similar artifact.',
  '{
    "type": "object",
    "properties": {
      "files": {
        "type": "array",
        "minItems": 1,
        "maxItems": 8,
        "items": {
          "type": "object",
          "properties": {
            "name": { "type": "string", "description": "Download filename, for example report.md or data.csv." },
            "mime_type": { "type": "string", "description": "Optional MIME type." },
            "content": { "type": "string", "description": "UTF-8 file content." },
            "content_base64": { "type": "string", "description": "Optional base64 content for binary files." }
          },
          "required": ["name"]
        }
      }
    },
    "required": ["files"]
  }'::jsonb,
  '{
    "type": "object",
    "properties": {
      "files": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "filename": { "type": "string" },
            "original_name": { "type": "string" },
            "mime_type": { "type": "string" },
            "kind": { "type": "string" },
            "size": { "type": "number" }
          }
        }
      }
    }
  }'::jsonb,
  '{"max_files":8,"max_file_size_bytes":2097152,"max_total_size_bytes":8388608}'::jsonb,
  true,
  true
) ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "tool_type" = EXCLUDED."tool_type",
  "description" = EXCLUDED."description",
  "input_schema" = EXCLUDED."input_schema",
  "output_schema" = EXCLUDED."output_schema",
  "config_json" = EXCLUDED."config_json",
  "is_builtin" = EXCLUDED."is_builtin",
  "is_active" = EXCLUDED."is_active",
  "updated_at" = now();

WITH file_tool AS (
  SELECT "id"::text AS "tool_id"
  FROM "tool_definitions"
  WHERE "slug" = 'create-chat-files'
  LIMIT 1
)
UPDATE "chat_conversations" AS c
SET
  "settings_json" = jsonb_set(
    COALESCE(c."settings_json", '{}'::jsonb),
    '{tool_ids}',
    CASE
      WHEN COALESCE(
        CASE
          WHEN jsonb_typeof(c."settings_json"->'tool_ids') = 'array' THEN c."settings_json"->'tool_ids'
          ELSE '[]'::jsonb
        END,
        '[]'::jsonb
      ) ? file_tool."tool_id"
      THEN COALESCE(
        CASE
          WHEN jsonb_typeof(c."settings_json"->'tool_ids') = 'array' THEN c."settings_json"->'tool_ids'
          ELSE '[]'::jsonb
        END,
        '[]'::jsonb
      )
      ELSE COALESCE(
        CASE
          WHEN jsonb_typeof(c."settings_json"->'tool_ids') = 'array' THEN c."settings_json"->'tool_ids'
          ELSE '[]'::jsonb
        END,
        '[]'::jsonb
      ) || to_jsonb(file_tool."tool_id")
    END,
    true
  ),
  "updated_at" = now()
FROM file_tool
WHERE c."mode" = 'general';
