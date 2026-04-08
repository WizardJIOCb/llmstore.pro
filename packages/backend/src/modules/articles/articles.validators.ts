import { z } from 'zod';
import { validate } from '../../middleware/validate.js';

const articleSlugSchema = z
  .string()
  .trim()
  .min(3)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const urlOrAppPathSchema = z
  .string()
  .trim()
  .refine((value) => {
    if (!value) return false;
    if (value.startsWith('/')) {
      return !value.startsWith('//');
    }

    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }, 'Expected an absolute URL or an internal app path');

export const articleListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(24).default(12),
  search: z.string().trim().max(200).optional(),
  sort: z.enum(['top_day', 'top_week', 'top_month', 'top_all', 'newest']).default('top_week'),
  featured: z
    .string()
    .transform((value) => value === 'true')
    .optional(),
  recommended: z
    .string()
    .transform((value) => value === 'true')
    .optional(),
});

export const articleParamsSchema = z.object({
  slug: articleSlugSchema,
});

const articleMetaSchema = z.object({
  primary_cta_label: z.string().trim().max(80).nullable().optional(),
  primary_cta_url: urlOrAppPathSchema.nullable().optional(),
  secondary_cta_label: z.string().trim().max(80).nullable().optional(),
  secondary_cta_url: urlOrAppPathSchema.nullable().optional(),
  reading_time_minutes: z.number().int().min(1).max(240).nullable().optional(),
  metadata_json: z.record(z.unknown()).nullable().optional(),
});

const articleTaxonomySchema = z.object({
  category_ids: z.array(z.string().uuid()).max(12).optional(),
  tag_ids: z.array(z.string().uuid()).max(20).optional(),
  use_case_ids: z.array(z.string().uuid()).max(12).optional(),
});

export const upsertArticleSchema = z.object({
  title: z.string().trim().min(4).max(500),
  slug: articleSlugSchema,
  short_description: z.string().trim().min(12).max(500),
  full_description: z.string().trim().min(2).max(1000000),
  hero_image_url: urlOrAppPathSchema.nullable().optional(),
  seo_title: z.string().trim().max(255).nullable().optional(),
  seo_description: z.string().trim().max(500).nullable().optional(),
  status: z.enum(['draft', 'published']).default('draft'),
  meta: articleMetaSchema.optional(),
}).merge(articleTaxonomySchema);

export const articleIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const articleReportSchema = z.object({
  reason: z.enum(['spam', 'abuse', 'broken', 'copyright', 'other']),
  details: z.string().trim().max(1500).optional(),
});

export const articlePollVoteSchema = z.object({
  option_id: z.string().trim().min(1).max(120),
});

export const validateArticleListQuery = validate(articleListQuerySchema, 'query');
export const validateArticleParams = validate(articleParamsSchema, 'params');
export const validateArticleIdParams = validate(articleIdParamsSchema, 'params');
export const validateUpsertArticle = validate(upsertArticleSchema, 'body');
export const validateArticleReport = validate(articleReportSchema, 'body');
export const validateArticlePollVote = validate(articlePollVoteSchema, 'body');

export type ArticleListQueryInput = z.infer<typeof articleListQuerySchema>;
export type UpsertArticleInput = z.infer<typeof upsertArticleSchema>;
export type ArticleReportInput = z.infer<typeof articleReportSchema>;
export type ArticlePollVoteInput = z.infer<typeof articlePollVoteSchema>;
