import { Router } from 'express';
import { requireAuth } from '../../middleware/auth-guard.js';
import { validateRecommend, validateSave, validateExport, validateCreateAgent } from './validators.js';
import * as controller from './controller.js';

const router = Router();

// Public — anyone can get recommendations
router.post('/recommend', validateRecommend, controller.recommend);

// Auth required — save, list, get saved results
router.post('/save', requireAuth, validateSave, controller.save);
router.get('/saved', requireAuth, controller.listSaved);
router.get('/saved/:id', requireAuth, controller.getSaved);

// Export — works without auth (uses inline result), or with auth (for saved_result_id)
router.post('/export', validateExport, controller.exportResult);

// Auth required — create agent from recommendation
router.post('/create-agent', requireAuth, validateCreateAgent, controller.createAgent);

export const stackBuilderRoutes = router;
