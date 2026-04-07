import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as controller from './auth.controller.js';
import * as oauthController from './oauth.controller.js';
import { validateRegister, validateLogin } from './auth.validators.js';
import { requireAuth } from '../../middleware/auth-guard.js';
import { validateConfirmEmailVerification } from './email-verification.validators.js';

const router = Router();

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Слишком много попыток регистрации. Попробуйте позже.',
    },
  },
});

router.post('/register', registerLimiter, validateRegister, controller.register);
router.post('/login', validateLogin, controller.login);
router.post('/logout', requireAuth, controller.logout);
router.get('/me', requireAuth, controller.me);
router.post('/stop-impersonation', requireAuth, controller.stopImpersonation);
router.post('/verify-email', validateConfirmEmailVerification, controller.confirmEmailVerification);
router.post('/verify-email/resend', requireAuth, controller.resendEmailVerification);

// OAuth routes
router.get('/oauth/:provider', oauthController.startOAuth);
router.get('/oauth/:provider/callback', oauthController.handleCallback);

export const authRoutes = router;
