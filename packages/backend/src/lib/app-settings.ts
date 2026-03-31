import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { appSettings } from '../db/schema/index.js';
import { USD_TO_RUB_RATE as DEFAULT_USD_TO_RUB_RATE } from '@llmstore/shared';

const SETTINGS_CACHE_TTL_MS = 30_000;

const SETTINGS_KEYS = {
  usd_to_rub_rate: 'usd_to_rub_rate',
  topup_message: 'topup_message',
  topup_telegram: 'topup_telegram',
  topup_email: 'topup_email',
  topup_phone: 'topup_phone',
} as const;

const DEFAULT_TOPUP_MESSAGE = 'У вас не осталось баланса. Скоро вы сможете пополнить его на сайте, а пока можете написать Родиону:';
const DEFAULT_TOPUP_TELEGRAM = '@WizardJIOCb';
const DEFAULT_TOPUP_EMAIL = 'rodion89@list.ru';
const DEFAULT_TOPUP_PHONE = '89264769929';

type SettingKey = typeof SETTINGS_KEYS[keyof typeof SETTINGS_KEYS];

type CachedSetting = {
  value: string;
  expiresAt: number;
};

let settingsCache = new Map<SettingKey, CachedSetting>();

function getCachedSetting(key: SettingKey): string | null {
  const cached = settingsCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    settingsCache.delete(key);
    return null;
  }
  return cached.value;
}

function setCachedSetting(key: SettingKey, value: string) {
  settingsCache.set(key, {
    value,
    expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS,
  });
}

function normalizeRate(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Number(parsed.toFixed(4));
}

function normalizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

async function getSettingValue(key: SettingKey, fallback: string): Promise<string> {
  const cached = getCachedSetting(key);
  if (cached !== null) return cached;

  const [row] = await db
    .select({ value_text: appSettings.value_text })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);

  const value = row?.value_text?.trim() || fallback;
  setCachedSetting(key, value);
  return value;
}

async function setSettingValue(key: SettingKey, value: string, updatedBy?: string | null) {
  await db
    .insert(appSettings)
    .values({
      key,
      value_text: value,
      updated_by: updatedBy ?? null,
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value_text: value,
        updated_by: updatedBy ?? null,
        updated_at: new Date(),
      },
    });

  setCachedSetting(key, value);
}

export function getDefaultUsdToRubRate(): number {
  return DEFAULT_USD_TO_RUB_RATE;
}

export async function getUsdToRubRate(): Promise<number> {
  const raw = await getSettingValue(
    SETTINGS_KEYS.usd_to_rub_rate,
    String(DEFAULT_USD_TO_RUB_RATE),
  );
  return normalizeRate(raw) ?? DEFAULT_USD_TO_RUB_RATE;
}

export async function setUsdToRubRate(rate: number, updatedBy?: string | null): Promise<number> {
  const normalizedRate = normalizeRate(rate);
  if (normalizedRate === null) {
    throw new Error('Invalid USD to RUB rate');
  }

  await setSettingValue(SETTINGS_KEYS.usd_to_rub_rate, String(normalizedRate), updatedBy);
  return normalizedRate;
}

export async function getTopUpSettings() {
  const [message, telegram, email, phone] = await Promise.all([
    getSettingValue(SETTINGS_KEYS.topup_message, DEFAULT_TOPUP_MESSAGE),
    getSettingValue(SETTINGS_KEYS.topup_telegram, DEFAULT_TOPUP_TELEGRAM),
    getSettingValue(SETTINGS_KEYS.topup_email, DEFAULT_TOPUP_EMAIL),
    getSettingValue(SETTINGS_KEYS.topup_phone, DEFAULT_TOPUP_PHONE),
  ]);

  return {
    message,
    telegram,
    email,
    phone,
  };
}

export async function updateTopUpSettings(input: {
  topup_message?: string;
  topup_telegram?: string;
  topup_email?: string;
  topup_phone?: string;
}, updatedBy?: string | null) {
  const message = normalizeText(input.topup_message, 500) ?? DEFAULT_TOPUP_MESSAGE;
  const telegram = normalizeText(input.topup_telegram, 100) ?? DEFAULT_TOPUP_TELEGRAM;
  const email = normalizeText(input.topup_email, 255) ?? DEFAULT_TOPUP_EMAIL;
  const phone = normalizeText(input.topup_phone, 50) ?? DEFAULT_TOPUP_PHONE;

  await Promise.all([
    setSettingValue(SETTINGS_KEYS.topup_message, message, updatedBy),
    setSettingValue(SETTINGS_KEYS.topup_telegram, telegram, updatedBy),
    setSettingValue(SETTINGS_KEYS.topup_email, email, updatedBy),
    setSettingValue(SETTINGS_KEYS.topup_phone, phone, updatedBy),
  ]);

  return {
    message,
    telegram,
    email,
    phone,
  };
}

export async function getAdminSettings() {
  const [usd_to_rub_rate, topUp] = await Promise.all([
    getUsdToRubRate(),
    getTopUpSettings(),
  ]);

  return {
    usd_to_rub_rate,
    topup_message: topUp.message,
    topup_telegram: topUp.telegram,
    topup_email: topUp.email,
    topup_phone: topUp.phone,
  };
}

export async function getPublicAppSettings() {
  const topUp = await getTopUpSettings();
  return {
    usd_to_rub_rate: await getUsdToRubRate(),
    topup: {
      message: topUp.message,
      telegram: topUp.telegram,
      email: topUp.email,
      phone: topUp.phone,
    },
  };
}
