import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { news } from './news';
import { catalogItems } from './catalog';

export const newsComments = pgTable('news_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  news_id: uuid('news_id').notNull().references(() => news.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index('news_comments_news_created_idx').on(table.news_id, table.created_at),
  index('news_comments_user_idx').on(table.user_id),
]);

export const catalogComments = pgTable('catalog_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  item_id: uuid('item_id').notNull().references(() => catalogItems.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index('catalog_comments_item_created_idx').on(table.item_id, table.created_at),
  index('catalog_comments_user_idx').on(table.user_id),
]);
