CREATE TABLE "catalog_item_poll_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"option_id" varchar(120) NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "catalog_item_poll_votes" ADD CONSTRAINT "catalog_item_poll_votes_item_id_catalog_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_poll_votes" ADD CONSTRAINT "catalog_item_poll_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_item_poll_votes_item_user_idx" ON "catalog_item_poll_votes" USING btree ("item_id","user_id");--> statement-breakpoint
CREATE INDEX "catalog_item_poll_votes_item_option_idx" ON "catalog_item_poll_votes" USING btree ("item_id","option_id");--> statement-breakpoint
CREATE INDEX "catalog_item_poll_votes_user_idx" ON "catalog_item_poll_votes" USING btree ("user_id");
