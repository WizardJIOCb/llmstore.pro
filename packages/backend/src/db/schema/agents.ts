import {
  pgTable, uuid, varchar, text, timestamp, integer, boolean, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { jsonb } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { catalogItems } from './catalog';
import { aiModels } from './models';
import { agentStatusEnum, visibilityEnum, responseModeEnum, toolTypeEnum } from './enums';

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  owner_user_id: uuid('owner_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  source_catalog_item_id: uuid('source_catalog_item_id').references(() => catalogItems.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).unique(),
  description: text('description'),
  visibility: visibilityEnum('visibility').notNull().default('private'),
  status: agentStatusEnum('status').notNull().default('draft'),
  current_version_id: uuid('current_version_id'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index('agents_owner_idx').on(table.owner_user_id),
  index('agents_owner_status_idx').on(table.owner_user_id, table.status),
]);

export const agentVersions = pgTable('agent_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  agent_id: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  version_number: integer('version_number').notNull(),
  model_id: uuid('model_id').references(() => aiModels.id, { onDelete: 'set null' }),
  runtime_engine: varchar('runtime_engine', { length: 50 }).notNull().default('openrouter_chat'),
  system_prompt: text('system_prompt'),
  developer_prompt: text('developer_prompt'),
  starter_prompt_template: text('starter_prompt_template'),
  variables_schema: jsonb('variables_schema').$type<Record<string, unknown>>(),
  response_mode: responseModeEnum('response_mode').notNull().default('text'),
  response_schema: jsonb('response_schema').$type<Record<string, unknown>>(),
  runtime_config: jsonb('runtime_config').$type<Record<string, unknown>>().notNull().default({}),
  routing_config: jsonb('routing_config').$type<Record<string, unknown>>(),
  privacy_config: jsonb('privacy_config').$type<Record<string, unknown>>(),
  tool_config: jsonb('tool_config').$type<Record<string, unknown>>(),
  evaluation_config: jsonb('evaluation_config').$type<Record<string, unknown>>(),
  published_at: timestamp('published_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('agent_versions_agent_version_idx').on(table.agent_id, table.version_number),
  index('agent_versions_model_idx').on(table.model_id),
]);

export const toolDefinitions = pgTable('tool_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  owner_user_id: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  tool_type: toolTypeEnum('tool_type').notNull(),
  description: text('description'),
  input_schema: jsonb('input_schema').$type<Record<string, unknown>>().notNull(),
  output_schema: jsonb('output_schema').$type<Record<string, unknown>>(),
  config_json: jsonb('config_json').$type<Record<string, unknown>>(),
  is_builtin: boolean('is_builtin').notNull().default(false),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const agentVersionTools = pgTable('agent_version_tools', {
  agent_version_id: uuid('agent_version_id').notNull().references(() => agentVersions.id, { onDelete: 'cascade' }),
  tool_definition_id: uuid('tool_definition_id').notNull().references(() => toolDefinitions.id, { onDelete: 'cascade' }),
  is_required: boolean('is_required').notNull().default(false),
  order_index: integer('order_index').notNull().default(0),
  config_override_json: jsonb('config_override_json').$type<Record<string, unknown>>(),
}, (table) => [
  uniqueIndex('agent_version_tools_pk').on(table.agent_version_id, table.tool_definition_id),
  index('agent_version_tools_tool_idx').on(table.tool_definition_id),
]);

export const agentTestScenarios = pgTable('agent_test_scenarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  agent_id: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  input_json: jsonb('input_json').$type<Record<string, unknown>>().notNull(),
  expected_output_schema: jsonb('expected_output_schema').$type<Record<string, unknown>>(),
  rubric_json: jsonb('rubric_json').$type<Record<string, unknown>[]>(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('agent_test_scenarios_agent_idx').on(table.agent_id),
]);
