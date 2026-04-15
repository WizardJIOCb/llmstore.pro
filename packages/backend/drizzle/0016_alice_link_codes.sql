CREATE TABLE IF NOT EXISTS "alice_link_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "code" varchar(16) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "consumed_skill_user_id" varchar(255),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "alice_link_codes_code_idx" ON "alice_link_codes" ("code");
CREATE INDEX IF NOT EXISTS "alice_link_codes_user_id_idx" ON "alice_link_codes" ("user_id");
CREATE INDEX IF NOT EXISTS "alice_link_codes_expires_at_idx" ON "alice_link_codes" ("expires_at");
