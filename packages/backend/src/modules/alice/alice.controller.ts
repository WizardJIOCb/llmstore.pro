import type { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import * as oauthService from './alice.oauth.service.js';
import type { AliceAuthorizeRequest } from './alice.types.js';
import { AliceOAuthError } from './alice.types.js';

function toStringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function oauthJsonError(res: Response, err: AliceOAuthError): void {
  const payload: Record<string, string> = { error: err.code };
  if (env.NODE_ENV !== 'production') payload.error_description = err.message;
  res.status(err.statusCode).json(payload);
}

function renderConsentPage(request: AliceAuthorizeRequest): string {
  const stateInput = request.state ? `<input type="hidden" name="state" value="${escapeHtml(request.state)}" />` : '';
  const scopeInput = request.scope ? `<input type="hidden" name="scope" value="${escapeHtml(request.scope)}" />` : '';

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Подключение Алисы к LLM Store</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #f4f6f8; color: #111827; }
    .wrap { max-width: 560px; margin: 64px auto; background: #fff; border-radius: 16px; padding: 28px; box-shadow: 0 12px 30px rgba(0,0,0,.08); }
    h1 { margin: 0 0 12px; font-size: 22px; }
    p { margin: 0 0 18px; line-height: 1.5; color: #374151; }
    .actions { display: flex; gap: 10px; margin-top: 22px; }
    button { border: 0; border-radius: 10px; padding: 10px 16px; font-size: 15px; cursor: pointer; }
    .allow { background: #111827; color: #fff; }
    .deny { background: #e5e7eb; color: #111827; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Подключить навык Алисы</h1>
    <p>Навык Алисы запрашивает доступ к вашему аккаунту llmstore.pro, чтобы отправлять голосовые запросы в ваши чаты и получать озвучиваемые ответы.</p>
    <form method="post" action="/api/integrations/alice/oauth/authorize/decision">
      <input type="hidden" name="response_type" value="code" />
      <input type="hidden" name="client_id" value="${escapeHtml(request.client_id)}" />
      <input type="hidden" name="redirect_uri" value="${escapeHtml(request.redirect_uri)}" />
      ${stateInput}
      ${scopeInput}
      <div class="actions">
        <button class="allow" type="submit" name="decision" value="allow">Разрешить</button>
        <button class="deny" type="submit" name="decision" value="deny">Отмена</button>
      </div>
    </form>
  </div>
</body>
</html>`;
}

export async function oauthAuthorize(req: Request, res: Response, next: NextFunction) {
  try {
    const request = oauthService.validateAuthorizeRequest({
      response_type: toStringOrUndefined(req.query.response_type) as 'code' | undefined,
      client_id: toStringOrUndefined(req.query.client_id),
      redirect_uri: toStringOrUndefined(req.query.redirect_uri),
      state: toStringOrUndefined(req.query.state),
      scope: toStringOrUndefined(req.query.scope),
    });

    req.session.aliceAuthorizeRequest = request;

    if (!req.session.userId) {
      const nextPath = `/api/integrations/alice/oauth/authorize?${new URLSearchParams({
        response_type: request.response_type,
        client_id: request.client_id,
        redirect_uri: request.redirect_uri,
        ...(request.state ? { state: request.state } : {}),
        ...(request.scope ? { scope: request.scope } : {}),
      }).toString()}`;
      const nextUrl = `${env.BACKEND_URL}${nextPath}`;

      res.redirect(`${env.FRONTEND_URL}/login?next=${encodeURIComponent(nextUrl)}`);
      return;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(renderConsentPage(request));
  } catch (err) {
    if (err instanceof AliceOAuthError) {
      const redirectUri = toStringOrUndefined(req.query.redirect_uri);
      const state = toStringOrUndefined(req.query.state);
      if (redirectUri === env.ALICE_ALLOWED_REDIRECT_URI) {
        res.redirect(oauthService.createAuthorizeErrorRedirect(redirectUri, err.code, state));
        return;
      }
      oauthJsonError(res, err);
      return;
    }
    next(err);
  }
}

export async function oauthAuthorizeDecision(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.session.userId) {
      res.redirect(`${env.FRONTEND_URL}/login`);
      return;
    }

    const bodyRequest = oauthService.validateAuthorizeRequest({
      response_type: toStringOrUndefined(req.body.response_type) as 'code' | undefined,
      client_id: toStringOrUndefined(req.body.client_id),
      redirect_uri: toStringOrUndefined(req.body.redirect_uri),
      state: toStringOrUndefined(req.body.state),
      scope: toStringOrUndefined(req.body.scope),
    });

    const request = req.session.aliceAuthorizeRequest ?? bodyRequest;
    const decision = toStringOrUndefined(req.body.decision);
    delete req.session.aliceAuthorizeRequest;

    if (decision !== 'allow') {
      res.redirect(oauthService.createAuthorizeErrorRedirect(request.redirect_uri, 'access_denied', request.state));
      return;
    }

    const code = await oauthService.issueAuthorizationCode(req.session.userId, request);
    res.redirect(oauthService.createAuthorizeSuccessRedirect(request.redirect_uri, code, request.state));
  } catch (err) {
    if (err instanceof AliceOAuthError) {
      const redirectUri = toStringOrUndefined(req.body.redirect_uri);
      const state = toStringOrUndefined(req.body.state);
      if (redirectUri === env.ALICE_ALLOWED_REDIRECT_URI) {
        res.redirect(oauthService.createAuthorizeErrorRedirect(redirectUri, err.code, state));
        return;
      }
      oauthJsonError(res, err);
      return;
    }
    next(err);
  }
}

export async function oauthToken(req: Request, res: Response, next: NextFunction) {
  try {
    const grantType = toStringOrUndefined(req.body.grant_type);
    const clientId = toStringOrUndefined(req.body.client_id);
    const clientSecret = toStringOrUndefined(req.body.client_secret);
    oauthService.validateClientCredentials(clientId, clientSecret);

    if (grantType === 'authorization_code') {
      const code = toStringOrUndefined(req.body.code);
      const redirectUri = toStringOrUndefined(req.body.redirect_uri);
      if (!code || !redirectUri) throw new AliceOAuthError('invalid_request', 'code and redirect_uri are required');
      if (redirectUri !== env.ALICE_ALLOWED_REDIRECT_URI) {
        throw new AliceOAuthError('invalid_request', 'Invalid redirect_uri');
      }

      const token = await oauthService.exchangeAuthorizationCode(code, clientId!, redirectUri);
      res.json(token);
      return;
    }

    if (grantType === 'refresh_token') {
      const refreshToken = toStringOrUndefined(req.body.refresh_token);
      if (!refreshToken) throw new AliceOAuthError('invalid_request', 'refresh_token is required');
      const token = await oauthService.refreshAccessToken(refreshToken, clientId!);
      res.json(token);
      return;
    }

    throw new AliceOAuthError('unsupported_grant_type', 'Unsupported grant_type');
  } catch (err) {
    if (err instanceof AliceOAuthError) {
      logger.warn({ err: { code: err.code, message: err.message } }, 'alice oauth token error');
      oauthJsonError(res, err);
      return;
    }
    next(err);
  }
}

export async function oauthRevoke(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = toStringOrUndefined(req.body.client_id);
    const clientSecret = toStringOrUndefined(req.body.client_secret);
    const token = toStringOrUndefined(req.body.token);

    oauthService.validateClientCredentials(clientId, clientSecret);
    if (!token) throw new AliceOAuthError('invalid_request', 'token is required');

    await oauthService.revokeTokenByValue(token, clientId!);
    res.status(200).json({ success: true });
  } catch (err) {
    if (err instanceof AliceOAuthError) {
      oauthJsonError(res, err);
      return;
    }
    next(err);
  }
}
