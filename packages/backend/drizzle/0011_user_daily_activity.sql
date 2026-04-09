ALTER TABLE "users" ADD COLUMN "last_activity_at" timestamp with time zone;
CREATE INDEX "users_last_activity_at_idx" ON "users" USING btree ("last_activity_at");

CREATE TABLE "user_daily_activity" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "day" date NOT NULL,
  "last_activity_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "user_daily_activity" ADD CONSTRAINT "user_daily_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "user_daily_activity_user_day_idx" ON "user_daily_activity" USING btree ("user_id","day");
CREATE INDEX "user_daily_activity_day_idx" ON "user_daily_activity" USING btree ("day");
CREATE INDEX "user_daily_activity_last_activity_idx" ON "user_daily_activity" USING btree ("last_activity_at");
