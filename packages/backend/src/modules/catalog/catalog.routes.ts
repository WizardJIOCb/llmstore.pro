import { Router } from 'express';
import * as controller from './catalog.controller.js';
import { validateCatalogQuery, validateCreateCatalogComment } from './catalog.validators.js';
import { requireAuth } from '../../middleware/auth-guard.js';

const router = Router();

// Taxonomy endpoints
router.get('/categories', controller.getCategories);
router.get('/tags', controller.getTags);
router.get('/use-cases', controller.getUseCases);

// Catalog list with filtering + pagination
router.get('/', validateCatalogQuery, controller.list);

// Single item by slug (cross-type, for article pages)
router.get('/article/:slug', controller.getBySlug);
router.get('/article/:slug/comments', controller.listCommentsBySlug);
router.post('/article/:slug/comments', requireAuth, validateCreateCatalogComment, controller.createCommentBySlug);
router.delete('/article/:slug/comments/:commentId', requireAuth, controller.deleteCommentBySlug);

// Single item by type and slug
router.get('/:type/:slug', controller.getByTypeAndSlug);

export const catalogRoutes = router;
