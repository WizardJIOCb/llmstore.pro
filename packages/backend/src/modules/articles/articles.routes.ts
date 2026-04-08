import { Router } from 'express';
import * as controller from './articles.controller.js';
import {
  validateArticleIdParams,
  validateArticleListQuery,
  validateArticleParams,
  validateArticlePollVote,
  validateArticleReport,
  validateUpsertArticle,
} from './articles.validators.js';
import { requireAuth } from '../../middleware/auth-guard.js';
import { articleUpload } from '../../config/upload.js';

const router = Router();

router.get('/', validateArticleListQuery, controller.list);
router.get('/mine', requireAuth, controller.listMine);
router.get('/mine/bookmarks', requireAuth, controller.listBookmarks);
router.get('/mine/analytics', requireAuth, controller.analytics);
router.get('/mine/:id', requireAuth, validateArticleIdParams, controller.getMineById);
router.post('/upload/image', requireAuth, articleUpload.single('image'), controller.uploadHeroImage);
router.post('/upload/hero', requireAuth, articleUpload.single('image'), controller.uploadHeroImage);
router.post('/', requireAuth, validateUpsertArticle, controller.create);
router.put('/:id', requireAuth, validateArticleIdParams, validateUpsertArticle, controller.update);
router.get('/:slug', validateArticleParams, controller.getBySlug);
router.post('/:slug/reaction', requireAuth, validateArticleParams, controller.like);
router.delete('/:slug/reaction', requireAuth, validateArticleParams, controller.unlike);
router.post('/:slug/bookmark', requireAuth, validateArticleParams, controller.bookmark);
router.delete('/:slug/bookmark', requireAuth, validateArticleParams, controller.unbookmark);
router.post('/:slug/poll/vote', requireAuth, validateArticleParams, validateArticlePollVote, controller.votePoll);
router.post('/:slug/report', requireAuth, validateArticleParams, validateArticleReport, controller.report);

export const articleRoutes = router;
