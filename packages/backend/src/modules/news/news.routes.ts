import { Router } from 'express';
import * as controller from './news.controller.js';
import { validateCreateNewsComment, validateNewsListQuery } from './news.validators.js';
import { requireAuth } from '../../middleware/auth-guard.js';

const router = Router();

// Public routes (no auth required)
router.get('/', validateNewsListQuery, controller.list);
router.get('/:slug/comments', controller.listComments);
router.post('/:slug/comments', requireAuth, validateCreateNewsComment, controller.createComment);
router.get('/:slug', controller.getBySlug);

export const newsRoutes = router;
