import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, numeric, timestamp, date, index, uniqueIndex } from 'drizzle-orm/pg-core';
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
  email_verified_at: timestamp('email_verified_at', { withTimezone: true }),
  last_login_at: timestamp('last_login_at', { withTimezone: true }),
  last_activity_at: timestamp('last_activity_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex('users_email_lower_idx').on(sql`lower(${table.email})`),
  index('users_last_activity_at_idx').on(table.last_activity_at),
]);

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

export const userDailyActivity = pgTable('user_daily_activity', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  day: date('day').notNull(),
  last_activity_at: timestamp('last_activity_at', { withTimezone: true }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex('user_daily_activity_user_day_idx').on(table.user_id, table.day),
  index('user_daily_activity_day_idx').on(table.day),
  index('user_daily_activity_last_activity_idx').on(table.last_activity_at),
]);

export const signupBonusGrants = pgTable('signup_bonus_grants', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  ip_address: varchar('ip_address', { length: 128 }),
  device_fingerprint: varchar('device_fingerprint', { length: 255 }),
  user_agent: text('user_agent'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('signup_bonus_grants_user_id_idx').on(table.user_id),
  uniqueIndex('signup_bonus_grants_ip_idx').on(table.ip_address),
  uniqueIndex('signup_bonus_grants_fingerprint_idx').on(table.device_fingerprint),
  index('signup_bonus_grants_created_at_idx').on(table.created_at),
]);

export const emailVerificationTokens = pgTable('email_verification_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token_hash: varchar('token_hash', { length: 128 }).notNull(),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  used_at: timestamp('used_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('email_verification_tokens_hash_idx').on(table.token_hash),
  index('email_verification_tokens_user_id_idx').on(table.user_id),
  index('email_verification_tokens_expires_at_idx').on(table.expires_at),
]);
