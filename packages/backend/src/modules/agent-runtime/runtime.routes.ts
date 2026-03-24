import { Router } from 'express';
import { requireAuth } from '../../middleware/auth-guard.js';
import * as controller from './runtime.controller.js';
import { validateStartRun } from './runtime.validators.js';

const router = Router();

// Chat history (authenticated)
router.get('/agents/:agentId/chat', requireAuth, controller.getChatHistory);
router.post('/agents/:agentId/chat/share', requireAuth, controller.shareChat);
router.post('/agents/:agentId/chat/clear', requireAuth, controller.clearChat);

// Shared chat (public — no auth)
router.get('/shared/chat/:token', controller.getSharedChat);

// Runs
router.post('/agents/:agentId/runs', requireAuth, validateStartRun, controller.startRun);
router.get('/runs/:id', requireAuth, controller.getRun);
router.get('/runs', requireAuth, controller.listRuns);

export const agentRuntimeRoutes = router;
