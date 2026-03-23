import { pgTable, uuid, varchar, text, numeric } from 'drizzle-orm/pg-core';
import { jsonb } from 'drizzle-orm/pg-core';
import { catalogItems } from './catalog';
import {
  assetTypeEnum, assetFormatEnum, runtimeTypeEnum, budgetTierEnum,
  complexityLevelEnum, privacyTypeEnum, deploymentTypeEnum,
} from './enums';

export const promptPacks = pgTable('prompt_packs', {
  id: uuid('id').primaryKey().defaultRandom(),
  catalog_item_id: uuid('catalog_item_id').notNull().unique().references(() => catalogItems.id, { onDelete: 'cascade' }),
  variables_schema: jsonb('variables_schema').$type<Record<string, unknown>>(),
  default_system_prompt: text('default_system_prompt'),
  default_user_prompt: text('default_user_prompt'),
  output_schema: jsonb('output_schema').$type<Record<string, unknown>>(),
  recommended_model_ids: jsonb('recommended_model_ids').$type<string[]>(),
  import_format: varchar('import_format', { length: 50 }),
  export_format: varchar('export_format', { length: 50 }),
});

export const workflowPacks = pgTable('workflow_packs', {
  id: uuid('id').primaryKey().defaultRandom(),
  catalog_item_id: uuid('catalog_item_id').notNull().unique().references(() => catalogItems.id, { onDelete: 'cascade' }),
  workflow_definition: jsonb('workflow_definition').$type<Record<string, unknown>[]>().notNull(),
  variables_schema: jsonb('variables_schema').$type<Record<string, unknown>>(),
  output_schema: jsonb('output_schema').$type<Record<string, unknown>>(),
  recommended_model_ids: jsonb('recommended_model_ids').$type<string[]>(),
});

export const developerAssets = pgTable('developer_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  catalog_item_id: uuid('catalog_item_id').notNull().unique().references(() => catalogItems.id, { onDelete: 'cascade' }),
  asset_type: assetTypeEnum('asset_type').notNull(),
  schema_json: jsonb('schema_json').$type<Record<string, unknown>>(),
  content_text: text('content_text'),
  download_url: text('download_url'),
  format: assetFormatEnum('format'),
  license: varchar('license', { length: 100 }),
  recommended_use_cases: jsonb('recommended_use_cases').$type<string[]>(),
});

export const localBuilds = pgTable('local_builds', {
  id: uuid('id').primaryKey().defaultRandom(),
  catalog_item_id: uuid('catalog_item_id').notNull().unique().references(() => catalogItems.id, { onDelete: 'cascade' }),
  runtime_type: runtimeTypeEnum('runtime_type').notNull(),
  install_steps: text('install_steps'),
  hardware_requirements: jsonb('hardware_requirements').$type<Record<string, unknown>>(),
  os_support: jsonb('os_support').$type<string[]>(),
  model_refs: jsonb('model_refs').$type<Record<string, unknown>[]>(),
  privacy_notes: text('privacy_notes'),
  complexity_level: complexityLevelEnum('complexity_level'),
  benchmark_notes: text('benchmark_notes'),
});

export const stackPresets = pgTable('stack_presets', {
  id: uuid('id').primaryKey().defaultRandom(),
  catalog_item_id: uuid('catalog_item_id').notNull().unique().references(() => catalogItems.id, { onDelete: 'cascade' }),
  stack_definition: jsonb('stack_definition').$type<Record<string, unknown>>().notNull(),
  budget_tier: budgetTierEnum('budget_tier'),
  privacy_tier: privacyTypeEnum('privacy_tier'),
  deployment_mode: deploymentTypeEnum('deployment_mode'),
  recommended_for: jsonb('recommended_for').$type<string[]>(),
});
