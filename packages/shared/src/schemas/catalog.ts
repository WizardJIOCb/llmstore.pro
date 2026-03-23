import { z } from 'zod';
import {
  contentTypeValues,
  itemStatusValues,
  visibilityValues,
  pricingTypeValues,
  deploymentTypeValues,
  privacyTypeValues,
  languageSupportValues,
  difficultyValues,
  readinessValues,
} from '../constants/index.js';

export const catalogItemMetaSchema = z.object({
  pricing_type: z.enum(pricingTypeValues).nullable().optional(),
  deployment_type: z.enum(deploymentTypeValues).nullable().optional(),
  privacy_type: z.enum(privacyTypeValues).nullable().optional(),
  language_support: z.enum(languageSupportValues).nullable().optional(),
  difficulty: z.enum(difficultyValues).nullable().optional(),
  readiness: z.enum(readinessValues).nullable().optional(),
  vendor_name: z.string().max(255).nullable().optional(),
  source_url: z.string().url().nullable().optional(),
  docs_url: z.string().url().nullable().optional(),
  github_url: z.string().url().nullable().optional(),
  website_url: z.string().url().nullable().optional(),
  metadata_json: z.record(z.unknown()).nullable().optional(),
});

export type CatalogItemMetaInput = z.infer<typeof catalogItemMetaSchema>;

export const createCatalogItemSchema = z.object({
  type: z.enum(contentTypeValues),
  title: z.string().min(1).max(500),
  slug: z
    .string()
    .min(1)
    .max(500)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  short_description: z.string().max(500).nullable().optional(),
  full_description: z.string().nullable().optional(),
  status: z.enum(itemStatusValues).optional(),
  visibility: z.enum(visibilityValues).optional(),
  hero_image_url: z.string().url().nullable().optional(),
  featured: z.boolean().optional(),
  curated_score: z.number().int().min(0).max(100).optional(),
  seo_title: z.string().max(255).nullable().optional(),
  seo_description: z.string().nullable().optional(),
  meta: catalogItemMetaSchema.optional(),
  category_ids: z.array(z.string().uuid()).optional(),
  tag_ids: z.array(z.string().uuid()).optional(),
  use_case_ids: z.array(z.string().uuid()).optional(),
});

export type CreateCatalogItemInput = z.infer<typeof createCatalogItemSchema>;

export const updateCatalogItemSchema = createCatalogItemSchema.partial();

export type UpdateCatalogItemInput = z.infer<typeof updateCatalogItemSchema>;

export const catalogQuerySchema = z.object({
  type: z.enum(contentTypeValues).optional(),
  category: z.string().optional(),
  tags: z.string().optional(),
  use_case: z.string().optional(),
  pricing: z.enum(pricingTypeValues).optional(),
  deployment: z.enum(deploymentTypeValues).optional(),
  privacy: z.enum(privacyTypeValues).optional(),
  language: z.enum(languageSupportValues).optional(),
  difficulty: z.enum(difficultyValues).optional(),
  featured: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  search: z.string().max(200).optional(),
  sort: z
    .enum(['newest', 'curated', 'alphabetical', 'cheapest', 'context_length'])
    .default('curated'),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CatalogQueryInput = z.infer<typeof catalogQuerySchema>;
