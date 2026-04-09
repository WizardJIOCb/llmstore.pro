import { eq } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { userDailyActivity, users } from '../../db/schema/index.js';

function toUtcDateOnly(at: Date): string {
  return at.toISOString().slice(0, 10);
}

async function upsertUserDailyActivity(userId: string, at: Date) {
  await db
    .insert(userDailyActivity)
    .values({
      user_id: userId,
      day: toUtcDateOnly(at),
      last_activity_at: at,
    })
    .onConflictDoUpdate({
      target: [userDailyActivity.user_id, userDailyActivity.day],
      set: {
        last_activity_at: at,
        updated_at: new Date(),
      },
    });
}

export async function markUserLoggedIn(userId: string, at = new Date()): Promise<void> {
  await db
    .update(users)
    .set({ last_login_at: at, last_activity_at: at })
    .where(eq(users.id, userId));

  await upsertUserDailyActivity(userId, at);
}

export async function markUserActive(userId: string, at = new Date()): Promise<void> {
  await db
    .update(users)
    .set({ last_activity_at: at })
    .where(eq(users.id, userId));

  await upsertUserDailyActivity(userId, at);
}
