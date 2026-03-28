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
