import {
  pgTable, uuid, varchar, text, timestamp, integer, numeric, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { jsonb } from 'drizzle-orm/pg-core';
import { catalogItems } from './catalog';

export const aiModels = pgTable('ai_models', {
  id: uuid('id').primaryKey().defaultRandom(),
  catalog_item_id: uuid('catalog_item_id').notNull().unique().references(() => catalogItems.id, { onDelete: 'cascade' }),
  provider_source: varchar('provider_source', { length: 50 }).notNull().default('openrouter'),
  external_model_id: varchar('external_model_id', { length: 500 }).notNull().unique(),
  canonical_slug: varchar('canonical_slug', { length: 500 }).notNull().unique(),
  display_name: varchar('display_name', { length: 500 }).notNull(),
  context_length: integer('context_length'),
  tokenizer: varchar('tokenizer', { length: 100 }),
  modality: varchar('modality', { length: 50 }),
  input_modalities: jsonb('input_modalities').$type<string[]>(),
  output_modalities: jsonb('output_modalities').$type<string[]>(),
  supported_parameters: jsonb('supported_parameters').$type<string[]>(),
  pricing_prompt: numeric('pricing_prompt', { precision: 20, scale: 10 }),
  pricing_completion: numeric('pricing_completion', { precision: 20, scale: 10 }),
  pricing_request: numeric('pricing_request', { precision: 20, scale: 10 }),
  pricing_image: numeric('pricing_image', { precision: 20, scale: 10 }),
  provider_meta_json: jsonb('provider_meta_json').$type<Record<string, unknown>>(),
  raw_json: jsonb('raw_json').$type<Record<string, unknown>>(),
  last_synced_at: timestamp('last_synced_at', { withTimezone: true }),
}, (table) => [
  index('ai_models_provider_source_idx').on(table.provider_source),
]);

export const modelPriceSnapshots = pgTable('model_price_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  ai_model_id: uuid('ai_model_id').notNull().references(() => aiModels.id, { onDelete: 'cascade' }),
  pricing_prompt: numeric('pricing_prompt', { precision: 20, scale: 10 }),
  pricing_completion: numeric('pricing_completion', { precision: 20, scale: 10 }),
  pricing_request: numeric('pricing_request', { precision: 20, scale: 10 }),
  pricing_image: numeric('pricing_image', { precision: 20, scale: 10 }),
  captured_at: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('model_price_snapshots_model_date_idx').on(table.ai_model_id, table.captured_at),
]);
