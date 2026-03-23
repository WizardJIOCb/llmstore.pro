import { z } from 'zod';
import { validate } from '../../middleware/validate.js';

const createAgentSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().max(255).optional(),
  description: z.string().max(2000).optional(),
  visibility: z.enum(['public', 'private', 'unlisted']).optional(),
  system_prompt: z.string().max(10000).optional(),
  model_id: z.string().uuid().nullable().optional(),
  runtime_config: z.record(z.unknown()).optional(),
  tool_ids: z.array(z.string().uuid()).optional(),
});

const updateAgentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  visibility: z.enum(['public', 'private', 'unlisted']).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
});

const createVersionSchema = z.object({
  system_prompt: z.string().max(10000).optional(),
  model_id: z.string().uuid().nullable().optional(),
  runtime_config: z.record(z.unknown()).optional(),
  tool_ids: z.array(z.string().uuid()).optional(),
  response_mode: z.enum(['text', 'json_object', 'json_schema']).optional(),
});

export const validateCreateAgent = validate(createAgentSchema, 'body');
export const validateUpdateAgent = validate(updateAgentSchema, 'body');
export const validateCreateVersion = validate(createVersionSchema, 'body');
