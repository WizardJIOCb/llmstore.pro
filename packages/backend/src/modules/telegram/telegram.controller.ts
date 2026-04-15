import type { Request, Response, NextFunction } from 'express';
import * as telegramService from './telegram.service.js';

export async function webhook(req: Request, res: Response, next: NextFunction) {
  try {
    await telegramService.handleTelegramWebhookUpdate(req.body ?? {});
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
}
