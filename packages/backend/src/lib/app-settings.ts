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
  legal_business_name: 'legal_business_name',
  legal_business_status: 'legal_business_status',
  legal_inn: 'legal_inn',
  legal_ogrn: 'legal_ogrn',
  legal_address: 'legal_address',
  legal_support_email: 'legal_support_email',
  legal_support_phone: 'legal_support_phone',
  legal_support_telegram: 'legal_support_telegram',
  starter_prompts_openrouter_coding_agent: 'starter_prompts_openrouter_coding_agent',
  starter_prompts_openrouter_coding_agent_fast: 'starter_prompts_openrouter_coding_agent_fast',
  starter_prompts_openrouter_coding_agent_heavy_planning: 'starter_prompts_openrouter_coding_agent_heavy_planning',
  starter_prompts_openrouter_coding_agent_coding_alternative: 'starter_prompts_openrouter_coding_agent_coding_alternative',
  starter_prompts_dtf_news_agent: 'starter_prompts_dtf_news_agent',
  signup_bonus_requires_email_verification: 'signup_bonus_requires_email_verification',
} as const;

const DEFAULT_TOPUP_MESSAGE = 'Нужна помощь с пополнением или оплатой? Напишите Родиону:';
const DEFAULT_TOPUP_TELEGRAM = '@WizardJIOCb';
const DEFAULT_TOPUP_EMAIL = 'rodion89@list.ru';
const DEFAULT_TOPUP_PHONE = '89264769929';
const DEFAULT_LEGAL_BUSINESS_NAME = 'LLMStore.pro';
const DEFAULT_LEGAL_BUSINESS_STATUS = 'самозанятый';
const DEFAULT_LEGAL_INN = '';
const DEFAULT_LEGAL_OGRN = '';
const DEFAULT_LEGAL_ADDRESS = '';
const DEFAULT_LEGAL_SUPPORT_EMAIL = DEFAULT_TOPUP_EMAIL;
const DEFAULT_LEGAL_SUPPORT_PHONE = DEFAULT_TOPUP_PHONE;
const DEFAULT_LEGAL_SUPPORT_TELEGRAM = DEFAULT_TOPUP_TELEGRAM;
const DEFAULT_SIGNUP_BONUS_REQUIRES_EMAIL_VERIFICATION = false;
const DEFAULT_STARTER_PROMPTS = {
  openrouter_coding_agent: [
    'Сделай одностраничный лендинг и покажи preview',
    'Проанализируй приложенный файл и предложи улучшенную версию',
    'Собери структуру небольшой React-фичи по ТЗ',
  ],
  openrouter_coding_agent_fast: [
    'Коротко разберись в приложенном коде и предложи улучшения',
    'Сделай небольшой рефакторинг компонента',
    'Подготовь минимальную версию страницы по ТЗ',
  ],
  openrouter_coding_agent_heavy_planning: [
    'Сделай подробный план большого рефакторинга и предложи структуру файлов',
    'Перепроектируй модуль с учётом масштабирования',
    'Разбери сложное ТЗ и предложи архитектуру реализации',
  ],
  openrouter_coding_agent_coding_alternative: [
    'Сгенерируй реализацию фичи по приложенному ТЗ',
    'Предложи структуру файлов и ключевые компоненты для новой страницы',
    'Перепиши код с упором на чистую реализацию',
  ],
  dtf_news_agent: [
    'Покажи 5 последних новостей DTF',
    'Найди самую обсуждаемую новость и кратко объясни контекст',
    'Сделай короткий дайджест главных тем за сегодня',
  ],
} as const;

const CLEAN_DEFAULT_STARTER_PROMPTS = {
  openrouter_coding_agent: [
    'Сделай одностраничный лендинг и покажи preview',
    'Проанализируй приложенный файл и предложи улучшенную версию',
    'Собери структуру небольшой React-фичи по ТЗ',
  ],
  openrouter_coding_agent_fast: [
    'Коротко разберись в приложенном коде и предложи улучшения',
    'Сделай небольшой рефакторинг компонента',
    'Подготовь минимальную версию страницы по ТЗ',
  ],
  openrouter_coding_agent_heavy_planning: [
    'Сделай подробный план большого рефакторинга и предложи структуру файлов',
    'Перепроектируй модуль с учётом масштабирования',
    'Разбери сложное ТЗ и предложи архитектуру реализации',
  ],
  openrouter_coding_agent_coding_alternative: [
    'Сгенерируй реализацию фичи по приложенному ТЗ',
    'Предложи структуру файлов и ключевые компоненты для новой страницы',
    'Перепиши код с упором на чистую реализацию',
  ],
  dtf_news_agent: [
    'Покажи 5 последних новостей DTF',
    'Найди самую обсуждаемую новость и кратко объясни контекст',
    'Сделай короткий дайджест главных тем за сегодня',
  ],
} as const;

