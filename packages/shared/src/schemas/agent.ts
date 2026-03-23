import { z } from 'zod';
import { responseModeValues } from '../constants/index.js';

export const createAgentSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  visibility: z.enum(['public', 'private', 'unlisted']).default('private'),
  source_catalog_item_id: z.string().uuid().nullable().optional(),
});

export type CreateAgentInput = z.infer<typeof createAgentSchema>;

export const updateAgentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  visibility: z.enum(['public', 'private', 'unlisted']).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
});

export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;

export const runtimeConfigSchema = z.object({
  temperature: z.number().min(0).max(2).default(0.7),
  max_tokens: z.number().int().min(1).max(200000).default(2048),
  top_p: z.number().min(0).max(1).default(1),
  stream: z.boolean().default(true),
  max_iterations: z.number().int().min(1).max(20).default(6),
  timeout_ms: z.number().int().min(5000).max(300000).default(60000),
});

export const routingConfigSchema = z.object({
  allow_fallbacks: z.boolean().default(true),
  provider_preferences: z.array(z.string()).optional(),
});

export const privacyConfigSchema = z.object({
  zdr_mode: z.boolean().default(false),
  data_retention: z.enum(['default', 'minimal', 'none']).default('default'),
});

export const evaluationConfigSchema = z.object({
  cost_warning_threshold_usd: z.number().min(0).default(0.5),
  cost_hard_limit_usd: z.number().min(0).default(5.0),
});

export const createAgentVersionSchema = z.object({
  model_id: z.string().uuid().nullable().optional(),
  system_prompt: z.string().nullable().optional(),
  developer_prompt: z.string().nullable().optional(),
  starter_prompt_template: z.string().nullable().optional(),
  variables_schema: z.record(z.unknown()).nullable().optional(),
  response_mode: z.enum(responseModeValues).default('text'),
  response_schema: z.record(z.unknown()).nullable().optional(),
  runtime_config: runtimeConfigSchema.optional(),
  routing_config: routingConfigSchema.optional(),
  privacy_config: privacyConfigSchema.optional(),
  tool_config: z.record(z.unknown()).nullable().optional(),
  evaluation_config: evaluationConfigSchema.optional(),
  tools: z
    .array(
      z.object({
        tool_definition_id: z.string().uuid(),
        is_required: z.boolean().default(false),
        order_index: z.number().int().default(0),
        config_override_json: z.record(z.unknown()).nullable().optional(),
      }),
    )
    .optional(),
});

export type CreateAgentVersionInput = z.infer<typeof createAgentVersionSchema>;
