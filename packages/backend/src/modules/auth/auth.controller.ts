import type { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service.js';
import {
  sendEmailVerificationEmail,
  verifyEmailToken,
} from './email-verification.service.js';
import * as oauthService from './oauth.service.js';
import { normalizeIpAddress } from './signup-bonus.service.js';
import { verifyTurnstileToken } from './turnstile.service.js';
import { AppError } from '../../middleware/error-handler.js';
import type { UserPublic } from '@llmstore/shared';

function getSessionSameSite() {
  return process.env.NODE_ENV === 'production' ? 'none' : 'lax';
}

function clearImpersonationSession(req: Request) {
  delete req.session.impersonatorUserId;
  delete req.session.impersonatorUserRole;
}

function withImpersonationInfo(req: Request, user: UserPublic): UserPublic {
  if (!req.session.impersonatorUserId) return user;

  return {
    ...user,
    impersonation: {
      is_impersonating: true,
      impersonator_user_id: req.session.impersonatorUserId,
      impersonator_role: (req.session.impersonatorUserRole as UserPublic['role'] | undefined) ?? null,
    },
  };
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
    req.session.userId = user.user.id;
    req.session.userRole = user.user.role;
    clearImpersonationSession(req);
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
    clearImpersonationSession(req);
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
}

export async function exchangeMobileOAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token) {
      throw new AppError(400, 'INVALID_MOBILE_OAUTH_TOKEN', 'Не передан mobile OAuth токен');
    }

    const payload = oauthService.verifyMobileAuthToken(token);
    const user = await authService.getById(payload.userId);
    req.session.userId = user.id;
    req.session.userRole = user.role;
    clearImpersonationSession(req);
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
    res.json({ data: withImpersonationInfo(req, user) });
  } catch (err) {
    next(err);
  }
}

export async function stopImpersonation(req: Request, res: Response, next: NextFunction) {
  try {
    const impersonatorUserId = req.session.impersonatorUserId;
    const impersonatorUserRole = req.session.impersonatorUserRole;

    if (!impersonatorUserId || !impersonatorUserRole) {
      throw new AppError(400, 'BAD_REQUEST', 'Сейчас нет активной авторизации за другого пользователя');
    }

    req.session.userId = impersonatorUserId;
    req.session.userRole = impersonatorUserRole;
    clearImpersonationSession(req);

    const user = await authService.getById(impersonatorUserId);
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
}

export async function resendEmailVerification(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await sendEmailVerificationEmail(req.session.userId!);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function confirmEmailVerification(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await verifyEmailToken({
      token: req.body.token,
      ipAddress: normalizeIpAddress(req.ip),
      userAgent: req.get('user-agent') ?? null,
      deviceFingerprint: req.body.device_fingerprint,
    });

    req.session.userId = result.user.id;
    req.session.userRole = result.user.role;
    clearImpersonationSession(req);

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}
