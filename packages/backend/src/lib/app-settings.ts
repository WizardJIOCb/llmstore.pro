import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { appSettings } from '../db/schema/index.js';
import { USD_TO_RUB_RATE as DEFAULT_USD_TO_RUB_RATE } from '@llmstore/shared';

const USD_TO_RUB_RATE_KEY = 'usd_to_rub_rate';
const SETTINGS_CACHE_TTL_MS = 30_000;

let cachedUsdToRubRate: { value: number; expiresAt: number } | null = null;

function normalizeRate(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Number(parsed.toFixed(4));
}

export function getDefaultUsdToRubRate(): number {
  return DEFAULT_USD_TO_RUB_RATE;
}

export async function getUsdToRubRate(): Promise<number> {
  if (cachedUsdToRubRate && cachedUsdToRubRate.expiresAt > Date.now()) {
    return cachedUsdToRubRate.value;
  }

  const [row] = await db
    .select({ value_text: appSettings.value_text })
    .from(appSettings)
    .where(eq(appSettings.key, USD_TO_RUB_RATE_KEY))
    .limit(1);

  const rate = normalizeRate(row?.value_text) ?? DEFAULT_USD_TO_RUB_RATE;
  cachedUsdToRubRate = {
    value: rate,
    expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS,
  };
  return rate;
}

export async function setUsdToRubRate(rate: number, updatedBy?: string | null): Promise<number> {
  const normalizedRate = normalizeRate(rate);
  if (normalizedRate === null) {
    throw new Error('Invalid USD to RUB rate');
  }

  await db
    .insert(appSettings)
    .values({
      key: USD_TO_RUB_RATE_KEY,
      value_text: String(normalizedRate),
      updated_by: updatedBy ?? null,
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value_text: String(normalizedRate),
        updated_by: updatedBy ?? null,
        updated_at: new Date(),
      },
    });

  cachedUsdToRubRate = {
    value: normalizedRate,
    expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS,
  };

  return normalizedRate;
}

export async function getAdminSettings() {
  return {
    usd_to_rub_rate: await getUsdToRubRate(),
  };
}
