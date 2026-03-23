import argon2 from 'argon2';
import { db } from '../../config/database.js';
import { users } from '../schema/auth.js';

export async function seedAdminUser() {
  const password_hash = await argon2.hash('admin123!');

  await db
    .insert(users)
    .values({
      email: 'admin@llmstore.pro',
      username: 'admin',
      name: 'Администратор',
      role: 'admin',
      status: 'active',
      password_hash,
    })
    .onConflictDoNothing({ target: users.email });

  console.log('Seeded admin user (admin@llmstore.pro / admin123!)');
}
