CREATE TABLE "telegram_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "telegram_user_id" varchar(64) NOT NULL,
  "telegram_chat_id" varchar(64) NOT NULL,
  "telegram_username" varchar(255),
  "telegram_first_name" varchar(255),
  "telegram_last_name" varchar(255),
  "notify_on_task_completed" boolean DEFAULT true NOT NULL,
  "notify_on_task_failed" boolean DEFAULT true NOT NULL,
  "notify_on_landing_ready" boolean DEFAULT true NOT NULL,
  "linked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "telegram_links"
  ADD CONSTRAINT "telegram_links_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "telegram_links_user_idx" ON "telegram_links" USING btree ("user_id");
CREATE UNIQUE INDEX "telegram_links_telegram_user_idx" ON "telegram_links" USING btree ("telegram_user_id");
CREATE INDEX "telegram_links_chat_idx" ON "telegram_links" USING btree ("telegram_chat_id");
CREATE INDEX "telegram_links_last_seen_idx" ON "telegram_links" USING btree ("last_seen_at");

CREATE TABLE "telegram_link_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "code" varchar(16) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "consumed_telegram_user_id" varchar(64),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "telegram_link_codes"
  ADD CONSTRAINT "telegram_link_codes_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "telegram_link_codes_code_idx" ON "telegram_link_codes" USING btree ("code");
CREATE INDEX "telegram_link_codes_user_id_idx" ON "telegram_link_codes" USING btree ("user_id");
CREATE INDEX "telegram_link_codes_expires_at_idx" ON "telegram_link_codes" USING btree ("expires_at");
