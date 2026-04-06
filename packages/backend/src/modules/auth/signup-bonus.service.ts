import { eq, or } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { balanceTransactions, signupBonusGrants, users } from '../../db/schema/index.js';
import { getSignupBonusSettings } from '../../lib/app-settings.js';

export interface SignupBonusContext {
  ipAddress?: string | null;
  deviceFingerprint?: string | null;
  userAgent?: string | null;
}

function normalizeValue(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeIpAddress(value?: string | null): string | null {
  const normalized = normalizeValue(value);
  if (!normalized) return null;
  if (normalized.startsWith('::ffff:')) return normalized.slice(7);
  return normalized;
}

export async function canGrantSignupBonus(context: SignupBonusContext): Promise<boolean> {
  const ipAddress = normalizeIpAddress(context.ipAddress);
  const deviceFingerprint = normalizeValue(context.deviceFingerprint);

  if (!ipAddress && !deviceFingerprint) return true;

  const conditions = [];
  if (ipAddress) conditions.push(eq(signupBonusGrants.ip_address, ipAddress));
  if (deviceFingerprint) conditions.push(eq(signupBonusGrants.device_fingerprint, deviceFingerprint));

  if (!conditions.length) return true;

  const [existingGrant] = await db
    .select({ id: signupBonusGrants.id })
    .from(signupBonusGrants)
    .where(or(...conditions))
    .limit(1);

  return !existingGrant;
}

export async function grantSignupBonusIfEligible(userId: string, context: SignupBonusContext): Promise<boolean> {
  const ipAddress = normalizeIpAddress(context.ipAddress);
  const deviceFingerprint = normalizeValue(context.deviceFingerprint);
  const userAgent = normalizeValue(context.userAgent);
  const signupBonus = await getSignupBonusSettings();

  const bonusAllowed = await canGrantSignupBonus({ ipAddress, deviceFingerprint, userAgent });
  if (!bonusAllowed) return false;

  try {
    await db.transaction(async (tx) => {
      const [user] = await tx
        .select({ id: users.id, balance_usd: users.balance_usd })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new Error('User not found while granting signup bonus');
      }

      const currentBalance = Number(user.balance_usd);
      const nextBalance = Number((currentBalance + signupBonus.amount_usd).toFixed(4));
      const bonusAmount = signupBonus.amount_usd.toFixed(4);

      await tx.insert(signupBonusGrants).values({
        user_id: userId,
        ip_address: ipAddress,
        device_fingerprint: deviceFingerprint,
        user_agent: userAgent,
      });

      await tx
        .update(users)
        .set({ balance_usd: nextBalance.toFixed(4) })
        .where(eq(users.id, userId));

      await tx.insert(balanceTransactions).values({
        user_id: userId,
        amount: bonusAmount,
        balance_after: nextBalance.toFixed(4),
        type: 'signup_bonus',
        description: 'Стартовый бонус для новых пользователей',
        performed_by: null,
      });
    });
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : '';
    if (code === '23505') return false;
    throw error;
  }

  return true;
}
