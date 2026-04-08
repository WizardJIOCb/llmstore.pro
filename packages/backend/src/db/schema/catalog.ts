import {
  pgTable, uuid, varchar, text, timestamp, boolean, integer, index, uniqueIndex, date,
} from 'drizzle-orm/pg-core';
import { jsonb } from 'drizzle-orm/pg-core';
import {
  contentTypeEnum, itemStatusEnum, visibilityEnum,
  pricingTypeEnum, deploymentTypeEnum, privacyTypeEnum,
  languageSupportEnum, difficultyEnum, readinessEnum,
} from './enums';
import { users } from './auth';

export const catalogItems = pgTable('catalog_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: contentTypeEnum('type').notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  slug: varchar('slug', { length: 500 }).notNull().unique(),
  short_description: text('short_description'),
  full_description: text('full_description'),
  status: itemStatusEnum('status').notNull().default('draft'),
  visibility: visibilityEnum('visibility').notNull().default('public'),
  hero_image_url: text('hero_image_url'),
  author_user_id: uuid('author_user_id').references(() => users.id, { onDelete: 'set null' }),
  curated_score: integer('curated_score').notNull().default(0),
  featured: boolean('featured').notNull().default(false),
  views_count: integer('views_count').notNull().default(0),
  seo_title: varchar('seo_title', { length: 255 }),
  seo_description: text('seo_description'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  published_at: timestamp('published_at', { withTimezone: true }),
}, (table) => [
  index('catalog_items_type_idx').on(table.type),
  index('catalog_items_type_status_vis_idx').on(table.type, table.status, table.visibility),
  index('catalog_items_status_vis_published_idx').on(table.status, table.visibility, table.published_at),
  index('catalog_items_status_vis_curated_idx').on(table.status, table.visibility, table.curated_score),
  index('catalog_items_author_idx').on(table.author_user_id),
]);

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  parent_id: uuid('parent_id'),
}, (table) => [
  index('categories_parent_id_idx').on(table.parent_id),
]);

export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
});

export const useCases = pgTable('use_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
});

export const catalogItemCategories = pgTable('catalog_item_categories', {
  item_id: uuid('item_id').notNull().references(() => catalogItems.id, { onDelete: 'cascade' }),
  category_id: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
}, (table) => [
  uniqueIndex('catalog_item_cat_pk').on(table.item_id, table.category_id),
  index('catalog_item_cat_category_idx').on(table.category_id),
]);

export const catalogItemTags = pgTable('catalog_item_tags', {
  item_id: uuid('item_id').notNull().references(() => catalogItems.id, { onDelete: 'cascade' }),
  tag_id: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (table) => [
  uniqueIndex('catalog_item_tags_pk').on(table.item_id, table.tag_id),
  index('catalog_item_tags_tag_idx').on(table.tag_id),
]);

export const catalogItemUseCases = pgTable('catalog_item_use_cases', {
  item_id: uuid('item_id').notNull().references(() => catalogItems.id, { onDelete: 'cascade' }),
  use_case_id: uuid('use_case_id').notNull().references(() => useCases.id, { onDelete: 'cascade' }),
}, (table) => [
  uniqueIndex('catalog_item_uc_pk').on(table.item_id, table.use_case_id),
  index('catalog_item_uc_uc_idx').on(table.use_case_id),
]);

export const catalogItemMeta = pgTable('catalog_item_meta', {
  item_id: uuid('item_id').primaryKey().references(() => catalogItems.id, { onDelete: 'cascade' }),
  pricing_type: pricingTypeEnum('pricing_type'),
  deployment_type: deploymentTypeEnum('deployment_type'),
  privacy_type: privacyTypeEnum('privacy_type'),
  language_support: languageSupportEnum('language_support'),
  difficulty: difficultyEnum('difficulty'),
  readiness: readinessEnum('readiness'),
  vendor_name: varchar('vendor_name', { length: 255 }),
  source_url: text('source_url'),
  docs_url: text('docs_url'),
  github_url: text('github_url'),
  website_url: text('website_url'),
  primary_cta_label: varchar('primary_cta_label', { length: 80 }),
  primary_cta_url: text('primary_cta_url'),
  secondary_cta_label: varchar('secondary_cta_label', { length: 80 }),
  secondary_cta_url: text('secondary_cta_url'),
  reading_time_minutes: integer('reading_time_minutes'),
  metadata_json: jsonb('metadata_json').$type<Record<string, unknown>>().default({}),
}, (table) => [
  index('catalog_item_meta_pricing_idx').on(table.pricing_type),
  index('catalog_item_meta_deployment_idx').on(table.deployment_type),
  index('catalog_item_meta_language_idx').on(table.language_support),
  index('catalog_item_meta_privacy_idx').on(table.privacy_type),
]);

export const catalogItemReactions = pgTable('catalog_item_reactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  item_id: uuid('item_id').notNull().references(() => catalogItems.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('catalog_item_reactions_item_user_idx').on(table.item_id, table.user_id),
  index('catalog_item_reactions_item_idx').on(table.item_id),
  index('catalog_item_reactions_item_created_idx').on(table.item_id, table.created_at),
  index('catalog_item_reactions_user_idx').on(table.user_id),
]);

export const catalogItemBookmarks = pgTable('catalog_item_bookmarks', {
  id: uuid('id').primaryKey().defaultRandom(),
  item_id: uuid('item_id').notNull().references(() => catalogItems.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('catalog_item_bookmarks_item_user_idx').on(table.item_id, table.user_id),
  index('catalog_item_bookmarks_item_idx').on(table.item_id),
  index('catalog_item_bookmarks_item_created_idx').on(table.item_id, table.created_at),
  index('catalog_item_bookmarks_user_idx').on(table.user_id),
]);

export const catalogItemReports = pgTable('catalog_item_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  item_id: uuid('item_id').notNull().references(() => catalogItems.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reason: varchar('reason', { length: 32 }).notNull(),
  details: text('details'),
  status: varchar('status', { length: 24 }).notNull().default('open'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex('catalog_item_reports_item_user_idx').on(table.item_id, table.user_id),
  index('catalog_item_reports_item_idx').on(table.item_id),
  index('catalog_item_reports_status_idx').on(table.status),
  index('catalog_item_reports_user_idx').on(table.user_id),
]);

export const catalogItemViewEvents = pgTable('catalog_item_view_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  item_id: uuid('item_id').notNull().references(() => catalogItems.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  viewer_key: varchar('viewer_key', { length: 512 }).notNull(),
  viewed_on: date('viewed_on').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('catalog_item_view_events_item_viewer_day_idx').on(table.item_id, table.viewer_key, table.viewed_on),
  index('catalog_item_view_events_item_viewed_on_idx').on(table.item_id, table.viewed_on),
  index('catalog_item_view_events_user_idx').on(table.user_id),
]);
