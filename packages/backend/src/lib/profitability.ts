import { eq } from 'drizzle-orm';
import type { UserRole } from '@llmstore/shared';
import { db } from '../config/database.js';
import { appSettings, users } from '../db/schema/index.js';
import { normalizeOpenRouterModelId } from './model-pricing.js';

const PROFITABILITY_SETTINGS_KEY = 'profitability_settings_v1';
const SETTINGS_CACHE_TTL_MS = 30_000;

export interface ProfitabilityModelRule {
  id: string;
  label: string;
  model_pattern: string;
  markup_multiplier: number;
  enabled: boolean;
}

export interface ProfitabilityUserOverride {
  id: string;
  label: string;
  user_id: string | null;
  email: string | null;
  mode: 'at_cost';
  enabled: boolean;
}

export interface ProfitabilitySettings {
  enabled: boolean;
  global_markup_multiplier: number;
  min_charge_usd: number;
  fixed_fee_usd: number;
  rounding_decimals: number;
  yookassa_fee_percent: number;
  yookassa_fee_fixed_rub: number;
  tax_reserve_percent: number;
  fx_buffer_percent: number;
  bonus_reserve_percent: number;
  user_role_multipliers: Record<UserRole, number>;
  model_rules: ProfitabilityModelRule[];
  user_overrides: ProfitabilityUserOverride[];
}

export interface ProfitabilityQuote {
  provider_cost_usd: number;
  customer_charge_usd: number;
  margin_usd: number;
  effective_markup_multiplier: number;
  effective_markup_percent: number;
  model_rule_id: string | null;
  model_rule_label: string | null;
  user_override_id: string | null;
  user_override_label: string | null;
  pricing_mode: 'standard' | 'at_cost' | 'pricing_disabled';
  policy_snapshot: {
    enabled: boolean;
    global_markup_multiplier: number;
    role_multiplier: number;
    model_rule_multiplier: number | null;
    user_override_id: string | null;
    pricing_mode: 'standard' | 'at_cost' | 'pricing_disabled';
    min_charge_usd: number;
    fixed_fee_usd: number;
    rounding_decimals: number;
  };
}

export const DEFAULT_PROFITABILITY_SETTINGS: ProfitabilitySettings = {
  enabled: true,
  global_markup_multiplier: 1.35,
  min_charge_usd: 0.0001,
  fixed_fee_usd: 0,
  rounding_decimals: 4,
  yookassa_fee_percent: 3.5,
  yookassa_fee_fixed_rub: 0,
  tax_reserve_percent: 6,
  fx_buffer_percent: 3,
  bonus_reserve_percent: 5,
  user_role_multipliers: {
    user: 1,
    power_user: 1,
    curator: 1,
    admin: 1,
  },
  model_rules: [
    {
      id: 'cheap-fast',
      label: 'Cheap / fast models',
      model_pattern: 'gemini-2\\.0-flash|gpt-4o-mini|qwen3-coder-(flash|next)',
      markup_multiplier: 1.25,
      enabled: true,
    },
    {
      id: 'heavy-reasoning',
      label: 'Heavy coding / reasoning',
      model_pattern: 'claude|gpt-5|kimi|qwen3-coder-plus|codestral',
      markup_multiplier: 1.5,
      enabled: true,
    },
  ],
  user_overrides: [],
};

let profitabilityCache: { value: ProfitabilitySettings; expiresAt: number } | null = null;

function clampNumber(value: unknown, fallback: number, min: number, max: number, digits = 4): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.min(Math.max(parsed, min), max);
  return Number(clamped.toFixed(digits));
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeRoleMultipliers(value: unknown): Record<UserRole, number> {
  const input = value && typeof value === 'object'
    ? value as Partial<Record<UserRole, unknown>>
    : {};
  const defaults = DEFAULT_PROFITABILITY_SETTINGS.user_role_multipliers;

  return {
    user: clampNumber(input.user, defaults.user, 0, 10, 4),
    power_user: clampNumber(input.power_user, defaults.power_user, 0, 10, 4),
    curator: clampNumber(input.curator, defaults.curator, 0, 10, 4),
    admin: clampNumber(input.admin, defaults.admin, 0, 10, 4),
  };
}

