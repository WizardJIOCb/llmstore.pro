import type { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger.js';
import { markUserActive } from '../modules/auth/login-activity.service.js';

const USER_ACTIVITY_MIN_INTERVAL_MS = 5 * 60 * 1000;

function shouldTrackUserActivity(req: Request): boolean {
  if (!req.session?.userId) return false;
  if (req.method === 'OPTIONS' || req.method === 'HEAD') return false;
  if (req.path === '/health') return false;
  return true;
}

function shouldSkipTrackedUpdate(lastTrackedAt: string | undefined, now: Date): boolean {
  if (!lastTrackedAt) return false;

  const lastTrackedDate = new Date(lastTrackedAt);
  if (Number.isNaN(lastTrackedDate.getTime())) return false;

  const sameUtcDay = lastTrackedDate.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
  if (!sameUtcDay) return false;

  return now.getTime() - lastTrackedDate.getTime() < USER_ACTIVITY_MIN_INTERVAL_MS;
}

export function trackUserActivity(req: Request, _res: Response, next: NextFunction) {
  if (!shouldTrackUserActivity(req)) {
    next();
    return;
  }

  const userId = req.session.userId;
  if (!userId) {
    next();
    return;
  }
  const now = new Date();
  if (shouldSkipTrackedUpdate(req.session.lastActivityTrackedAt, now)) {
    next();
    return;
  }

  req.session.lastActivityTrackedAt = now.toISOString();

  void markUserActive(userId, now).catch((error) => {
    logger.warn(
      { err: error, userId, path: req.originalUrl },
      'failed to track user activity',
    );
  });

  next();
}
