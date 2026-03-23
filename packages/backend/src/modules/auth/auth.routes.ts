import { Router } from 'express';
import * as controller from './auth.controller.js';
import { validateRegister, validateLogin } from './auth.validators.js';
import { requireAuth } from '../../middleware/auth-guard.js';

const router = Router();

router.post('/register', validateRegister, controller.register);
router.post('/login', validateLogin, controller.login);
router.post('/logout', requireAuth, controller.logout);
router.get('/me', requireAuth, controller.me);

export const authRoutes = router;
