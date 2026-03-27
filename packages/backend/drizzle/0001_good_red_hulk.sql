DO $$ BEGIN
    CREATE TYPE "public"."alice_default_target_type" AS ENUM('general_chat', 'agent_chat', 'specific_chat');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "public"."alice_tts_mode" AS ENUM('brief', 'standard');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "alice_user_settings" (
    "user_id" uuid PRIMARY KEY NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "default_target_type" "alice_default_target_type" DEFAULT 'general_chat' NOT NULL,
    "default_chat_id" uuid,
    "default_agent_id" uuid,
    "default_model_external_id" varchar(255),
    "save_messages" boolean DEFAULT true NOT NULL,
    "tts_mode" "alice_tts_mode" DEFAULT 'brief' NOT NULL,
    "max_tts_chars" integer DEFAULT 900 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "alice_user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
    CONSTRAINT "alice_user_settings_default_chat_id_chat_conversations_id_fk" FOREIGN KEY ("default_chat_id") REFERENCES "public"."chat_conversations"("id") ON DELETE set null ON UPDATE no action,
    CONSTRAINT "alice_user_settings_default_agent_id_agents_id_fk" FOREIGN KEY ("default_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "alice_oauth_authorization_codes" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "client_id" varchar(255) NOT NULL,
    "code_hash" varchar(128) NOT NULL,
    "redirect_uri" text NOT NULL,
    "scopes_json" jsonb,
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "alice_oauth_authorization_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "alice_oauth_tokens" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "client_id" varchar(255) NOT NULL,
    "access_token_hash" varchar(128) NOT NULL,
    "refresh_token_hash" varchar(128),
    "access_expires_at" timestamp with time zone NOT NULL,
    "refresh_expires_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "last_used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "alice_oauth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "alice_skill_links" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "yandex_skill_user_id" varchar(255) NOT NULL,
    "yandex_application_id" varchar(255),
    "token_id" uuid,
    "linked_at" timestamp with time zone DEFAULT now() NOT NULL,
    "last_seen_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "alice_skill_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
    CONSTRAINT "alice_skill_links_token_id_alice_oauth_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."alice_oauth_tokens"("id") ON DELETE set null ON UPDATE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS "alice_oauth_authorization_codes_code_hash_idx" ON "alice_oauth_authorization_codes" USING btree ("code_hash");
CREATE INDEX IF NOT EXISTS "alice_oauth_authorization_codes_user_id_idx" ON "alice_oauth_authorization_codes" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "alice_oauth_authorization_codes_expires_at_idx" ON "alice_oauth_authorization_codes" USING btree ("expires_at");

CREATE UNIQUE INDEX IF NOT EXISTS "alice_oauth_tokens_access_token_hash_idx" ON "alice_oauth_tokens" USING btree ("access_token_hash");
CREATE UNIQUE INDEX IF NOT EXISTS "alice_oauth_tokens_refresh_token_hash_idx" ON "alice_oauth_tokens" USING btree ("refresh_token_hash");
CREATE INDEX IF NOT EXISTS "alice_oauth_tokens_user_id_idx" ON "alice_oauth_tokens" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "alice_oauth_tokens_access_expires_at_idx" ON "alice_oauth_tokens" USING btree ("access_expires_at");

CREATE UNIQUE INDEX IF NOT EXISTS "alice_skill_links_user_skill_user_idx" ON "alice_skill_links" USING btree ("user_id", "yandex_skill_user_id");
CREATE INDEX IF NOT EXISTS "alice_skill_links_user_id_idx" ON "alice_skill_links" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "alice_skill_links_yandex_skill_user_id_idx" ON "alice_skill_links" USING btree ("yandex_skill_user_id");
