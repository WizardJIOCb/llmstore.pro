import argon2 from 'argon2';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { users } from '../../db/schema/index.js';
import { AppError, ConflictError, NotFoundError } from '../../middleware/error-handler.js';
import type { UserPublic } from '@llmstore/shared';
import {
  isSignupBonusEmailVerificationRequired,
  sendEmailVerificationEmail,
} from './email-verification.service.js';
import { markUserLoggedIn } from './login-activity.service.js';
import { grantSignupBonusIfEligible, normalizeIpAddress } from './signup-bonus.service.js';
import { normalizeEmail } from '../../lib/email.js';

const userPublicColumns = {
  id: users.id,
  email: users.email,
  username: users.username,
  name: users.name,
  avatar_url: users.avatar_url,
  role: users.role,
  status: users.status,
  email_verified_at: users.email_verified_at,
  created_at: users.created_at,
} as const;

export async function register(input: {
  email: string;
  password: string;
  name?: string;
  username?: string;
  device_fingerprint?: string;
  signup_ip?: string | null;
  signup_user_agent?: string | null;
}): Promise<{
  user: UserPublic;
  email_verification_sent: boolean;
  signup_bonus_pending_email_verification: boolean;
}> {
  const normalizedEmail = normalizeEmail(input.email);

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError('Пользователь с таким email уже существует');
  }

  if (input.username) {
    const existingUsername = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, input.username))
      .limit(1);

    if (existingUsername.length > 0) {
      throw new ConflictError('Этот логин уже занят');
    }
  }

  const password_hash = await argon2.hash(input.password);
  const requiresEmailVerification = await isSignupBonusEmailVerificationRequired();

  const [user] = await db
    .insert(users)
    .values({
      email: normalizedEmail,
      username: input.username || null,
      name: input.name || null,
      password_hash,
      role: 'user',
      status: 'active',
      balance_usd: '0',
      last_login_at: new Date(),
    })
    .returning(userPublicColumns);

  let emailVerificationSent = false;

  if (requiresEmailVerification) {
    try {
      const emailResult = await sendEmailVerificationEmail(user.id);
      emailVerificationSent = emailResult.sent;
    } catch (error) {
      await db.delete(users).where(eq(users.id, user.id));
      throw error;
    }
  } else {
    await grantSignupBonusIfEligible(user.id, {
      ipAddress: normalizeIpAddress(input.signup_ip),
      deviceFingerprint: input.device_fingerprint,
      userAgent: input.signup_user_agent,
    });
  }

  return {
    user: {
      ...user,
      email_verified_at: user.email_verified_at?.toISOString() ?? null,
      created_at: user.created_at.toISOString(),
    },
    email_verification_sent: emailVerificationSent,
    signup_bonus_pending_email_verification: requiresEmailVerification,
  };
}

export async function login(input: { login?: string; email?: string; password: string }): Promise<UserPublic> {
  const identifier = String(input.login ?? input.email ?? '').trim().toLowerCase();

  const [user] = await db
    .select({
      ...userPublicColumns,
      password_hash: users.password_hash,
    })
    .from(users)
    .where(sql`lower(${users.email}) = ${identifier} OR lower(coalesce(${users.username}, '')) = ${identifier}`)
    .limit(1);

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

  await markUserLoggedIn(user.id);

  const { password_hash: _, ...publicUser } = user;
  return {
    ...publicUser,
    email_verified_at: publicUser.email_verified_at?.toISOString() ?? null,
    created_at: publicUser.created_at.toISOString(),
  };
}

export async function getById(userId: string): Promise<UserPublic> {
  const [user] = await db
    .select(userPublicColumns)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new NotFoundError('Пользователь не найден');
  }

  return {
    ...user,
    email_verified_at: user.email_verified_at?.toISOString() ?? null,
    created_at: user.created_at.toISOString(),
  };
}
