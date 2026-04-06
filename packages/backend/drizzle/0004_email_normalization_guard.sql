DO $$
DECLARE
  conflict_count integer;
BEGIN
  SELECT COUNT(*)::int
  INTO conflict_count
  FROM (
    SELECT lower(btrim("email"))
    FROM "users"
    GROUP BY lower(btrim("email"))
    HAVING COUNT(*) > 1
  ) AS conflicts;

  IF conflict_count > 0 THEN
    RAISE EXCEPTION
      'Cannot normalize users.email: found % conflicting lower(email) group(s). Run npm run db:check-email-normalization -w @llmstore/backend and resolve duplicates first.',
      conflict_count;
  END IF;
END $$;
--> statement-breakpoint
UPDATE "users"
SET "email" = lower(btrim("email"))
WHERE "email" <> lower(btrim("email"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_idx" ON "users" USING btree (lower("email"));
