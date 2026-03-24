import {
  pgTable, uuid, varchar, text, integer, bigint, numeric, timestamp, date, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { jsonb } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { agents } from './agents';
import { aiModels } from './models';
import { agentRuns } from './runtime';
import { currencyEnum } from './enums';

export const usageLedger = pgTable('usage_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  run_id: uuid('run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 100 }).notNull().default('openrouter'),
  model_external_id: varchar('model_external_id', { length: 500 }).notNull(),
  provider_name: varchar('provider_name', { length: 100 }),
  prompt_tokens: integer('prompt_tokens').notNull().default(0),
  completion_tokens: integer('completion_tokens').notNull().default(0),
  reasoning_tokens: integer('reasoning_tokens'),
  cached_tokens: integer('cached_tokens'),
  total_tokens: integer('total_tokens'),
  estimated_cost: numeric('estimated_cost', { precision: 12, scale: 8 }),
  actual_cost: numeric('actual_cost', { precision: 12, scale: 8 }),
  cache_discount: numeric('cache_discount', { precision: 12, scale: 8 }),
  currency: currencyEnum('currency').notNull().default('usd'),
  raw_usage_json: jsonb('raw_usage_json').$type<Record<string, unknown>>(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('usage_ledger_run_idx').on(table.run_id),
  index('usage_ledger_created_at_idx').on(table.created_at),
]);

export const costDailyAggregates = pgTable('cost_daily_aggregates', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  agent_id: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  model_id: uuid('model_id').references(() => aiModels.id, { onDelete: 'set null' }),
  day: date('day').notNull(),
  total_runs: integer('total_runs').notNull().default(0),
  total_successful_runs: integer('total_successful_runs').notNull().default(0),
  prompt_tokens: bigint('prompt_tokens', { mode: 'number' }).notNull().default(0),
  completion_tokens: bigint('completion_tokens', { mode: 'number' }).notNull().default(0),
  reasoning_tokens: bigint('reasoning_tokens', { mode: 'number' }).notNull().default(0),
  cached_tokens: bigint('cached_tokens', { mode: 'number' }).notNull().default(0),
  actual_cost: numeric('actual_cost', { precision: 14, scale: 8 }).notNull().default('0'),
}, (table) => [
  uniqueIndex('cost_daily_agg_unique_idx').on(table.user_id, table.agent_id, table.model_id, table.day),
  index('cost_daily_agg_user_day_idx').on(table.user_id, table.day),
  index('cost_daily_agg_agent_day_idx').on(table.agent_id, table.day),
  index('cost_daily_agg_day_idx').on(table.day),
]);

export const balanceTransactions = pgTable('balance_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  amount: numeric('amount', { precision: 12, scale: 4 }).notNull(),
  balance_after: numeric('balance_after', { precision: 12, scale: 4 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  description: text('description'),
  performed_by: uuid('performed_by').references(() => users.id, { onDelete: 'set null' }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('balance_tx_user_idx').on(table.user_id),
  index('balance_tx_created_at_idx').on(table.created_at),
]);
