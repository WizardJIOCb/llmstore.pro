import { and, eq, or } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { balanceTransactions, signupBonusGrants, users } from '../../db/schema/index.js';

export const REGISTRATION_BONUS_USD = '0.05';

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

  const bonusAllowed = await canGrantSignupBonus({ ipAddress, deviceFingerprint, userAgent });
  if (!bonusAllowed) return false;

  try {
    await db.transaction(async (tx) => {
      await tx.insert(signupBonusGrants).values({
        user_id: userId,
        ip_address: ipAddress,
        device_fingerprint: deviceFingerprint,
        user_agent: userAgent,
      });

      await tx
        .update(users)
        .set({ balance_usd: REGISTRATION_BONUS_USD })
        .where(and(eq(users.id, userId), eq(users.balance_usd, '0')));

      await tx.insert(balanceTransactions).values({
        user_id: userId,
        amount: REGISTRATION_BONUS_USD,
        balance_after: REGISTRATION_BONUS_USD,
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
