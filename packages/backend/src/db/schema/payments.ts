import {
  pgTable,
  uuid,
  varchar,
  numeric,
  text,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { balanceTransactions } from './analytics';

export const balanceTopups = pgTable('balance_topups', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 50 }).notNull().default('yookassa'),
  provider_payment_id: varchar('provider_payment_id', { length: 200 }),
  idempotence_key: varchar('idempotence_key', { length: 200 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  amount_rub: numeric('amount_rub', { precision: 12, scale: 2 }).notNull(),
  amount_usd: numeric('amount_usd', { precision: 12, scale: 4 }).notNull(),
  usd_to_rub_rate: numeric('usd_to_rub_rate', { precision: 12, scale: 4 }).notNull(),
  description: text('description'),
  confirmation_url: text('confirmation_url'),
  return_url: text('return_url'),
  balance_transaction_id: uuid('balance_transaction_id').references(() => balanceTransactions.id, { onDelete: 'set null' }),
  raw_payment_json: jsonb('raw_payment_json').$type<Record<string, unknown>>(),
  paid_at: timestamp('paid_at', { withTimezone: true }),
  credited_at: timestamp('credited_at', { withTimezone: true }),
  canceled_at: timestamp('canceled_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex('balance_topups_idempotence_key_idx').on(table.idempotence_key),
  uniqueIndex('balance_topups_provider_payment_id_idx').on(table.provider_payment_id),
  index('balance_topups_user_id_idx').on(table.user_id),
  index('balance_topups_status_idx').on(table.status),
  index('balance_topups_created_at_idx').on(table.created_at),
]);
