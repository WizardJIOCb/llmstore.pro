import type { Request, Response, NextFunction } from 'express';
import * as telegramService from './telegram.service.js';
import { logger } from '../../lib/logger.js';

export async function webhook(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json({ ok: true });
    void telegramService.handleTelegramWebhookUpdate(req.body ?? {}).catch((err) => {
      logger.error({ err }, 'telegram webhook async handling failed');
    });
  } catch (err) {
    next(err);
  }
}
