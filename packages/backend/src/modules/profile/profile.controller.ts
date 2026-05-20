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

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await profileService.changePassword(req.session.userId!, req.body);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function upsertOpenRouterKey(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await profileService.upsertOpenRouterKey(req.session.userId!, req.body);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function deleteOpenRouterKey(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await profileService.deleteOpenRouterKey(req.session.userId!);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function getProfileLeaderboard(req: Request, res: Response, next: NextFunction) {
  try {
    const sort = String(req.query.sort ?? 'tokens') as ProfileLeaderboardSort;
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 50);
    const leaderboard = await profileService.getProfileLeaderboard(req.session.userId!, sort, page, limit);
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

export async function createAliceLinkCode(req: Request, res: Response, next: NextFunction) {
  try {
    const linkCode = await profileService.createAliceLinkCode(req.session.userId!);
    res.json({ data: linkCode });
  } catch (err) {
    next(err);
  }
}

export async function createTelegramLinkCode(req: Request, res: Response, next: NextFunction) {
  try {
    const linkCode = await profileService.createTelegramLinkCode(req.session.userId!);
    res.json({ data: linkCode });
  } catch (err) {
    next(err);
  }
}
