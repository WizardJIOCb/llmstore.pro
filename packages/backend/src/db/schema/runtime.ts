import {
  pgTable, uuid, varchar, text, timestamp, integer, boolean, index, uniqueIndex, date, type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { jsonb } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { agents, agentVersions, toolDefinitions } from './agents';
import { aiModels } from './models';
import {
  agentRunStatusEnum,
  agentRunModeEnum,
  toolCallStatusEnum,
  chatConversationModeEnum,
  chatAccessEnum,
  chatReactionTypeEnum,
  publishedLandingTypeEnum,
  publishedLandingStatusEnum,
} from './enums';

export const chatSessions = pgTable('chat_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  agent_id: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  share_token: varchar('share_token', { length: 64 }),
  title: varchar('title', { length: 500 }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('chat_sessions_agent_user_idx').on(table.agent_id, table.user_id),
  uniqueIndex('chat_sessions_share_token_idx').on(table.share_token),
]);

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  agent_id: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  agent_version_id: uuid('agent_version_id').notNull().references(() => agentVersions.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  deployment_id: uuid('deployment_id'),
  status: agentRunStatusEnum('status').notNull().default('pending'),
  mode: agentRunModeEnum('mode').notNull().default('chat'),
  model_id: uuid('model_id').references(() => aiModels.id, { onDelete: 'set null' }),
  provider_name: varchar('provider_name', { length: 100 }),
  external_generation_id: varchar('external_generation_id', { length: 255 }),
  external_response_id: varchar('external_response_id', { length: 255 }),
  session_key: varchar('session_key', { length: 255 }),
  trace_id: varchar('trace_id', { length: 255 }).notNull(),
  started_at: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  latency_ms: integer('latency_ms'),
  error_message: text('error_message'),
  input_summary: text('input_summary'),
  output_summary: text('output_summary'),
  final_output: text('final_output'),
  final_output_json: jsonb('final_output_json').$type<Record<string, unknown>>(),
}, (table) => [
  index('agent_runs_user_started_idx').on(table.user_id, table.started_at),
  index('agent_runs_agent_started_idx').on(table.agent_id, table.started_at),
  index('agent_runs_version_idx').on(table.agent_version_id),
  index('agent_runs_model_idx').on(table.model_id),
  index('agent_runs_deployment_idx').on(table.deployment_id, table.started_at),
  index('agent_runs_status_idx').on(table.status),
  index('agent_runs_session_key_idx').on(table.session_key),
]);

export const agentRunMessages = pgTable('agent_run_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  run_id: uuid('run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 50 }).notNull(),
  content_text: text('content_text'),
  content_json: jsonb('content_json').$type<Record<string, unknown>>(),
  token_estimate: integer('token_estimate'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('agent_run_messages_run_idx').on(table.run_id),
]);

