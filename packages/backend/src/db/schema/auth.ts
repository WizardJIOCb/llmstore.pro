import { pgTable, uuid, varchar, text, numeric, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { userRoleEnum, userStatusEnum, authProviderEnum } from './enums';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 100 }).unique(),
  name: varchar('name', { length: 255 }),
  avatar_url: text('avatar_url'),
  role: userRoleEnum('role').notNull().default('user'),
  status: userStatusEnum('status').notNull().default('active'),
  password_hash: text('password_hash'),
  balance_usd: numeric('balance_usd', { precision: 12, scale: 4 }).notNull().default('0'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const authAccounts = pgTable('auth_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: authProviderEnum('provider').notNull(),
  provider_account_id: varchar('provider_account_id', { length: 255 }).notNull(),
  access_token: text('access_token'),
  refresh_token: text('refresh_token'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('auth_accounts_provider_id_idx').on(table.provider, table.provider_account_id),
  index('auth_accounts_user_id_idx').on(table.user_id),
]);

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 512 }).notNull().unique(),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('sessions_user_id_idx').on(table.user_id),
  index('sessions_expires_at_idx').on(table.expires_at),
]);
