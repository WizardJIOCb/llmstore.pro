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
  openrouter_requests_enabled: z.boolean().default(true),
  openrouter_disabled_message: z.string().trim().min(1).max(1000),
});

export const validateUpdateAdminSettings = validate(updateAdminSettingsSchema, 'body');

const resetUserPasswordSchema = z.object({
  password: z.string().min(8).max(128),
});

export const validateResetUserPassword = validate(resetUserPasswordSchema, 'body');
