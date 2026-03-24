import { Router } from 'express';
import * as controller from './news.controller.js';
import { validateNewsListQuery } from './news.validators.js';

const router = Router();

// Public routes (no auth required)
router.get('/', validateNewsListQuery, controller.list);
router.get('/:slug', controller.getBySlug);

export const newsRoutes = router;
