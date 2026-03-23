import {
  pgTable, uuid, varchar, timestamp, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { jsonb } from 'drizzle-orm/pg-core';

export const sourceCacheEntries = pgTable('source_cache_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  cache_key: varchar('cache_key', { length: 500 }).notNull(),
  source_type: varchar('source_type', { length: 50 }).notNull(),
  content_json: jsonb('content_json').$type<Record<string, unknown>>().notNull(),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('source_cache_entries_key_idx').on(table.cache_key),
]);
