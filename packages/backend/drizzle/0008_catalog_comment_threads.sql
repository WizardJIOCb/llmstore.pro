ALTER TABLE "catalog_comments" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "catalog_comments" ADD CONSTRAINT "catalog_comments_parent_id_catalog_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."catalog_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_comments_parent_created_idx" ON "catalog_comments" USING btree ("parent_id","created_at");