function normalizeModelRule(value: unknown, index: number): ProfitabilityModelRule | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<Record<keyof ProfitabilityModelRule, unknown>>;
  const rawPattern = typeof input.model_pattern === 'string' ? input.model_pattern.trim() : '';
  if (!rawPattern) return null;

  const id = typeof input.id === 'string' && input.id.trim()
    ? input.id.trim().slice(0, 80)
    : `rule-${index + 1}`;
  const label = typeof input.label === 'string' && input.label.trim()
    ? input.label.trim().slice(0, 120)
    : id;

  return {
    id,
    label,
    model_pattern: rawPattern.slice(0, 500),
    markup_multiplier: clampNumber(input.markup_multiplier, 1, 0, 20, 4),
    enabled: normalizeBoolean(input.enabled, true),
  };
}

function normalizeUserOverride(value: unknown, index: number): ProfitabilityUserOverride | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<Record<keyof ProfitabilityUserOverride, unknown>>;
  const userId = typeof input.user_id === 'string' && input.user_id.trim()
    ? input.user_id.trim().slice(0, 80)
    : null;
  const email = typeof input.email === 'string' && input.email.trim()
    ? input.email.trim().toLowerCase().slice(0, 255)
    : null;
  if (!userId && !email) return null;

  const id = typeof input.id === 'string' && input.id.trim()
    ? input.id.trim().slice(0, 80)
    : `user-override-${index + 1}`;
  const label = typeof input.label === 'string' && input.label.trim()
    ? input.label.trim().slice(0, 120)
    : (email ?? userId ?? id);

  return {
    id,
    label,
    user_id: userId,
    email,
    mode: 'at_cost',
    enabled: normalizeBoolean(input.enabled, true),
  };
}

export function normalizeProfitabilitySettings(input: unknown): ProfitabilitySettings {
  const source = input && typeof input === 'object'
    ? input as Partial<Record<keyof ProfitabilitySettings, unknown>>
    : {};
  const defaults = DEFAULT_PROFITABILITY_SETTINGS;
  const modelRules = Array.isArray(source.model_rules)
    ? source.model_rules
      .map((rule, index) => normalizeModelRule(rule, index))
      .filter((rule): rule is ProfitabilityModelRule => Boolean(rule))
      .slice(0, 20)
    : defaults.model_rules;
  const userOverrides = Array.isArray(source.user_overrides)
    ? source.user_overrides
      .map((override, index) => normalizeUserOverride(override, index))
      .filter((override): override is ProfitabilityUserOverride => Boolean(override))
      .slice(0, 200)
    : defaults.user_overrides;

  return {
    enabled: normalizeBoolean(source.enabled, defaults.enabled),
    global_markup_multiplier: clampNumber(source.global_markup_multiplier, defaults.global_markup_multiplier, 0, 20, 4),
    min_charge_usd: clampNumber(source.min_charge_usd, defaults.min_charge_usd, 0, 10, 6),
    fixed_fee_usd: clampNumber(source.fixed_fee_usd, defaults.fixed_fee_usd, 0, 10, 6),
    rounding_decimals: Math.round(clampNumber(source.rounding_decimals, defaults.rounding_decimals, 2, 4, 0)),
    yookassa_fee_percent: clampNumber(source.yookassa_fee_percent, defaults.yookassa_fee_percent, 0, 30, 4),
    yookassa_fee_fixed_rub: clampNumber(source.yookassa_fee_fixed_rub, defaults.yookassa_fee_fixed_rub, 0, 10_000, 2),
    tax_reserve_percent: clampNumber(source.tax_reserve_percent, defaults.tax_reserve_percent, 0, 100, 4),
    fx_buffer_percent: clampNumber(source.fx_buffer_percent, defaults.fx_buffer_percent, 0, 100, 4),
    bonus_reserve_percent: clampNumber(source.bonus_reserve_percent, defaults.bonus_reserve_percent, 0, 100, 4),
    user_role_multipliers: normalizeRoleMultipliers(source.user_role_multipliers),
    model_rules: modelRules.length > 0 ? modelRules : defaults.model_rules,
    user_overrides: userOverrides,
  };
}

