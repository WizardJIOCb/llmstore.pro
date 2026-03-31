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
  starter_prompts_openrouter_coding_agent: 'starter_prompts_openrouter_coding_agent',
  starter_prompts_openrouter_coding_agent_fast: 'starter_prompts_openrouter_coding_agent_fast',
  starter_prompts_openrouter_coding_agent_heavy_planning: 'starter_prompts_openrouter_coding_agent_heavy_planning',
  starter_prompts_openrouter_coding_agent_coding_alternative: 'starter_prompts_openrouter_coding_agent_coding_alternative',
  starter_prompts_dtf_news_agent: 'starter_prompts_dtf_news_agent',
} as const;

const DEFAULT_TOPUP_MESSAGE = 'У вас не осталось баланса. Скоро вы сможете пополнить его на сайте, а пока можете написать Родиону:';
const DEFAULT_TOPUP_TELEGRAM = '@WizardJIOCb';
const DEFAULT_TOPUP_EMAIL = 'rodion89@list.ru';
const DEFAULT_TOPUP_PHONE = '89264769929';
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
      serializePromptList(DEFAULT_STARTER_PROMPTS.openrouter_coding_agent),
    ),
    getSettingValue(
      SETTINGS_KEYS.starter_prompts_openrouter_coding_agent_fast,
      serializePromptList(DEFAULT_STARTER_PROMPTS.openrouter_coding_agent_fast),
    ),
    getSettingValue(
      SETTINGS_KEYS.starter_prompts_openrouter_coding_agent_heavy_planning,
      serializePromptList(DEFAULT_STARTER_PROMPTS.openrouter_coding_agent_heavy_planning),
    ),
    getSettingValue(
      SETTINGS_KEYS.starter_prompts_openrouter_coding_agent_coding_alternative,
      serializePromptList(DEFAULT_STARTER_PROMPTS.openrouter_coding_agent_coding_alternative),
    ),
    getSettingValue(
      SETTINGS_KEYS.starter_prompts_dtf_news_agent,
      serializePromptList(DEFAULT_STARTER_PROMPTS.dtf_news_agent),
    ),
  ]);

  return {
    openrouter_coding_agent: normalizePromptList(
      openrouterCodingAgent,
      DEFAULT_STARTER_PROMPTS.openrouter_coding_agent,
    ),
    openrouter_coding_agent_fast: normalizePromptList(
      openrouterCodingAgentFast,
      DEFAULT_STARTER_PROMPTS.openrouter_coding_agent_fast,
    ),
    openrouter_coding_agent_heavy_planning: normalizePromptList(
      openrouterCodingAgentHeavyPlanning,
      DEFAULT_STARTER_PROMPTS.openrouter_coding_agent_heavy_planning,
    ),
    openrouter_coding_agent_coding_alternative: normalizePromptList(
      openrouterCodingAgentCodingAlternative,
      DEFAULT_STARTER_PROMPTS.openrouter_coding_agent_coding_alternative,
    ),
    dtf_news_agent: normalizePromptList(
      dtfNewsAgent,
      DEFAULT_STARTER_PROMPTS.dtf_news_agent,
    ),
  };
}

export async function updateStarterPromptSettings(input: Partial<StarterPromptSettings>, updatedBy?: string | null) {
  const normalized = {
    openrouter_coding_agent: normalizePromptList(
      input.openrouter_coding_agent,
      DEFAULT_STARTER_PROMPTS.openrouter_coding_agent,
    ),
    openrouter_coding_agent_fast: normalizePromptList(
      input.openrouter_coding_agent_fast,
      DEFAULT_STARTER_PROMPTS.openrouter_coding_agent_fast,
    ),
    openrouter_coding_agent_heavy_planning: normalizePromptList(
      input.openrouter_coding_agent_heavy_planning,
      DEFAULT_STARTER_PROMPTS.openrouter_coding_agent_heavy_planning,
    ),
    openrouter_coding_agent_coding_alternative: normalizePromptList(
      input.openrouter_coding_agent_coding_alternative,
      DEFAULT_STARTER_PROMPTS.openrouter_coding_agent_coding_alternative,
    ),
    dtf_news_agent: normalizePromptList(
      input.dtf_news_agent,
      DEFAULT_STARTER_PROMPTS.dtf_news_agent,
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
  const [usd_to_rub_rate, topUp, starterPrompts] = await Promise.all([
    getUsdToRubRate(),
    getTopUpSettings(),
    getStarterPromptSettings(),
  ]);

  return {
    usd_to_rub_rate,
    topup_message: topUp.message,
    topup_telegram: topUp.telegram,
    topup_email: topUp.email,
    topup_phone: topUp.phone,
    starter_prompts_openrouter_coding_agent: starterPrompts.openrouter_coding_agent,
    starter_prompts_openrouter_coding_agent_fast: starterPrompts.openrouter_coding_agent_fast,
    starter_prompts_openrouter_coding_agent_heavy_planning: starterPrompts.openrouter_coding_agent_heavy_planning,
    starter_prompts_openrouter_coding_agent_coding_alternative: starterPrompts.openrouter_coding_agent_coding_alternative,
    starter_prompts_dtf_news_agent: starterPrompts.dtf_news_agent,
  };
}

export async function getPublicAppSettings() {
  const [topUp, starterPrompts, usdToRubRate] = await Promise.all([
    getTopUpSettings(),
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
    starter_prompts: starterPrompts,
  };
}
