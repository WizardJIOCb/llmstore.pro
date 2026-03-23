import { catalogQuerySchema } from '@llmstore/shared/schemas';
import { validate } from '../../middleware/validate.js';

export const validateCatalogQuery = validate(catalogQuerySchema, 'query');
