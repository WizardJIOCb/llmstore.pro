import type { Request, Response, NextFunction } from 'express';
import { getPublicAppSettings } from '../../lib/app-settings.js';

export async function getSettings(_req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await getPublicAppSettings();
    res.json({ data: settings });
  } catch (err) {
    next(err);
  }
}
