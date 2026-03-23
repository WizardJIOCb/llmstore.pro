import type { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service.js';

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authService.register(req.body);
    req.session.userId = user.id;
    req.session.userRole = user.role;
    res.status(201).json({ data: user });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authService.login(req.body);
    req.session.userId = user.id;
    req.session.userRole = user.role;
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('llmstore_session', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
      res.json({ data: { success: true } });
    });
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authService.getById(req.session.userId!);
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
}
