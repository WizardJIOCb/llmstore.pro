ALTER TYPE "public"."content_type" ADD VALUE IF NOT EXISTS 'article';--> statement-breakpoint
ALTER TABLE "catalog_item_meta" ADD COLUMN "primary_cta_label" varchar(80);--> statement-breakpoint
ALTER TABLE "catalog_item_meta" ADD COLUMN "primary_cta_url" text;--> statement-breakpoint
ALTER TABLE "catalog_item_meta" ADD COLUMN "secondary_cta_label" varchar(80);--> statement-breakpoint
ALTER TABLE "catalog_item_meta" ADD COLUMN "secondary_cta_url" text;--> statement-breakpoint
ALTER TABLE "catalog_item_meta" ADD COLUMN "reading_time_minutes" integer;--> statement-breakpoint
CREATE TABLE "catalog_item_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "catalog_item_view_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"user_id" uuid,
	"viewer_key" varchar(512) NOT NULL,
	"viewed_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "catalog_item_reactions" ADD CONSTRAINT "catalog_item_reactions_item_id_catalog_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_reactions" ADD CONSTRAINT "catalog_item_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_view_events" ADD CONSTRAINT "catalog_item_view_events_item_id_catalog_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_view_events" ADD CONSTRAINT "catalog_item_view_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_item_reactions_item_user_idx" ON "catalog_item_reactions" USING btree ("item_id","user_id");--> statement-breakpoint
CREATE INDEX "catalog_item_reactions_item_idx" ON "catalog_item_reactions" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "catalog_item_reactions_item_created_idx" ON "catalog_item_reactions" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE INDEX "catalog_item_reactions_user_idx" ON "catalog_item_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_item_view_events_item_viewer_day_idx" ON "catalog_item_view_events" USING btree ("item_id","viewer_key","viewed_on");--> statement-breakpoint
CREATE INDEX "catalog_item_view_events_item_viewed_on_idx" ON "catalog_item_view_events" USING btree ("item_id","viewed_on");--> statement-breakpoint
CREATE INDEX "catalog_item_view_events_user_idx" ON "catalog_item_view_events" USING btree ("user_id");
