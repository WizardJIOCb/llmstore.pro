import type { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service.js';
import { normalizeIpAddress } from './signup-bonus.service.js';
import { verifyTurnstileToken } from './turnstile.service.js';

function getSessionSameSite() {
  return process.env.NODE_ENV === 'production' ? 'none' : 'lax';
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const requestIp = normalizeIpAddress(req.ip);
    await verifyTurnstileToken(req.body.turnstile_token, requestIp);
    const user = await authService.register({
      ...req.body,
      signup_ip: requestIp,
      signup_user_agent: req.get('user-agent') ?? null,
    });
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
        sameSite: getSessionSameSite(),
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
    // Keep session role in sync with DB (e.g. after admin promotion via CLI)
    if (user.role !== req.session.userRole) {
      req.session.userRole = user.role;
    }
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
}
