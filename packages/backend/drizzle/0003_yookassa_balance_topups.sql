CREATE TABLE "balance_topups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(50) DEFAULT 'yookassa' NOT NULL,
	"provider_payment_id" varchar(200),
	"idempotence_key" varchar(200) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"amount_rub" numeric(12, 2) NOT NULL,
	"amount_usd" numeric(12, 4) NOT NULL,
	"usd_to_rub_rate" numeric(12, 4) NOT NULL,
	"description" text,
	"confirmation_url" text,
	"return_url" text,
	"balance_transaction_id" uuid,
	"raw_payment_json" jsonb,
	"paid_at" timestamp with time zone,
	"credited_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "balance_topups" ADD CONSTRAINT "balance_topups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "balance_topups" ADD CONSTRAINT "balance_topups_balance_transaction_id_balance_transactions_id_fk" FOREIGN KEY ("balance_transaction_id") REFERENCES "public"."balance_transactions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "balance_topups_idempotence_key_idx" ON "balance_topups" USING btree ("idempotence_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "balance_topups_provider_payment_id_idx" ON "balance_topups" USING btree ("provider_payment_id");
--> statement-breakpoint
CREATE INDEX "balance_topups_user_id_idx" ON "balance_topups" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "balance_topups_status_idx" ON "balance_topups" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "balance_topups_created_at_idx" ON "balance_topups" USING btree ("created_at");
