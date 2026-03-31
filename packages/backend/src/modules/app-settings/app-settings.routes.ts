import { Router } from 'express';
import * as controller from './app-settings.controller.js';

const router = Router();

router.get('/settings', controller.getSettings);

export const appSettingsRoutes = router;
