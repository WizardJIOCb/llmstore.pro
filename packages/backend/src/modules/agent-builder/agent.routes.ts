import { Router } from 'express';
import { requireAuth } from '../../middleware/auth-guard.js';
import * as controller from './agent.controller.js';
import { validateCreateAgent, validateUpdateAgent, validateCreateVersion } from './agent.validators.js';

const router = Router();

// Builtin tools (no auth needed)
router.get('/tools/builtin', controller.listBuiltinTools);

// Agent stats (must be before /:id to avoid param collision)
router.get('/stats', requireAuth, controller.getStats);

// Agent CRUD
router.post('/', requireAuth, validateCreateAgent, controller.create);
router.get('/', requireAuth, controller.list);
router.get('/:id', requireAuth, controller.get);
router.put('/:id', requireAuth, validateUpdateAgent, controller.update);
router.delete('/:id', requireAuth, controller.remove);

// Versioning
router.post('/:id/versions', requireAuth, validateCreateVersion, controller.createVersion);

export const agentBuilderRoutes = router;
