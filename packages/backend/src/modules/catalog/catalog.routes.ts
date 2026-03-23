import { Router } from 'express';
import * as controller from './catalog.controller.js';
import { validateCatalogQuery } from './catalog.validators.js';

const router = Router();

// Taxonomy endpoints
router.get('/categories', controller.getCategories);
router.get('/tags', controller.getTags);
router.get('/use-cases', controller.getUseCases);

// Catalog list with filtering + pagination
router.get('/', validateCatalogQuery, controller.list);

// Single item by type and slug
router.get('/:type/:slug', controller.getByTypeAndSlug);

export const catalogRoutes = router;
