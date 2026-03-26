import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { users, balanceTransactions } from '../../db/schema/index.js';
import { AppError, ConflictError, NotFoundError } from '../../middleware/error-handler.js';
import type { UserPublic } from '@llmstore/shared';

const REGISTRATION_BONUS_USD = '0.05';

const userPublicColumns = {
  id: users.id,
  email: users.email,
  username: users.username,
  name: users.name,
  avatar_url: users.avatar_url,
  role: users.role,
  status: users.status,
  created_at: users.created_at,
} as const;

export async function register(input: { email: string; password: string; name?: string; username?: string }): Promise<UserPublic> {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email.toLowerCase())).limit(1);
  if (existing.length > 0) {
    throw new ConflictError('Пользователь с таким email уже существует');
  }

  if (input.username) {
    const existingUsername = await db.select({ id: users.id }).from(users).where(eq(users.username, input.username)).limit(1);
    if (existingUsername.length > 0) {
      throw new ConflictError('Этот логин уже занят');
    }
  }

  const password_hash = await argon2.hash(input.password);

  const [user] = await db.insert(users).values({
    email: input.email.toLowerCase(),
    username: input.username || null,
    name: input.name || null,
    password_hash,
    role: 'user',
    status: 'active',
    balance_usd: REGISTRATION_BONUS_USD,
  }).returning(userPublicColumns);

  await db.insert(balanceTransactions).values({
    user_id: user.id,
    amount: REGISTRATION_BONUS_USD,
    balance_after: REGISTRATION_BONUS_USD,
    type: 'signup_bonus',
    description: 'Стартовый бонус для новых пользователей',
    performed_by: null,
  });

  return { ...user, created_at: user.created_at.toISOString() };
}

export async function login(input: { email: string; password: string }): Promise<UserPublic> {
  const [user] = await db.select({
    ...userPublicColumns,
    password_hash: users.password_hash,
  }).from(users).where(eq(users.email, input.email.toLowerCase())).limit(1);

  if (!user) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Неверный email или пароль');
  }

  if (user.status !== 'active') {
    throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Аккаунт заблокирован');
  }

  if (!user.password_hash) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Используйте OAuth для входа');
  }

  const valid = await argon2.verify(user.password_hash, input.password);
  if (!valid) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Неверный email или пароль');
  }

  const { password_hash: _, ...publicUser } = user;
  return { ...publicUser, created_at: publicUser.created_at.toISOString() };
}

export async function getById(userId: string): Promise<UserPublic> {
  const [user] = await db.select(userPublicColumns).from(users).where(eq(users.id, userId)).limit(1);

  if (!user) {
    throw new NotFoundError('Пользователь не найден');
  }

  return { ...user, created_at: user.created_at.toISOString() };
}
