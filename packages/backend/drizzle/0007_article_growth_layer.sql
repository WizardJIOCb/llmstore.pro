CREATE TABLE "catalog_item_bookmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "catalog_item_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" varchar(32) NOT NULL,
	"details" text,
	"status" varchar(24) DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "catalog_item_bookmarks" ADD CONSTRAINT "catalog_item_bookmarks_item_id_catalog_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_bookmarks" ADD CONSTRAINT "catalog_item_bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_reports" ADD CONSTRAINT "catalog_item_reports_item_id_catalog_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_reports" ADD CONSTRAINT "catalog_item_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_item_bookmarks_item_user_idx" ON "catalog_item_bookmarks" USING btree ("item_id","user_id");--> statement-breakpoint
CREATE INDEX "catalog_item_bookmarks_item_idx" ON "catalog_item_bookmarks" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "catalog_item_bookmarks_item_created_idx" ON "catalog_item_bookmarks" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE INDEX "catalog_item_bookmarks_user_idx" ON "catalog_item_bookmarks" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_item_reports_item_user_idx" ON "catalog_item_reports" USING btree ("item_id","user_id");--> statement-breakpoint
CREATE INDEX "catalog_item_reports_item_idx" ON "catalog_item_reports" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "catalog_item_reports_status_idx" ON "catalog_item_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "catalog_item_reports_user_idx" ON "catalog_item_reports" USING btree ("user_id");
