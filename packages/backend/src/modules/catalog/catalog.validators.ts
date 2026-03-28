import { catalogQuerySchema } from '@llmstore/shared/schemas';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';

export const validateCatalogQuery = validate(catalogQuerySchema, 'query');

const createCatalogCommentSchema = z.object({
  content: z.string().trim().min(1).max(5000),
});

export const validateCreateCatalogComment = validate(createCatalogCommentSchema, 'body');
