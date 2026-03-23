import { z } from 'zod';
import { createCatalogItemSchema, updateCatalogItemSchema } from '@llmstore/shared/schemas';
import { validate } from '../../middleware/validate.js';

export const validateCreateItem = validate(createCatalogItemSchema, 'body');
export const validateUpdateItem = validate(updateCatalogItemSchema, 'body');

const adminListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  type: z.string().optional(),
  status: z.string().optional(),
  search: z.string().max(200).optional(),
  sort: z.string().optional(),
});

export const validateAdminListQuery = validate(adminListQuerySchema, 'query');

const taxonomyCreateSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  parent_id: z.string().uuid().nullable().optional(),
});

const taxonomyUpdateSchema = taxonomyCreateSchema.partial();

export const validateTaxonomyCreate = validate(taxonomyCreateSchema, 'body');
export const validateTaxonomyUpdate = validate(taxonomyUpdateSchema, 'body');
