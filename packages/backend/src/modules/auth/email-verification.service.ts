import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { env } from '../../config/env.js';
import { emailVerificationTokens, users } from '../../db/schema/index.js';
import { getSignupBonusSettings } from '../../lib/app-settings.js';
import { isMailerConfigured, sendMail } from '../../lib/mailer.js';
import { AppError, NotFoundError } from '../../middleware/error-handler.js';
import { grantSignupBonusIfEligible } from './signup-bonus.service.js';

const EMAIL_VERIFICATION_TTL_HOURS = 24;

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function buildVerificationUrl(token: string) {
  const url = new URL('/verify-email', env.FRONTEND_URL);
  url.searchParams.set('token', token);
  return url.toString();
}

function renderVerificationEmail(url: string, userName?: string | null) {
  const greeting = userName?.trim() ? `Привет, ${userName.trim()}!` : 'Здравствуйте!';
  return {
    subject: 'Подтвердите email в LLMStore.pro',
    text: [
      greeting,
      '',
      'Подтвердите email, чтобы активировать стартовый бонус и завершить регистрацию.',
      `Ссылка: ${url}`,
      '',
      `Ссылка действует ${EMAIL_VERIFICATION_TTL_HOURS} часов.`,
      'Если это были не вы, просто проигнорируйте письмо.',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
        <p>${greeting}</p>
        <p>Подтвердите email, чтобы активировать стартовый бонус и завершить регистрацию.</p>
        <p>
          <a href="${url}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#111827;color:#ffffff;text-decoration:none">
            Подтвердить email
          </a>
        </p>
        <p style="color:#6b7280">Ссылка действует ${EMAIL_VERIFICATION_TTL_HOURS} часов.</p>
        <p style="color:#6b7280">Если это были не вы, просто проигнорируйте письмо.</p>
      </div>
    `,
  };
}

export async function isSignupBonusEmailVerificationRequired() {
  const settings = await getSignupBonusSettings();
  return settings.requires_email_verification;
}

export async function createEmailVerificationToken(userId: string) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000);

  await db.insert(emailVerificationTokens).values({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  return token;
}

export async function sendEmailVerificationEmail(userId: string) {
  if (!isMailerConfigured()) {
    throw new AppError(
      503,
      'EMAIL_VERIFICATION_UNAVAILABLE',
      'Подтверждение email пока не настроено: не хватает SMTP-параметров.',
    );
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      email_verified_at: users.email_verified_at,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new NotFoundError('Пользователь не найден');
  }

  if (user.email_verified_at) {
    return { sent: false, alreadyVerified: true };
  }

  const token = await createEmailVerificationToken(user.id);
  const url = buildVerificationUrl(token);
  const message = renderVerificationEmail(url, user.name);

  await sendMail({
    to: user.email,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });

  return { sent: true, alreadyVerified: false };
}

export async function verifyEmailToken(input: {
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceFingerprint?: string | null;
}) {
  const tokenHash = hashToken(input.token);
  const now = new Date();

  const [row] = await db
    .select({
      token_id: emailVerificationTokens.id,
      user_id: emailVerificationTokens.user_id,
      used_at: emailVerificationTokens.used_at,
      expires_at: emailVerificationTokens.expires_at,
      email: users.email,
      username: users.username,
      name: users.name,
      avatar_url: users.avatar_url,
      role: users.role,
      status: users.status,
      email_verified_at: users.email_verified_at,
      created_at: users.created_at,
    })
    .from(emailVerificationTokens)
    .innerJoin(users, eq(users.id, emailVerificationTokens.user_id))
    .where(eq(emailVerificationTokens.token_hash, tokenHash))
    .limit(1);

  if (!row) {
    throw new AppError(400, 'INVALID_EMAIL_VERIFICATION_TOKEN', 'Ссылка подтверждения недействительна.');
  }

  if (row.used_at) {
    if (!row.email_verified_at) {
      throw new AppError(400, 'EMAIL_ALREADY_VERIFIED', 'Эта ссылка уже была использована.');
    }
    return {
      user: {
        id: row.user_id,
        email: row.email,
        username: row.username,
        name: row.name,
        avatar_url: row.avatar_url,
        role: row.role,
        status: row.status,
        email_verified_at: row.email_verified_at.toISOString(),
        created_at: row.created_at.toISOString(),
      },
      signup_bonus_granted: false,
      already_verified: true,
    };
  }

  if (row.expires_at <= now) {
    throw new AppError(400, 'EMAIL_VERIFICATION_TOKEN_EXPIRED', 'Ссылка подтверждения истекла. Запросите новую.');
  }

  const verifiedAt = row.email_verified_at ?? now;

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ email_verified_at: verifiedAt })
      .where(eq(users.id, row.user_id));

    await tx
      .update(emailVerificationTokens)
      .set({ used_at: now })
      .where(eq(emailVerificationTokens.id, row.token_id));
  });

  const signupBonusGranted = await grantSignupBonusIfEligible(row.user_id, {
    ipAddress: input.ipAddress ?? null,
    deviceFingerprint: input.deviceFingerprint,
    userAgent: input.userAgent ?? null,
  });

  return {
    user: {
      id: row.user_id,
      email: row.email,
      username: row.username,
      name: row.name,
      avatar_url: row.avatar_url,
      role: row.role,
      status: row.status,
      email_verified_at: verifiedAt.toISOString(),
      created_at: row.created_at.toISOString(),
    },
    signup_bonus_granted: signupBonusGranted,
    already_verified: Boolean(row.email_verified_at),
  };
}

export async function canSendVerificationEmail(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      email_verified_at: users.email_verified_at,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw new NotFoundError('Пользователь не найден');

  return {
    is_verified: Boolean(user.email_verified_at),
    is_configured: isMailerConfigured(),
  };
}
