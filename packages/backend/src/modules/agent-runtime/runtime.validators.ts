import { z } from 'zod';
import { validate } from '../../middleware/validate.js';

const startRunSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(10000),
  })).min(1),
  variables: z.record(z.string()).optional(),
  reasoning_effort: z.enum(['auto', 'none', 'low', 'medium', 'high', 'xhigh']).optional().nullable(),
});

export const validateStartRun = validate(startRunSchema, 'body');

const createChatSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  note: z.string().max(300).optional().nullable(),
  mode: z.enum(['general', 'agent']).default('general'),
  agent_id: z.string().uuid().optional().nullable(),
  model_external_id: z.string().min(1).max(255).optional().nullable(),
  system_prompt: z.string().max(8000).optional().nullable(),
  reasoning_effort: z.enum(['auto', 'none', 'low', 'medium', 'high', 'xhigh']).optional().nullable(),
  tool_ids: z.array(z.string().uuid()).max(64).optional(),
  project_id: z.string().uuid().optional().nullable(),
  project_folder_id: z.string().uuid().optional().nullable(),
  access: z.enum(['public', 'private', 'restricted']).optional(),
  access_identifiers: z.array(z.string().min(1).max(255)).max(200).optional(),
});

const createChatWorkspaceProjectSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  git_remote_url: z.string().max(1000).optional().nullable(),
});

const updateChatWorkspaceProjectSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  git_remote_url: z.string().max(1000).optional().nullable(),
  status: z.enum(['active', 'archived']).optional(),
});

const createChatWorkspaceFolderSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  parent_folder_id: z.string().uuid().optional().nullable(),
});

const updateChatWorkspaceFolderSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  parent_folder_id: z.string().uuid().optional().nullable(),
  sort_order: z.number().int().min(0).max(1_000_000_000).optional(),
});

const saveChatWorkspaceFileSchema = z.object({
  path: z.string().min(1).max(1000),
  content: z.string().max(1_000_000),
});

const telegramBotQuickstartSchema = z.object({
  preset: z.enum(['dtf_news', 'web_news', 'product_tracker', 'memory', 'support']),
  bot_name: z.string().min(1).max(120).optional(),
  telegram_bot_token: z.string().min(20).max(200).regex(
    /^\d{5,20}:[A-Za-z0-9_-]{20,}$/,
    'Проверьте токен от BotFather',
  ),
  prompt: z.string().max(6000).optional().nullable(),
  source_url: z.string().max(1000).optional().nullable(),
  timezone: z.string().max(80).optional().nullable(),
});

const updateChatSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  note: z.string().max(300).optional().nullable(),
  mode: z.enum(['general', 'agent']).optional(),
  agent_id: z.string().uuid().optional().nullable(),
  model_external_id: z.string().min(1).max(255).optional().nullable(),
  system_prompt: z.string().max(8000).optional().nullable(),
  reasoning_effort: z.enum(['auto', 'none', 'low', 'medium', 'high', 'xhigh']).optional().nullable(),
  tool_ids: z.array(z.string().uuid()).max(64).optional(),
  project_id: z.string().uuid().optional().nullable(),
  project_folder_id: z.string().uuid().optional().nullable(),
  project_sort_order: z.number().int().min(0).max(1_000_000_000).optional().nullable(),
  context_window_tokens: z.number().int().min(8192).max(2_000_000).optional().nullable(),
  context_blocks: z.object({
    brief: z.string().max(6000).optional().nullable(),
    facts: z.string().max(12000).optional().nullable(),
    brand: z.string().max(6000).optional().nullable(),
    response_rules: z.string().max(6000).optional().nullable(),
    memory: z.string().max(6000).optional().nullable(),
  }).optional().nullable(),
  access: z.enum(['public', 'private', 'restricted']).optional(),
  access_identifiers: z.array(z.string().min(1).max(255)).max(200).optional(),
  pin_to_top: z.boolean().optional(),
  unpin_from_top: z.boolean().optional(),
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

const publishLandingSchema = z.object({
  subdomain: z.string().min(3).max(63).optional().nullable(),
  title: z.string().max(255).optional().nullable(),
});

const updateLandingSchema = z.object({
  subdomain: z.string().min(3).max(63).optional().nullable(),
  title: z.string().max(255).optional().nullable(),
  slug: z.string().max(255).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
});

const upsertProjectDeploymentSchema = z.object({
  env: z.record(z.string().max(4000)).optional().default({}),
  linked_agent_id: z.string().uuid().optional().nullable(),
  model_external_id: z.string().min(1).max(255).optional().nullable(),
  set_telegram_webhook: z.boolean().optional().default(false),
});

const controlProjectDeploymentSchema = upsertProjectDeploymentSchema.extend({
  action: z.enum(['start', 'stop', 'update_settings', 'clear_logs']),
});

const projectDeploymentAgentRunSchema = z.object({
  message: z.string().min(1).max(16_000),
});

const setGalleryReactionSchema = z.object({
  reaction_type: z.enum(['heart', 'thumbs_up', 'thumbs_down', 'laugh', 'smile', 'meh']),
});

export const validateCreateChat = validate(createChatSchema, 'body');
export const validateCreateChatWorkspaceProject = validate(createChatWorkspaceProjectSchema, 'body');
export const validateUpdateChatWorkspaceProject = validate(updateChatWorkspaceProjectSchema, 'body');
export const validateCreateChatWorkspaceFolder = validate(createChatWorkspaceFolderSchema, 'body');
export const validateUpdateChatWorkspaceFolder = validate(updateChatWorkspaceFolderSchema, 'body');
export const validateSaveChatWorkspaceFile = validate(saveChatWorkspaceFileSchema, 'body');
export const validateTelegramBotQuickstart = validate(telegramBotQuickstartSchema, 'body');
export const validateUpdateChat = validate(updateChatSchema, 'body');
export const validateSendChatMessage = validate(sendMessageSchema, 'body');
export const validateUpdateMessagePreview = validate(updateMessagePreviewSchema, 'body');
export const validatePublishLanding = validate(publishLandingSchema, 'body');
export const validateUpdateLanding = validate(updateLandingSchema, 'body');
export const validateUpsertProjectDeployment = validate(upsertProjectDeploymentSchema, 'body');
export const validateControlProjectDeployment = validate(controlProjectDeploymentSchema, 'body');
export const validateProjectDeploymentAgentRun = validate(projectDeploymentAgentRunSchema, 'body');
export const validateSetGalleryReaction = validate(setGalleryReactionSchema, 'body');
export const validateCloneChat = validate(z.object({
  include_messages: z.boolean().optional(),
}), 'body');
