CREATE TABLE IF NOT EXISTS "user_provider_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" varchar(50) NOT NULL,
  "encrypted_api_key" text NOT NULL,
  "key_hint" varchar(32),
  "label" varchar(120),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_provider_keys_user_provider_idx"
  ON "user_provider_keys" ("user_id", "provider");

CREATE INDEX IF NOT EXISTS "user_provider_keys_user_idx"
  ON "user_provider_keys" ("user_id");
