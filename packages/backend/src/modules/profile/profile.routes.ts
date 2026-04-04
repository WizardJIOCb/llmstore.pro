import { Router } from 'express';
import * as controller from './profile.controller.js';
import { requireAuth } from '../../middleware/auth-guard.js';
import { validateChangePassword } from './profile.validators.js';

const router = Router();

router.get('/public/:username', controller.getPublicProfile);

router.use(requireAuth);

router.get('/', controller.getProfile);
router.get('/leaderboard', controller.getProfileLeaderboard);
router.put('/', controller.updateProfile);
router.put('/password', validateChangePassword, controller.changePassword);
router.delete('/linked-accounts/:provider', controller.unlinkAccount);

export const profileRoutes = router;
