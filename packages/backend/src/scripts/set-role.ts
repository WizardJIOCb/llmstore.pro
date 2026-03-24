/**
 * CLI script to set user role by email.
 * Usage: npx tsx src/scripts/set-role.ts <email> <role>
 * Roles: user, power_user, curator, admin
 */
import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { users } from '../db/schema/auth.js';
import { userRoleValues, type UserRole } from '@llmstore/shared';

async function main() {
  const [email, role] = process.argv.slice(2);

  if (!email || !role) {
    console.error('Usage: npx tsx src/scripts/set-role.ts <email> <role>');
    console.error('Roles:', userRoleValues.join(', '));
    process.exit(1);
  }

  if (!userRoleValues.includes(role as UserRole)) {
    console.error(`Invalid role: "${role}". Valid roles: ${userRoleValues.join(', ')}`);
    process.exit(1);
  }

  const [user] = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    console.error(`User with email "${email}" not found.`);
    process.exit(1);
  }

  if (user.role === role) {
    console.log(`User ${email} already has role "${role}". Nothing to do.`);
    process.exit(0);
  }

  await db.update(users).set({ role: role as UserRole }).where(eq(users.id, user.id));

  console.log(`User ${email} role changed: ${user.role} -> ${role}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
