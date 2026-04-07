import type { Request, Response, NextFunction } from 'express';
import { getPublicAppSettings } from '../../lib/app-settings.js';
import { getProjectCommitActivity } from './project-activity.service.js';

export async function getSettings(_req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await getPublicAppSettings();
    res.json({ data: settings });
  } catch (err) {
    next(err);
  }
}

export async function getProjectActivity(_req: Request, res: Response, next: NextFunction) {
  try {
    const activity = await getProjectCommitActivity();
    res.json({ data: activity });
  } catch (err) {
    next(err);
  }
}