export const agentRunToolCalls = pgTable('agent_run_tool_calls', {
  id: uuid('id').primaryKey().defaultRandom(),
  run_id: uuid('run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
  tool_definition_id: uuid('tool_definition_id').references(() => toolDefinitions.id, { onDelete: 'set null' }),
  tool_call_id: varchar('tool_call_id', { length: 255 }).notNull(),
  tool_name: varchar('tool_name', { length: 255 }).notNull(),
  tool_input: jsonb('tool_input').$type<Record<string, unknown>>().notNull(),
  tool_output: jsonb('tool_output').$type<Record<string, unknown>>(),
  status: toolCallStatusEnum('status').notNull().default('pending'),
  duration_ms: integer('duration_ms'),
  error_message: text('error_message'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('agent_run_tool_calls_run_idx').on(table.run_id),
]);

export const chatConversations = pgTable('chat_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  agent_id: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  mode: chatConversationModeEnum('mode').notNull().default('general'),
  title: varchar('title', { length: 500 }).notNull().default('Новый чат'),
  model_external_id: varchar('model_external_id', { length: 255 }),
  system_prompt: text('system_prompt'),
  access: chatAccessEnum('access').notNull().default('public'),
  access_identifiers: jsonb('access_identifiers').$type<string[]>().notNull().default([]),
  share_token: varchar('share_token', { length: 64 }),
  settings_json: jsonb('settings_json').$type<Record<string, unknown>>(),
  is_clone: boolean('is_clone').notNull().default(false),
  cloned_from_conversation_id: uuid('cloned_from_conversation_id').references((): AnyPgColumn => chatConversations.id, { onDelete: 'set null' }),
  cloned_at: timestamp('cloned_at', { withTimezone: true }),
  total_view_count: integer('total_view_count').notNull().default(0),
  unique_view_count: integer('unique_view_count').notNull().default(0),
  pinned_at: timestamp('pinned_at', { withTimezone: true }),
  last_message_at: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('chat_conversations_user_pinned_idx').on(table.user_id, table.pinned_at),
  index('chat_conversations_user_last_message_idx').on(table.user_id, table.last_message_at),
  index('chat_conversations_agent_idx').on(table.agent_id),
  index('chat_conversations_is_clone_idx').on(table.is_clone),
  index('chat_conversations_cloned_from_idx').on(table.cloned_from_conversation_id),
  uniqueIndex('chat_conversations_share_token_idx').on(table.share_token),
]);

export const chatConversationMessages = pgTable('chat_conversation_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversation_id: uuid('conversation_id').notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull(),
  content_text: text('content_text').notNull(),
  run_id: uuid('run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
  usage_json: jsonb('usage_json').$type<Record<string, unknown>>(),
  preview_view_count: integer('preview_view_count').notNull().default(0),
  project_run_count: integer('project_run_count').notNull().default(0),
  latency_ms: integer('latency_ms'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('chat_conversation_messages_conversation_created_idx').on(table.conversation_id, table.created_at),
]);

export const chatMessageFiles = pgTable('chat_message_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversation_id: uuid('conversation_id').notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  message_id: uuid('message_id').notNull().references(() => chatConversationMessages.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  run_id: uuid('run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
  tool_call_id: varchar('tool_call_id', { length: 255 }),
  storage_filename: varchar('storage_filename', { length: 255 }).notNull(),
  original_name: varchar('original_name', { length: 500 }).notNull(),
  mime_type: varchar('mime_type', { length: 200 }).notNull(),
  kind: varchar('kind', { length: 20 }).notNull().default('file'),
  size: integer('size').notNull(),
  text_preview: text('text_preview'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('chat_message_files_storage_filename_idx').on(table.storage_filename),
  index('chat_message_files_message_idx').on(table.message_id),
  index('chat_message_files_conversation_idx').on(table.conversation_id),
  index('chat_message_files_user_created_idx').on(table.user_id, table.created_at),
]);

export const chatProjectDeployments = pgTable('chat_project_deployments', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversation_id: uuid('conversation_id').notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  message_id: uuid('message_id').notNull().references(() => chatConversationMessages.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  linked_agent_id: uuid('linked_agent_id').references(() => agents.id, { onDelete: 'set null' }),
  model_external_id: varchar('model_external_id', { length: 255 }),
  title: varchar('title', { length: 255 }).notNull(),
  runtime: varchar('runtime', { length: 20 }).notNull(),
  entrypoint: varchar('entrypoint', { length: 500 }),
  public_token: varchar('public_token', { length: 64 }).notNull(),
  deployment_secret: varchar('deployment_secret', { length: 128 }).notNull(),
  env_json: jsonb('env_json').$type<Record<string, string>>().notNull().default({}),
  status: varchar('status', { length: 20 }).notNull().default('deploying'),
  last_error: text('last_error'),
  last_exit_code: integer('last_exit_code'),
  last_signal: varchar('last_signal', { length: 40 }),
  last_started_at: timestamp('last_started_at', { withTimezone: true }),
  last_stopped_at: timestamp('last_stopped_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('chat_project_deployments_public_token_idx').on(table.public_token),
  uniqueIndex('chat_project_deployments_message_user_idx').on(table.message_id, table.user_id),
  index('chat_project_deployments_user_idx').on(table.user_id, table.created_at),
  index('chat_project_deployments_conversation_idx').on(table.conversation_id),
]);

export const chatProjectDeploymentServices = pgTable('chat_project_deployment_services', {
  id: uuid('id').primaryKey().defaultRandom(),
  deployment_id: uuid('deployment_id').notNull().references(() => chatProjectDeployments.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  service_key: varchar('service_key', { length: 120 }).notNull(),
  kind: varchar('kind', { length: 32 }).notNull(),
  label: varchar('label', { length: 160 }).notNull(),
  mode: varchar('mode', { length: 24 }).notNull().default('managed'),
  engine: varchar('engine', { length: 64 }),
  env_prefix: varchar('env_prefix', { length: 48 }).notNull().default(''),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  config_json: jsonb('config_json').$type<Record<string, unknown>>().notNull().default({}),
  env_json: jsonb('env_json').$type<Record<string, string>>().notNull().default({}),
  last_error: text('last_error'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('chat_project_deployment_services_deployment_key_idx').on(table.deployment_id, table.service_key),
  index('chat_project_deployment_services_deployment_idx').on(table.deployment_id),
  index('chat_project_deployment_services_user_idx').on(table.user_id, table.created_at),
  index('chat_project_deployment_services_status_idx').on(table.status),
]);

export const publishedLandings = pgTable('published_landings', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversation_id: uuid('conversation_id').notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  message_id: uuid('message_id').notNull().references(() => chatConversationMessages.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  deployment_id: uuid('deployment_id').references(() => chatProjectDeployments.id, { onDelete: 'set null' }),
  type: publishedLandingTypeEnum('type').notNull().default('preview_html'),
  status: publishedLandingStatusEnum('status').notNull().default('active'),
  subdomain: varchar('subdomain', { length: 63 }).notNull(),
  title: varchar('title', { length: 255 }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('published_landings_message_idx').on(table.message_id),
  uniqueIndex('published_landings_subdomain_idx').on(table.subdomain),
  index('published_landings_conversation_idx').on(table.conversation_id),
  index('published_landings_status_idx').on(table.status),
  index('published_landings_user_idx').on(table.user_id, table.created_at),
]);

export const chatConversationViewers = pgTable('chat_conversation_viewers', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversation_id: uuid('conversation_id').notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  viewer_key: varchar('viewer_key', { length: 255 }).notNull(),
  view_count: integer('view_count').notNull().default(1),
  first_viewed_at: timestamp('first_viewed_at', { withTimezone: true }).notNull().defaultNow(),
  last_viewed_at: timestamp('last_viewed_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('chat_conversation_viewers_conversation_viewer_idx').on(table.conversation_id, table.viewer_key),
  index('chat_conversation_viewers_conversation_idx').on(table.conversation_id),
]);

export const chatConversationDailyViews = pgTable('chat_conversation_daily_views', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversation_id: uuid('conversation_id').notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  day: date('day').notNull(),
  total_views: integer('total_views').notNull().default(0),
  unique_views: integer('unique_views').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('chat_conversation_daily_views_conversation_day_idx').on(table.conversation_id, table.day),
  index('chat_conversation_daily_views_conversation_idx').on(table.conversation_id),
  index('chat_conversation_daily_views_day_idx').on(table.day),
]);

export const chatConversationReactions = pgTable('chat_conversation_reactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversation_id: uuid('conversation_id').notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reaction_type: chatReactionTypeEnum('reaction_type').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('chat_conversation_reactions_conversation_user_idx').on(table.conversation_id, table.user_id),
  index('chat_conversation_reactions_conversation_idx').on(table.conversation_id),
  index('chat_conversation_reactions_user_idx').on(table.user_id),
]);
