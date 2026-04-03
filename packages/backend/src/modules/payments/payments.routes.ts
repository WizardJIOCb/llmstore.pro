import { Router } from 'express';
import * as controller from './payments.controller.js';
import { requireAuth } from '../../middleware/auth-guard.js';
import { validateCreateYooKassaTopUp, validateTopUpIdParams } from './payments.validators.js';

const router = Router();

router.get('/config', controller.getPublicConfig);
router.post('/webhooks/yookassa', controller.yookassaWebhook);

router.use(requireAuth);

router.post('/topups/yookassa', validateCreateYooKassaTopUp, controller.createYooKassaTopUp);
router.get('/topups/:id', validateTopUpIdParams, controller.getTopUp);

export const paymentsRoutes = router;
