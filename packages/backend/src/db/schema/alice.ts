import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { jsonb } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { chatConversations } from './runtime';
import { agents } from './agents';
import { aliceDefaultTargetTypeEnum, aliceTtsModeEnum } from './enums';

export const aliceUserSettings = pgTable('alice_user_settings', {
  user_id: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  is_enabled: boolean('is_enabled').notNull().default(true),
  default_target_type: aliceDefaultTargetTypeEnum('default_target_type').notNull().default('general_chat'),
  default_chat_id: uuid('default_chat_id').references(() => chatConversations.id, { onDelete: 'set null' }),
  default_agent_id: uuid('default_agent_id').references(() => agents.id, { onDelete: 'set null' }),
  default_model_external_id: varchar('default_model_external_id', { length: 255 }),
  save_messages: boolean('save_messages').notNull().default(true),
  tts_mode: aliceTtsModeEnum('tts_mode').notNull().default('brief'),
  max_tts_chars: integer('max_tts_chars').notNull().default(900),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const aliceOauthAuthorizationCodes = pgTable('alice_oauth_authorization_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  client_id: varchar('client_id', { length: 255 }).notNull(),
  code_hash: varchar('code_hash', { length: 128 }).notNull(),
  redirect_uri: text('redirect_uri').notNull(),
  scopes_json: jsonb('scopes_json').$type<string[]>(),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumed_at: timestamp('consumed_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('alice_oauth_authorization_codes_code_hash_idx').on(table.code_hash),
  index('alice_oauth_authorization_codes_user_id_idx').on(table.user_id),
  index('alice_oauth_authorization_codes_expires_at_idx').on(table.expires_at),
]);

export const aliceOauthTokens = pgTable('alice_oauth_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  client_id: varchar('client_id', { length: 255 }).notNull(),
  access_token_hash: varchar('access_token_hash', { length: 128 }).notNull(),
  refresh_token_hash: varchar('refresh_token_hash', { length: 128 }),
  access_expires_at: timestamp('access_expires_at', { withTimezone: true }).notNull(),
  refresh_expires_at: timestamp('refresh_expires_at', { withTimezone: true }),
  revoked_at: timestamp('revoked_at', { withTimezone: true }),
  last_used_at: timestamp('last_used_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex('alice_oauth_tokens_access_token_hash_idx').on(table.access_token_hash),
  uniqueIndex('alice_oauth_tokens_refresh_token_hash_idx').on(table.refresh_token_hash),
  index('alice_oauth_tokens_user_id_idx').on(table.user_id),
  index('alice_oauth_tokens_access_expires_at_idx').on(table.access_expires_at),
]);

export const aliceSkillLinks = pgTable('alice_skill_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  yandex_skill_user_id: varchar('yandex_skill_user_id', { length: 255 }).notNull(),
  yandex_application_id: varchar('yandex_application_id', { length: 255 }),
  token_id: uuid('token_id').references(() => aliceOauthTokens.id, { onDelete: 'set null' }),
  linked_at: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
  last_seen_at: timestamp('last_seen_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex('alice_skill_links_user_skill_user_idx').on(table.user_id, table.yandex_skill_user_id),
  index('alice_skill_links_user_id_idx').on(table.user_id),
  index('alice_skill_links_yandex_skill_user_id_idx').on(table.yandex_skill_user_id),
]);
