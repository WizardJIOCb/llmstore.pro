import { z } from 'zod';
import { validate } from '../../middleware/validate.js';

const newsImageSchema = z.object({
  filename: z.string().min(1),
  original_name: z.string().optional(),
  sort_order: z.coerce.number().int().min(0).default(0),
});

const createNewsSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  excerpt: z.string().max(500).nullable().optional(),
  status: z.enum(['draft', 'published']).optional().default('draft'),
  images: z.array(newsImageSchema).optional(),
});

const updateNewsSchema = createNewsSchema.partial();

const newsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(50).default(10),
});

const adminNewsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  search: z.string().max(200).optional(),
});

export const validateCreateNews = validate(createNewsSchema, 'body');
export const validateUpdateNews = validate(updateNewsSchema, 'body');
export const validateNewsListQuery = validate(newsListQuerySchema, 'query');
export const validateAdminNewsListQuery = validate(adminNewsListQuerySchema, 'query');

export type CreateNewsInput = z.infer<typeof createNewsSchema>;
export type UpdateNewsInput = z.infer<typeof updateNewsSchema>;
