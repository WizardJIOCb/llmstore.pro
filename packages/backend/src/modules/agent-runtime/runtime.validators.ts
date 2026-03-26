import { z } from 'zod';
import { validate } from '../../middleware/validate.js';

const startRunSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(10000),
  })).min(1),
  variables: z.record(z.string()).optional(),
});

export const validateStartRun = validate(startRunSchema, 'body');

const createChatSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  mode: z.enum(['general', 'agent']).default('general'),
  agent_id: z.string().uuid().optional().nullable(),
  model_external_id: z.string().min(1).max(255).optional().nullable(),
  system_prompt: z.string().max(8000).optional().nullable(),
});

const updateChatSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  mode: z.enum(['general', 'agent']).optional(),
  agent_id: z.string().uuid().optional().nullable(),
  model_external_id: z.string().min(1).max(255).optional().nullable(),
  system_prompt: z.string().max(8000).optional().nullable(),
});

const sendMessageSchema = z.object({
  content: z.string().min(1).max(32000),
});

export const validateCreateChat = validate(createChatSchema, 'body');
export const validateUpdateChat = validate(updateChatSchema, 'body');
export const validateSendChatMessage = validate(sendMessageSchema, 'body');
