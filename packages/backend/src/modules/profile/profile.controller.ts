import type { Request, Response, NextFunction } from 'express';
import * as profileService from './profile.service.js';
import type { ProfileLeaderboardSort } from '@llmstore/shared';

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await profileService.getProfile(req.session.userId!);
    res.json({ data: profile });
  } catch (err) {
    next(err);
  }
}

export async function getPublicProfile(req: Request<{ username: string }>, res: Response, next: NextFunction) {
  try {
    const profile = await profileService.getPublicProfileByUsername(req.params.username);
    res.json({ data: profile });
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await profileService.updateProfile(req.session.userId!, req.body);
    res.json({ data: profile });
  } catch (err) {
    next(err);
  }
}

export async function getProfileLeaderboard(req: Request, res: Response, next: NextFunction) {
  try {
    const sort = String(req.query.sort ?? 'tokens') as ProfileLeaderboardSort;
    const limit = Number(req.query.limit ?? 50);
    const leaderboard = await profileService.getProfileLeaderboard(req.session.userId!, sort, limit);
    res.json({ data: leaderboard });
  } catch (err) {
    next(err);
  }
}

export async function unlinkAccount(req: Request<{ provider: string }>, res: Response, next: NextFunction) {
  try {
    await profileService.unlinkAccount(req.session.userId!, req.params.provider);
    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
}
