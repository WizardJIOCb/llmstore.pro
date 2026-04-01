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
  access: z.enum(['public', 'private', 'restricted']).optional(),
  access_identifiers: z.array(z.string().min(1).max(255)).max(200).optional(),
});

const updateChatSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  mode: z.enum(['general', 'agent']).optional(),
  agent_id: z.string().uuid().optional().nullable(),
  model_external_id: z.string().min(1).max(255).optional().nullable(),
  system_prompt: z.string().max(8000).optional().nullable(),
  access: z.enum(['public', 'private', 'restricted']).optional(),
  access_identifiers: z.array(z.string().min(1).max(255)).max(200).optional(),
});

const sendMessageSchema = z.object({
  content: z.string().max(32000).default(''),
  attachments: z.array(
    z.object({
      filename: z.string().min(1).max(500),
      original_name: z.string().max(500).optional().nullable(),
      url: z.string().max(2000).optional().nullable(),
      kind: z.enum(['image', 'text', 'file']).optional().nullable(),
      mime_type: z.string().max(200).optional().nullable(),
      size: z.coerce.number().int().min(0).optional().nullable(),
    }),
  ).max(8).optional().default([]),
});

const updateMessagePreviewSchema = z.object({
  title: z.string().max(200).optional().nullable(),
  html: z.string().min(1).max(50_000),
});

export const validateCreateChat = validate(createChatSchema, 'body');
export const validateUpdateChat = validate(updateChatSchema, 'body');
export const validateSendChatMessage = validate(sendMessageSchema, 'body');
export const validateUpdateMessagePreview = validate(updateMessagePreviewSchema, 'body');
