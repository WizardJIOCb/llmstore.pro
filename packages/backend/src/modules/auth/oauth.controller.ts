import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as oauthService from './oauth.service.js';
import { env } from '../../config/env.js';
import { normalizeIpAddress } from './signup-bonus.service.js';

type ProviderParams = { provider: string };

const ALLOWED_MOBILE_REDIRECT_PROTOCOLS = new Set(['llmstore-mobile:']);

function resolveSafeFrontendNextPath(next: unknown): string | null {
  if (typeof next !== 'string' || next.trim().length === 0) return null;

  try {
    const frontendUrl = new URL(env.FRONTEND_URL);
    const nextUrl = new URL(next, frontendUrl);
    if (nextUrl.origin !== frontendUrl.origin) return null;
    return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
  } catch {
    return null;
  }
}

function resolveSafeMobileRedirectUri(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;

  try {
    const url = new URL(value);
    if (!ALLOWED_MOBILE_REDIRECT_PROTOCOLS.has(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function appendQueryParams(path: string, params: Record<string, string>): string {
  const url = new URL(path, env.FRONTEND_URL);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return `${url.pathname}${url.search}${url.hash}`;
}

function appendQueryParamsToUrl(targetUrl: string, params: Record<string, string>): string {
  const url = new URL(targetUrl);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

function redirectWithParams(
  res: Response,
  params: Record<string, string>,
  options?: {
    nextPath?: string | null;
    mobileRedirectUri?: string | null;
    defaultPath?: string;
  },
) {
  const nextPath = options?.nextPath ?? null;
  const mobileRedirectUri = options?.mobileRedirectUri ?? null;
  const defaultPath = options?.defaultPath ?? '/login';

  const target = mobileRedirectUri
    ? appendQueryParamsToUrl(mobileRedirectUri, params)
    : `${env.FRONTEND_URL}${appendQueryParams(nextPath ?? defaultPath, params)}`;

  res.redirect(target);
}

export async function startOAuth(req: Request<ProviderParams>, res: Response, next: NextFunction) {
  try {
    const provider = req.params.provider;
    oauthService.validateProvider(provider);

    const state = uuidv4();
    req.session.oauthState = state;
    req.session.oauthMode = (req.query.mode as 'login' | 'link') || 'login';
    req.session.oauthDeviceFingerprint = typeof req.query.device_fingerprint === 'string'
      ? req.query.device_fingerprint
      : undefined;
    req.session.oauthNextPath = resolveSafeFrontendNextPath(req.query.next) ?? undefined;
    req.session.oauthMobileRedirectUri = resolveSafeMobileRedirectUri(req.query.redirect_uri) ?? undefined;

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

export async function handleCallback(req: Request<ProviderParams>, res: Response) {
  try {
    const provider = req.params.provider;
    const { code, state, error, device_id } = req.query;
    const nextPath = req.session.oauthNextPath;
    const mobileRedirectUri = req.session.oauthMobileRedirectUri;

    console.log(`[OAuth] callback ${provider}: code=${code ? 'present' : 'missing'}, state=${state ? 'present' : 'missing'}, device_id=${device_id || 'none'}, error=${error || 'none'}`);
    console.log(`[OAuth] session state: ${req.session.oauthState || 'missing'}, mode: ${req.session.oauthMode || 'missing'}, codeVerifier: ${req.session.oauthCodeVerifier ? 'present' : 'missing'}`);

    if (error) {
      console.log(`[OAuth] provider returned error: ${error}`);
      redirectWithParams(res, {
        oauth: 'error',
        message: String(error),
      }, { nextPath, mobileRedirectUri });
      return;
    }

    if (!state || state !== req.session.oauthState) {
      console.log(`[OAuth] state mismatch: got ${state}, expected ${req.session.oauthState}`);
      redirectWithParams(res, {
        oauth: 'error',
        message: 'Неверный state параметр. Попробуйте ещё раз.',
      }, { nextPath, mobileRedirectUri });
      return;
    }

    const mode = req.session.oauthMode || 'login';
    const sessionUserId = mode === 'link' ? req.session.userId : undefined;
    const codeVerifier = req.session.oauthCodeVerifier;
    const deviceFingerprint = req.session.oauthDeviceFingerprint;

    delete req.session.oauthState;
    delete req.session.oauthMode;
    delete req.session.oauthCodeVerifier;
    delete req.session.oauthDeviceFingerprint;
    delete req.session.oauthNextPath;
    delete req.session.oauthMobileRedirectUri;

    const user = await oauthService.handleCallback({
      provider,
      code: String(code),
      sessionUserId,
      codeVerifier,
      deviceId: device_id ? String(device_id) : undefined,
      state: String(state),
      signupIp: normalizeIpAddress(req.ip),
      signupUserAgent: req.get('user-agent') ?? null,
      deviceFingerprint,
    });

    console.log(`[OAuth] success: user ${user.email} (${user.id}), mode=${mode}`);

    req.session.userId = user.id;
    req.session.userRole = user.role;

    req.session.save((err) => {
      if (err) {
        console.error('[OAuth] session save error:', err);
        redirectWithParams(res, {
          oauth: 'error',
          message: 'Ошибка сессии',
        }, { nextPath, mobileRedirectUri });
        return;
      }

      if (mobileRedirectUri) {
        redirectWithParams(res, {
          oauth: 'success',
          provider,
          token: oauthService.createMobileAuthToken({
            userId: user.id,
            provider,
            mode,
          }),
        }, { mobileRedirectUri });
        return;
      }

      const redirectPath = mode === 'link' ? '/profile' : (nextPath ?? '/');
      redirectWithParams(res, {
        oauth: 'success',
        provider,
      }, { nextPath: redirectPath });
    });
  } catch (err) {
    console.error('[OAuth] callback error:', err);
    const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
    const nextPath = req.session.oauthNextPath;
    const mobileRedirectUri = req.session.oauthMobileRedirectUri;
    delete req.session.oauthMobileRedirectUri;
    redirectWithParams(res, {
      oauth: 'error',
      message,
    }, { nextPath, mobileRedirectUri });
  }
}
