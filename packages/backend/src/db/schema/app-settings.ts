import { pgTable, varchar, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import { users } from './auth';

export const appSettings = pgTable('app_settings', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value_text: text('value_text').notNull(),
  updated_by: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index('app_settings_updated_by_idx').on(table.updated_by),
]);
