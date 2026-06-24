import { z } from 'zod';
import { createCatalogItemSchema, updateCatalogItemSchema } from '@llmstore/shared/schemas';
import { validate } from '../../middleware/validate.js';

export const validateCreateItem = validate(createCatalogItemSchema, 'body');
export const validateUpdateItem = validate(updateCatalogItemSchema, 'body');

const adminListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  type: z.string().optional(),
  status: z.string().optional(),
  search: z.string().max(200).optional(),
  sort: z.string().optional(),
});

export const validateAdminListQuery = validate(adminListQuerySchema, 'query');

const isoDateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const adminChartsQuerySchema = z.object({
  date_from: isoDateOnlySchema.optional(),
  date_to: isoDateOnlySchema.optional(),
});

export const validateAdminChartsQuery = validate(adminChartsQuerySchema, 'query');

const adminPaymentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  date_from: isoDateOnlySchema.optional(),
  date_to: isoDateOnlySchema.optional(),
  status: z.enum(['all', 'pending', 'waiting_for_capture', 'succeeded', 'canceled', 'creation_failed']).optional(),
  provider: z.string().trim().min(1).max(50).optional(),
  search: z.string().trim().max(200).optional(),
});

export const validateAdminPaymentsQuery = validate(adminPaymentsQuerySchema, 'query');

const adminProfitabilityQuerySchema = z.object({
  date_from: isoDateOnlySchema.optional(),
  date_to: isoDateOnlySchema.optional(),
});

export const validateAdminProfitabilityQuery = validate(adminProfitabilityQuerySchema, 'query');

const profitabilityModelRuleSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  model_pattern: z.string().trim().min(1).max(500),
  markup_multiplier: z.coerce.number().min(0).max(20),
  enabled: z.boolean().default(true),
});

const profitabilityUserOverrideSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  user_id: z.string().trim().max(80).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
  mode: z.literal('at_cost').default('at_cost'),
  enabled: z.boolean().default(true),
}).refine((value) => Boolean(value.user_id || value.email), {
  message: 'Нужно указать user_id или email',
});

const updateProfitabilitySettingsSchema = z.object({
  enabled: z.boolean().default(true),
  global_markup_multiplier: z.coerce.number().min(0).max(20),
  min_charge_usd: z.coerce.number().min(0).max(10),
  fixed_fee_usd: z.coerce.number().min(0).max(10),
  rounding_decimals: z.coerce.number().int().min(2).max(4),
  yookassa_fee_percent: z.coerce.number().min(0).max(30),
  yookassa_fee_fixed_rub: z.coerce.number().min(0).max(10_000),
  tax_reserve_percent: z.coerce.number().min(0).max(100),
  fx_buffer_percent: z.coerce.number().min(0).max(100),
  bonus_reserve_percent: z.coerce.number().min(0).max(100),
  user_role_multipliers: z.object({
    user: z.coerce.number().min(0).max(10),
    power_user: z.coerce.number().min(0).max(10),
    curator: z.coerce.number().min(0).max(10),
    admin: z.coerce.number().min(0).max(10),
  }),
  model_rules: z.array(profitabilityModelRuleSchema).max(20),
  user_overrides: z.array(profitabilityUserOverrideSchema).max(200).default([]),
});

export const validateUpdateProfitabilitySettings = validate(updateProfitabilitySettingsSchema, 'body');

const adminRuntimesQuerySchema = z.object({
  search: z.string().max(200).optional(),
  status: z.enum(['all', 'deploying', 'running', 'stopped', 'failed']).optional(),
});

export const validateAdminRuntimesQuery = validate(adminRuntimesQuerySchema, 'query');

const adminDebugChatsQuerySchema = z.object({
  query: z.string().trim().min(1).max(1000),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const validateAdminDebugChatsQuery = validate(adminDebugChatsQuerySchema, 'query');

const adminAliceLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(500).optional(),
  status: z.enum(['all', 'success', 'error', 'ping_pong']).optional(),
});

export const validateAdminAliceLogsQuery = validate(adminAliceLogsQuerySchema, 'query');

const taxonomyCreateSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  parent_id: z.string().uuid().nullable().optional(),
});

const taxonomyUpdateSchema = taxonomyCreateSchema.partial();

export const validateTaxonomyCreate = validate(taxonomyCreateSchema, 'body');
export const validateTaxonomyUpdate = validate(taxonomyUpdateSchema, 'body');

const toolTypeValues = [
  'http_request',
  'calculator',
  'json_transform',
  'template_renderer',
  'knowledge_lookup',
  'mock_tool',
  'webhook_call',
] as const;

const createToolSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  tool_type: z.enum(toolTypeValues),
  description: z.string().max(5000).optional().nullable(),
  input_schema: z.record(z.string(), z.unknown()),
  output_schema: z.record(z.string(), z.unknown()).optional().nullable(),
  config_json: z.record(z.string(), z.unknown()).optional().nullable(),
  is_builtin: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
});

const updateToolSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  tool_type: z.enum(toolTypeValues).optional(),
  description: z.string().max(5000).optional().nullable(),
  input_schema: z.record(z.string(), z.unknown()).optional(),
  output_schema: z.record(z.string(), z.unknown()).optional().nullable(),
  config_json: z.record(z.string(), z.unknown()).optional().nullable(),
  is_builtin: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export const validateCreateTool = validate(createToolSchema, 'body');
export const validateUpdateTool = validate(updateToolSchema, 'body');

const updateAdminSettingsSchema = z.object({
  usd_to_rub_rate: z.coerce.number().positive().max(1000),
  topup_message: z.string().min(1).max(500),
  topup_telegram: z.string().min(1).max(100),
  topup_email: z.string().email().max(255),
  topup_phone: z.string().min(1).max(50),
  legal_business_name: z.string().trim().min(1).max(255),
  legal_business_status: z.string().trim().min(1).max(100),
  legal_inn: z.string().trim().min(1).max(50),
  legal_ogrn: z.string().trim().max(50),
  legal_address: z.string().trim().min(1).max(500),
  legal_support_email: z.string().email().max(255),
  legal_support_phone: z.string().trim().min(1).max(50),
  legal_support_telegram: z.string().trim().min(1).max(100),
  starter_prompts_openrouter_coding_agent: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
  starter_prompts_openrouter_coding_agent_fast: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
  starter_prompts_openrouter_coding_agent_heavy_planning: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
  starter_prompts_openrouter_coding_agent_coding_alternative: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
  starter_prompts_dtf_news_agent: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
  signup_bonus_requires_email_verification: z.boolean().default(false),
  signup_bonus_amount_usd: z.coerce.number().min(0).max(1000).default(0.05),
  openrouter_requests_enabled: z.boolean().default(true),
  openrouter_disabled_message: z.string().trim().min(1).max(1000),
  enabled_general_chat_models: z.array(z.string().trim().min(1).max(255)).min(1).max(100),
});

export const validateUpdateAdminSettings = validate(updateAdminSettingsSchema, 'body');

const resetUserPasswordSchema = z.object({
  password: z.string().min(8).max(128),
});

export const validateResetUserPassword = validate(resetUserPasswordSchema, 'body');
