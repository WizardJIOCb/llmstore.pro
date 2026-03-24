import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as oauthService from './oauth.service.js';
import { env } from '../../config/env.js';

type ProviderParams = { provider: string };

export async function startOAuth(req: Request<ProviderParams>, res: Response, next: NextFunction) {
  try {
    const provider = req.params.provider;
    oauthService.validateProvider(provider);

    const state = uuidv4();
    req.session.oauthState = state;
    req.session.oauthMode = (req.query.mode as 'login' | 'link') || 'login';

    // VK requires PKCE
    let codeChallenge: string | undefined;
    if (provider === 'vk') {
      const pkce = oauthService.generatePkce();
      req.session.oauthCodeVerifier = pkce.codeVerifier;
      codeChallenge = pkce.codeChallenge;
    }

    const url = oauthService.getOAuthUrl(provider, state, codeChallenge);
    res.redirect(url);
  } catch (err) {
    next(err);
  }
}

export async function handleCallback(req: Request<ProviderParams>, res: Response, next: NextFunction) {
  try {
    const provider = req.params.provider;
    const { code, state, error, device_id } = req.query;

    if (error) {
      res.redirect(`${env.FRONTEND_URL}/profile?oauth=error&message=${encodeURIComponent(String(error))}`);
      return;
    }

    // CSRF check
    if (!state || state !== req.session.oauthState) {
      res.redirect(`${env.FRONTEND_URL}/profile?oauth=error&message=${encodeURIComponent('Неверный state параметр')}`);
      return;
    }

    const mode = req.session.oauthMode || 'login';
    const sessionUserId = mode === 'link' ? req.session.userId : undefined;
    const codeVerifier = req.session.oauthCodeVerifier;

    // Clean up session oauth fields
    delete req.session.oauthState;
    delete req.session.oauthMode;
    delete req.session.oauthCodeVerifier;

    const user = await oauthService.handleCallback({
      provider,
      code: String(code),
      sessionUserId,
      codeVerifier,
      deviceId: device_id ? String(device_id) : undefined,
      state: String(state),
    });

    // Set session for the user
    req.session.userId = user.id;
    req.session.userRole = user.role;

    // Save session before redirect
    req.session.save((err) => {
      if (err) {
        res.redirect(`${env.FRONTEND_URL}/profile?oauth=error&message=${encodeURIComponent('Ошибка сессии')}`);
        return;
      }
      const redirectPath = mode === 'link' ? '/profile' : '/';
      res.redirect(`${env.FRONTEND_URL}${redirectPath}?oauth=success&provider=${provider}`);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
    res.redirect(`${env.FRONTEND_URL}/profile?oauth=error&message=${encodeURIComponent(message)}`);
  }
}
