import { pgTable, uuid, varchar, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { jsonb } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { catalogItems } from './catalog';

export const savedStackResults = pgTable('saved_stack_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }),
  builder_answers: jsonb('builder_answers').$type<Record<string, unknown>>().notNull(),
  recommended_result: jsonb('recommended_result').$type<Record<string, unknown>>().notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('saved_stack_results_user_idx').on(table.user_id),
]);

export const favorites = pgTable('favorites', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  catalog_item_id: uuid('catalog_item_id').notNull().references(() => catalogItems.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('favorites_user_item_idx').on(table.user_id, table.catalog_item_id),
  index('favorites_user_idx').on(table.user_id),
  index('favorites_item_idx').on(table.catalog_item_id),
]);
