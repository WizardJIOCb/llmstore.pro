import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as controller from './alice.controller.js';

const router = Router();

const oauthLimiter = rateLimit({
  windowMs: 60_000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(express.urlencoded({ extended: false }));

router.get('/oauth/authorize', controller.oauthAuthorize);
router.post('/oauth/authorize/decision', controller.oauthAuthorizeDecision);
router.post('/oauth/token', oauthLimiter, controller.oauthToken);
router.post('/oauth/revoke', oauthLimiter, controller.oauthRevoke);
router.post('/webhook', oauthLimiter, controller.webhook);

export const aliceRoutes = router;
