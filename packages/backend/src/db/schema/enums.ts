import { pgEnum } from 'drizzle-orm/pg-core';

// Auth enums
export const userRoleEnum = pgEnum('user_role', ['user', 'power_user', 'curator', 'admin']);
export const userStatusEnum = pgEnum('user_status', ['active', 'suspended', 'deleted']);
export const authProviderEnum = pgEnum('auth_provider', ['email', 'google', 'github', 'yandex', 'mailru', 'vk']);

// Catalog enums
export const contentTypeEnum = pgEnum('content_type', [
  'tool', 'model', 'prompt_pack', 'workflow_pack', 'business_agent',
  'developer_asset', 'local_build', 'stack_preset', 'guide',
]);
export const itemStatusEnum = pgEnum('item_status', ['draft', 'published', 'archived']);
export const visibilityEnum = pgEnum('visibility', ['public', 'private', 'unlisted']);

// Filter enums
export const pricingTypeEnum = pgEnum('pricing_type', [
  'free', 'paid', 'open_source', 'api_based', 'freemium', 'enterprise',
]);
export const deploymentTypeEnum = pgEnum('deployment_type', ['cloud', 'local', 'self_hosted', 'hybrid']);
export const privacyTypeEnum = pgEnum('privacy_type', ['public_api', 'private', 'offline', 'zero_retention']);
export const languageSupportEnum = pgEnum('language_support', ['ru', 'en', 'multilingual']);
export const difficultyEnum = pgEnum('difficulty', ['beginner', 'intermediate', 'advanced']);
export const readinessEnum = pgEnum('readiness', ['template', 'deployable', 'production_ready']);

// Agent enums
export const agentStatusEnum = pgEnum('agent_status', ['draft', 'active', 'archived']);
export const responseModeEnum = pgEnum('response_mode', ['text', 'json_object', 'json_schema']);
export const toolTypeEnum = pgEnum('tool_type', [
  'http_request', 'calculator', 'json_transform', 'template_renderer',
  'knowledge_lookup', 'mock_tool', 'webhook_call',
]);

// Runtime enums
export const agentRunStatusEnum = pgEnum('agent_run_status', [
  'pending', 'preparing', 'running', 'waiting_for_tool', 'tool_executing',
  'continuing', 'completed', 'failed', 'cancelled',
]);
export const agentRunModeEnum = pgEnum('agent_run_mode', ['chat', 'scenario', 'comparison', 'preflight']);
export const toolCallStatusEnum = pgEnum('tool_call_status', ['pending', 'running', 'success', 'error', 'timeout']);
export const chatConversationModeEnum = pgEnum('chat_conversation_mode', ['general', 'agent']);

// Subtype enums
export const assetTypeEnum = pgEnum('asset_type', [
  'system_prompt', 'json_schema', 'output_schema', 'eval_dataset',
  'tool_definition', 'rag_preset', 'guardrail_rules', 'connector_template', 'starter_template',
]);
export const assetFormatEnum = pgEnum('asset_format', ['json', 'yaml', 'markdown', 'text', 'csv', 'jsonl']);
export const runtimeTypeEnum = pgEnum('runtime_type', ['ollama', 'lm_studio', 'llama_cpp', 'open_webui', 'vllm', 'other']);
export const budgetTierEnum = pgEnum('budget_tier', ['free', 'low', 'medium', 'high', 'enterprise']);
export const complexityLevelEnum = pgEnum('complexity_level', ['simple', 'moderate', 'complex', 'expert']);
export const currencyEnum = pgEnum('currency', ['usd']);

// News enums
export const newsStatusEnum = pgEnum('news_status', ['draft', 'published']);
