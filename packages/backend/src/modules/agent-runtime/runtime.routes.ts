import { Router } from 'express';
import { requireAuth } from '../../middleware/auth-guard.js';
import * as controller from './runtime.controller.js';
import { validateStartRun } from './runtime.validators.js';

const router = Router();

router.post('/agents/:agentId/runs', requireAuth, validateStartRun, controller.startRun);
router.get('/runs/:id', requireAuth, controller.getRun);
router.get('/runs', requireAuth, controller.listRuns);

export const agentRuntimeRoutes = router;