export interface StarterPromptSettings {
  openrouter_coding_agent: string[];
  openrouter_coding_agent_fast: string[];
  openrouter_coding_agent_heavy_planning: string[];
  openrouter_coding_agent_coding_alternative: string[];
  dtf_news_agent: string[];
}

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

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  if (typeof value === 'number') return value !== 0;
  return fallback;
}

function normalizePromptList(value: unknown, fallback: readonly string[]): string[] {
  const rawItems = Array.isArray(value)
    ? value
    : (typeof value === 'string' ? value.split(/\r?\n/) : []);

  const normalized = rawItems
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item, index, list) => item.length > 0 && list.indexOf(item) === index)
    .map((item) => item.slice(0, 300))
    .slice(0, 12);

  return normalized.length > 0 ? normalized : [...fallback];
}

function serializePromptList(value: readonly string[]): string {
  return value.join('\n');
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

export async function getLegalSettings() {
  const [
    businessName,
    businessStatus,
    inn,
    ogrn,
    address,
    supportEmail,
    supportPhone,
    supportTelegram,
  ] = await Promise.all([
    getSettingValue(SETTINGS_KEYS.legal_business_name, DEFAULT_LEGAL_BUSINESS_NAME),
    getSettingValue(SETTINGS_KEYS.legal_business_status, DEFAULT_LEGAL_BUSINESS_STATUS),
    getSettingValue(SETTINGS_KEYS.legal_inn, DEFAULT_LEGAL_INN),
    getSettingValue(SETTINGS_KEYS.legal_ogrn, DEFAULT_LEGAL_OGRN),
    getSettingValue(SETTINGS_KEYS.legal_address, DEFAULT_LEGAL_ADDRESS),
    getSettingValue(SETTINGS_KEYS.legal_support_email, DEFAULT_LEGAL_SUPPORT_EMAIL),
    getSettingValue(SETTINGS_KEYS.legal_support_phone, DEFAULT_LEGAL_SUPPORT_PHONE),
    getSettingValue(SETTINGS_KEYS.legal_support_telegram, DEFAULT_LEGAL_SUPPORT_TELEGRAM),
  ]);

  return {
    business_name: businessName,
    business_status: businessStatus,
    inn,
    ogrn,
    address,
    support_email: supportEmail,
    support_phone: supportPhone,
    support_telegram: supportTelegram,
  };
}

export async function updateLegalSettings(input: {
  legal_business_name?: string;
  legal_business_status?: string;
  legal_inn?: string;
  legal_ogrn?: string;
  legal_address?: string;
  legal_support_email?: string;
  legal_support_phone?: string;
  legal_support_telegram?: string;
}, updatedBy?: string | null) {
  const businessName = normalizeText(input.legal_business_name, 255) ?? DEFAULT_LEGAL_BUSINESS_NAME;
  const businessStatus = normalizeText(input.legal_business_status, 100) ?? DEFAULT_LEGAL_BUSINESS_STATUS;
  const inn = normalizeText(input.legal_inn, 50) ?? DEFAULT_LEGAL_INN;
  const ogrn = normalizeText(input.legal_ogrn, 50) ?? DEFAULT_LEGAL_OGRN;
  const address = normalizeText(input.legal_address, 500) ?? DEFAULT_LEGAL_ADDRESS;
  const supportEmail = normalizeText(input.legal_support_email, 255) ?? DEFAULT_LEGAL_SUPPORT_EMAIL;
  const supportPhone = normalizeText(input.legal_support_phone, 50) ?? DEFAULT_LEGAL_SUPPORT_PHONE;
  const supportTelegram = normalizeText(input.legal_support_telegram, 100) ?? DEFAULT_LEGAL_SUPPORT_TELEGRAM;

  await Promise.all([
    setSettingValue(SETTINGS_KEYS.legal_business_name, businessName, updatedBy),
    setSettingValue(SETTINGS_KEYS.legal_business_status, businessStatus, updatedBy),
    setSettingValue(SETTINGS_KEYS.legal_inn, inn, updatedBy),
    setSettingValue(SETTINGS_KEYS.legal_ogrn, ogrn, updatedBy),
    setSettingValue(SETTINGS_KEYS.legal_address, address, updatedBy),
    setSettingValue(SETTINGS_KEYS.legal_support_email, supportEmail, updatedBy),
    setSettingValue(SETTINGS_KEYS.legal_support_phone, supportPhone, updatedBy),
    setSettingValue(SETTINGS_KEYS.legal_support_telegram, supportTelegram, updatedBy),
  ]);

  return {
    business_name: businessName,
    business_status: businessStatus,
    inn,
    ogrn,
    address,
    support_email: supportEmail,
    support_phone: supportPhone,
    support_telegram: supportTelegram,
  };
}

export async function getStarterPromptSettings(): Promise<StarterPromptSettings> {
  const [
    openrouterCodingAgent,
    openrouterCodingAgentFast,
    openrouterCodingAgentHeavyPlanning,
    openrouterCodingAgentCodingAlternative,
    dtfNewsAgent,
  ] = await Promise.all([
    getSettingValue(
      SETTINGS_KEYS.starter_prompts_openrouter_coding_agent,
      serializePromptList(CLEAN_DEFAULT_STARTER_PROMPTS.openrouter_coding_agent),
    ),
    getSettingValue(
      SETTINGS_KEYS.starter_prompts_openrouter_coding_agent_fast,
      serializePromptList(CLEAN_DEFAULT_STARTER_PROMPTS.openrouter_coding_agent_fast),
    ),
    getSettingValue(
      SETTINGS_KEYS.starter_prompts_openrouter_coding_agent_heavy_planning,
      serializePromptList(CLEAN_DEFAULT_STARTER_PROMPTS.openrouter_coding_agent_heavy_planning),
    ),
    getSettingValue(
      SETTINGS_KEYS.starter_prompts_openrouter_coding_agent_coding_alternative,
      serializePromptList(CLEAN_DEFAULT_STARTER_PROMPTS.openrouter_coding_agent_coding_alternative),
    ),
    getSettingValue(
      SETTINGS_KEYS.starter_prompts_dtf_news_agent,
      serializePromptList(CLEAN_DEFAULT_STARTER_PROMPTS.dtf_news_agent),
    ),
  ]);

  return {
    openrouter_coding_agent: normalizePromptList(
      openrouterCodingAgent,
      CLEAN_DEFAULT_STARTER_PROMPTS.openrouter_coding_agent,
    ),
    openrouter_coding_agent_fast: normalizePromptList(
      openrouterCodingAgentFast,
      CLEAN_DEFAULT_STARTER_PROMPTS.openrouter_coding_agent_fast,
    ),
    openrouter_coding_agent_heavy_planning: normalizePromptList(
      openrouterCodingAgentHeavyPlanning,
      CLEAN_DEFAULT_STARTER_PROMPTS.openrouter_coding_agent_heavy_planning,
    ),
    openrouter_coding_agent_coding_alternative: normalizePromptList(
      openrouterCodingAgentCodingAlternative,
      CLEAN_DEFAULT_STARTER_PROMPTS.openrouter_coding_agent_coding_alternative,
    ),
    dtf_news_agent: normalizePromptList(
      dtfNewsAgent,
      CLEAN_DEFAULT_STARTER_PROMPTS.dtf_news_agent,
    ),
  };
}

export async function getSignupBonusSettings() {
  const raw = await getSettingValue(
    SETTINGS_KEYS.signup_bonus_requires_email_verification,
    String(DEFAULT_SIGNUP_BONUS_REQUIRES_EMAIL_VERIFICATION),
  );

  return {
    requires_email_verification: normalizeBoolean(
      raw,
      DEFAULT_SIGNUP_BONUS_REQUIRES_EMAIL_VERIFICATION,
    ),
  };
}

export async function updateSignupBonusSettings(input: {
  signup_bonus_requires_email_verification?: boolean;
}, updatedBy?: string | null) {
  const requiresEmailVerification = normalizeBoolean(
    input.signup_bonus_requires_email_verification,
    DEFAULT_SIGNUP_BONUS_REQUIRES_EMAIL_VERIFICATION,
  );

  await setSettingValue(
    SETTINGS_KEYS.signup_bonus_requires_email_verification,
    String(requiresEmailVerification),
    updatedBy,
  );

  return {
    requires_email_verification: requiresEmailVerification,
  };
}

export async function updateStarterPromptSettings(input: Partial<StarterPromptSettings>, updatedBy?: string | null) {
  const normalized = {
    openrouter_coding_agent: normalizePromptList(
      input.openrouter_coding_agent,
      CLEAN_DEFAULT_STARTER_PROMPTS.openrouter_coding_agent,
    ),
    openrouter_coding_agent_fast: normalizePromptList(
      input.openrouter_coding_agent_fast,
      CLEAN_DEFAULT_STARTER_PROMPTS.openrouter_coding_agent_fast,
    ),
    openrouter_coding_agent_heavy_planning: normalizePromptList(
      input.openrouter_coding_agent_heavy_planning,
      CLEAN_DEFAULT_STARTER_PROMPTS.openrouter_coding_agent_heavy_planning,
    ),
    openrouter_coding_agent_coding_alternative: normalizePromptList(
      input.openrouter_coding_agent_coding_alternative,
      CLEAN_DEFAULT_STARTER_PROMPTS.openrouter_coding_agent_coding_alternative,
    ),
    dtf_news_agent: normalizePromptList(
      input.dtf_news_agent,
      CLEAN_DEFAULT_STARTER_PROMPTS.dtf_news_agent,
    ),
  };

  await Promise.all([
    setSettingValue(
      SETTINGS_KEYS.starter_prompts_openrouter_coding_agent,
      serializePromptList(normalized.openrouter_coding_agent),
      updatedBy,
    ),
    setSettingValue(
      SETTINGS_KEYS.starter_prompts_openrouter_coding_agent_fast,
      serializePromptList(normalized.openrouter_coding_agent_fast),
      updatedBy,
    ),
    setSettingValue(
      SETTINGS_KEYS.starter_prompts_openrouter_coding_agent_heavy_planning,
      serializePromptList(normalized.openrouter_coding_agent_heavy_planning),
      updatedBy,
    ),
    setSettingValue(
      SETTINGS_KEYS.starter_prompts_openrouter_coding_agent_coding_alternative,
      serializePromptList(normalized.openrouter_coding_agent_coding_alternative),
      updatedBy,
    ),
    setSettingValue(
      SETTINGS_KEYS.starter_prompts_dtf_news_agent,
      serializePromptList(normalized.dtf_news_agent),
      updatedBy,
    ),
  ]);

  return normalized;
}

export function resolveStarterPromptsForAgentSlug(
  slug: string | null | undefined,
  fallback: string[],
  settings: StarterPromptSettings,
): string[] {
  if (!slug) return fallback;

  if (slug === 'openrouter-coding-agent') return settings.openrouter_coding_agent;
  if (slug === 'openrouter-coding-agent-fast') return settings.openrouter_coding_agent_fast;
  if (slug === 'openrouter-coding-agent-heavy-planning') return settings.openrouter_coding_agent_heavy_planning;
  if (slug === 'openrouter-coding-agent-coding-alternative') {
    return settings.openrouter_coding_agent_coding_alternative;
  }
  if (slug === 'dtf-news-agent') return settings.dtf_news_agent;

  return fallback;
}

export async function getAdminSettings() {
  const [usd_to_rub_rate, topUp, legal, starterPrompts, signupBonus] = await Promise.all([
    getUsdToRubRate(),
    getTopUpSettings(),
    getLegalSettings(),
    getStarterPromptSettings(),
    getSignupBonusSettings(),
  ]);

  return {
    usd_to_rub_rate,
    topup_message: topUp.message,
    topup_telegram: topUp.telegram,
    topup_email: topUp.email,
    topup_phone: topUp.phone,
    legal_business_name: legal.business_name,
    legal_business_status: legal.business_status,
    legal_inn: legal.inn,
    legal_ogrn: legal.ogrn,
    legal_address: legal.address,
    legal_support_email: legal.support_email,
    legal_support_phone: legal.support_phone,
    legal_support_telegram: legal.support_telegram,
    starter_prompts_openrouter_coding_agent: starterPrompts.openrouter_coding_agent,
    starter_prompts_openrouter_coding_agent_fast: starterPrompts.openrouter_coding_agent_fast,
    starter_prompts_openrouter_coding_agent_heavy_planning: starterPrompts.openrouter_coding_agent_heavy_planning,
    starter_prompts_openrouter_coding_agent_coding_alternative: starterPrompts.openrouter_coding_agent_coding_alternative,
    starter_prompts_dtf_news_agent: starterPrompts.dtf_news_agent,
    signup_bonus_requires_email_verification: signupBonus.requires_email_verification,
  };
}

export async function getPublicAppSettings() {
  const [topUp, legal, starterPrompts, usdToRubRate] = await Promise.all([
    getTopUpSettings(),
    getLegalSettings(),
    getStarterPromptSettings(),
    getUsdToRubRate(),
  ]);

  return {
    usd_to_rub_rate: usdToRubRate,
    topup: {
      message: topUp.message,
      telegram: topUp.telegram,
      email: topUp.email,
      phone: topUp.phone,
    },
    legal: {
      business_name: legal.business_name,
      business_status: legal.business_status,
      inn: legal.inn,
      ogrn: legal.ogrn,
      address: legal.address,
      support_email: legal.support_email,
      support_phone: legal.support_phone,
      support_telegram: legal.support_telegram,
    },
    starter_prompts: starterPrompts,
  };
}
