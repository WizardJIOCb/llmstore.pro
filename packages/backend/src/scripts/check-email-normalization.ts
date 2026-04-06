import { sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { users } from '../db/schema/auth.js';

type DuplicateRow = {
  normalized_email: string;
  user_ids: string[];
  emails: string[];
  count: number;
};

async function main() {
  const duplicateGroups = await db.execute<DuplicateRow>(sql`
    SELECT
      lower(btrim(${users.email})) AS normalized_email,
      array_agg(${users.id}::text ORDER BY ${users.created_at}, ${users.id}) AS user_ids,
      array_agg(${users.email} ORDER BY ${users.created_at}, ${users.id}) AS emails,
      COUNT(*)::int AS count
    FROM ${users}
    GROUP BY lower(btrim(${users.email}))
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC, lower(btrim(${users.email})) ASC
  `);

  const mixedCaseRows = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count
    FROM ${users}
    WHERE ${users.email} <> lower(${users.email})
  `);

  const spacedRows = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count
    FROM ${users}
    WHERE ${users.email} <> btrim(${users.email})
  `);

  const summary = {
    duplicate_lower_email_groups: duplicateGroups.length,
    mixed_case_email_rows: mixedCaseRows[0]?.count ?? 0,
    spaced_email_rows: spacedRows[0]?.count ?? 0,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (duplicateGroups.length > 0) {
    console.log('\nConflicting normalized email groups:');
    for (const group of duplicateGroups) {
      console.log(JSON.stringify(group, null, 2));
    }
    process.exitCode = 1;
    return;
  }

  console.log('\nNo conflicting lower(email) duplicates found.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
