import { Router } from 'express';
import * as controller from './telegram.controller.js';

const router = Router();

router.post('/webhook', controller.webhook);

export const telegramRoutes = router;
