import { pgTable, uuid, varchar, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { newsStatusEnum } from './enums';
import { users } from './auth';

export const news = pgTable('news', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 500 }).notNull(),
  slug: varchar('slug', { length: 500 }).notNull().unique(),
  content: text('content').notNull(),
  excerpt: text('excerpt'),
  status: newsStatusEnum('status').notNull().default('draft'),
  views_count: integer('views_count').notNull().default(0),
  author_user_id: uuid('author_user_id').references(() => users.id, { onDelete: 'set null' }),
  published_at: timestamp('published_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index('news_status_published_idx').on(table.status, table.published_at),
  index('news_author_idx').on(table.author_user_id),
]);

export const newsImages = pgTable('news_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  news_id: uuid('news_id').notNull().references(() => news.id, { onDelete: 'cascade' }),
  filename: varchar('filename', { length: 500 }).notNull(),
  original_name: varchar('original_name', { length: 500 }),
  sort_order: integer('sort_order').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('news_images_news_id_sort_idx').on(table.news_id, table.sort_order),
]);