function findMatchingModelRule(modelId: string | null | undefined, settings: ProfitabilitySettings) {
  const normalizedModel = normalizeOpenRouterModelId(modelId ?? '');
  if (!normalizedModel) return null;

  for (const rule of settings.model_rules) {
    if (!rule.enabled || !rule.model_pattern.trim()) continue;

    try {
      if (new RegExp(rule.model_pattern, 'i').test(normalizedModel)) {
        return rule;
      }
    } catch {
      if (normalizedModel.includes(rule.model_pattern.trim().toLowerCase())) {
        return rule;
      }
    }
  }

  return null;
}

function findMatchingUserOverride(input: {
  user_id?: string | null;
  user_email?: string | null;
}, settings: ProfitabilitySettings) {
  const userId = input.user_id?.trim().toLowerCase() ?? '';
  const email = input.user_email?.trim().toLowerCase() ?? '';
  if (!userId && !email) return null;

  return settings.user_overrides.find((override) => {
    if (!override.enabled) return false;
    const overrideUserId = override.user_id?.trim().toLowerCase() ?? '';
    const overrideEmail = override.email?.trim().toLowerCase() ?? '';
    return Boolean(
      (overrideUserId && userId && overrideUserId === userId)
      || (overrideEmail && email && overrideEmail === email),
    );
  }) ?? null;
}

function roundUp(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.ceil((value + Number.EPSILON) * factor) / factor;
}

function normalizeRole(role?: string | null): UserRole {
  if (role === 'power_user' || role === 'curator' || role === 'admin') return role;
  return 'user';
}

export function quoteUsageCharge(input: {
  provider_cost_usd: number;
  model_external_id?: string | null;
  user_role?: string | null;
  user_id?: string | null;
  user_email?: string | null;
}, settings: ProfitabilitySettings = DEFAULT_PROFITABILITY_SETTINGS): ProfitabilityQuote {
  const providerCost = clampNumber(input.provider_cost_usd, 0, 0, 1_000_000, 8);
  const role = normalizeRole(input.user_role);
  const roleMultiplier = settings.user_role_multipliers[role] ?? 1;
  const modelRule = findMatchingModelRule(input.model_external_id, settings);
  const userOverride = findMatchingUserOverride(input, settings);
  const modelRuleMultiplier = modelRule?.markup_multiplier ?? null;
  const pricingMode = userOverride?.mode === 'at_cost'
    ? 'at_cost'
    : (settings.enabled ? 'standard' : 'pricing_disabled');
  const shouldApplyProfit = pricingMode === 'standard';
  const baseMultiplier = shouldApplyProfit
    ? (modelRuleMultiplier ?? settings.global_markup_multiplier)
    : 1;
  const effectiveMultiplier = shouldApplyProfit
    ? Number((baseMultiplier * roleMultiplier).toFixed(4))
    : 1;

  if (providerCost <= 0) {
    return {
      provider_cost_usd: 0,
      customer_charge_usd: 0,
      margin_usd: 0,
      effective_markup_multiplier: effectiveMultiplier,
      effective_markup_percent: Number(((effectiveMultiplier - 1) * 100).toFixed(2)),
      model_rule_id: modelRule?.id ?? null,
      model_rule_label: modelRule?.label ?? null,
      user_override_id: userOverride?.id ?? null,
      user_override_label: userOverride?.label ?? null,
      pricing_mode: pricingMode,
      policy_snapshot: {
        enabled: settings.enabled,
        global_markup_multiplier: settings.global_markup_multiplier,
        role_multiplier: roleMultiplier,
        model_rule_multiplier: modelRuleMultiplier,
        user_override_id: userOverride?.id ?? null,
        pricing_mode: pricingMode,
        min_charge_usd: settings.min_charge_usd,
        fixed_fee_usd: settings.fixed_fee_usd,
        rounding_decimals: settings.rounding_decimals,
      },
    };
  }

  const rawCharge = shouldApplyProfit
    ? providerCost * effectiveMultiplier + settings.fixed_fee_usd
    : providerCost;
  const chargeBeforeRounding = shouldApplyProfit
    ? Math.max(settings.min_charge_usd, rawCharge)
    : rawCharge;
  const customerCharge = roundUp(chargeBeforeRounding, settings.rounding_decimals);

  return {
    provider_cost_usd: Number(providerCost.toFixed(8)),
    customer_charge_usd: Number(customerCharge.toFixed(settings.rounding_decimals)),
    margin_usd: Number((customerCharge - providerCost).toFixed(6)),
    effective_markup_multiplier: effectiveMultiplier,
    effective_markup_percent: Number(((effectiveMultiplier - 1) * 100).toFixed(2)),
    model_rule_id: modelRule?.id ?? null,
    model_rule_label: modelRule?.label ?? null,
    user_override_id: userOverride?.id ?? null,
    user_override_label: userOverride?.label ?? null,
    pricing_mode: pricingMode,
    policy_snapshot: {
      enabled: settings.enabled,
      global_markup_multiplier: settings.global_markup_multiplier,
      role_multiplier: roleMultiplier,
      model_rule_multiplier: modelRuleMultiplier,
      user_override_id: userOverride?.id ?? null,
      pricing_mode: pricingMode,
      min_charge_usd: settings.min_charge_usd,
      fixed_fee_usd: settings.fixed_fee_usd,
      rounding_decimals: settings.rounding_decimals,
    },
  };
}

