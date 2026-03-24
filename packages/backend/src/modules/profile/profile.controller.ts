import type { Request, Response, NextFunction } from 'express';
import * as profileService from './profile.service.js';

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await profileService.getProfile(req.session.userId!);
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

export async function unlinkAccount(req: Request<{ provider: string }>, res: Response, next: NextFunction) {
  try {
    await profileService.unlinkAccount(req.session.userId!, req.params.provider);
    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
}
