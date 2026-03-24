import { Router } from 'express';
import * as controller from './profile.controller.js';
import { requireAuth } from '../../middleware/auth-guard.js';

const router = Router();

router.use(requireAuth);

router.get('/', controller.getProfile);
router.put('/', controller.updateProfile);
router.delete('/linked-accounts/:provider', controller.unlinkAccount);

export const profileRoutes = router;
