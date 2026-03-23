import {
  pgTable, uuid, varchar, text, timestamp, integer, index,
} from 'drizzle-orm/pg-core';
import { jsonb } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { agents, agentVersions, toolDefinitions } from './agents';
import { aiModels } from './models';
import { agentRunStatusEnum, agentRunModeEnum, toolCallStatusEnum } from './enums';

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  agent_id: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  agent_version_id: uuid('agent_version_id').notNull().references(() => agentVersions.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
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