export async function getProfitabilitySettings(): Promise<ProfitabilitySettings> {
  if (profitabilityCache && profitabilityCache.expiresAt > Date.now()) {
    return profitabilityCache.value;
  }

  const [row] = await db
    .select({ value_text: appSettings.value_text })
    .from(appSettings)
    .where(eq(appSettings.key, PROFITABILITY_SETTINGS_KEY))
    .limit(1);

  let parsed: unknown = DEFAULT_PROFITABILITY_SETTINGS;
  if (row?.value_text) {
    try {
      parsed = JSON.parse(row.value_text);
    } catch {
      parsed = DEFAULT_PROFITABILITY_SETTINGS;
    }
  }

  const settings = normalizeProfitabilitySettings(parsed);
  profitabilityCache = {
    value: settings,
    expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS,
  };
  return settings;
}

export async function updateProfitabilitySettings(
  input: unknown,
  updatedBy?: string | null,
): Promise<ProfitabilitySettings> {
  const settings = normalizeProfitabilitySettings(input);

  await db
    .insert(appSettings)
    .values({
      key: PROFITABILITY_SETTINGS_KEY,
      value_text: JSON.stringify(settings),
      updated_by: updatedBy ?? null,
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value_text: JSON.stringify(settings),
        updated_by: updatedBy ?? null,
        updated_at: new Date(),
      },
    });

  profitabilityCache = {
    value: settings,
    expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS,
  };
  return settings;
}

export async function calculateCustomerChargeForUsage(input: {
  provider_cost_usd: number;
  model_external_id?: string | null;
  user_role?: string | null;
  user_id?: string | null;
  user_email?: string | null;
}): Promise<ProfitabilityQuote> {
  const settings = await getProfitabilitySettings();
  let userEmail = input.user_email ?? null;
  const hasEmailOverrides = settings.user_overrides.some((override) => override.enabled && override.email);

  if (!userEmail && input.user_id && hasEmailOverrides) {
    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, input.user_id))
      .limit(1);
    userEmail = user?.email ?? null;
  }

  return quoteUsageCharge({ ...input, user_email: userEmail }, settings);
}
