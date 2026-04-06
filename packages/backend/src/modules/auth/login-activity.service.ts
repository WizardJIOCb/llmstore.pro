import { eq } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { users } from '../../db/schema/index.js';

export async function markUserLoggedIn(userId: string, at = new Date()): Promise<void> {
  await db
    .update(users)
    .set({ last_login_at: at })
    .where(eq(users.id, userId));
}
