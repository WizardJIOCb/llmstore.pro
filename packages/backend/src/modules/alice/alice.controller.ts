import type { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import * as authService from '../auth/auth.service.js';
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

function applyAliceOAuthEmbedHeaders(res: Response): void {
  // Yandex account-linking flow can open authorize pages in an embedded context.
  // Relax frame restrictions for this OAuth flow only.
  res.removeHeader('X-Frame-Options');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; frame-ancestors 'self' https://dialogs.yandex.ru https://social.yandex.net",
  );
}

function aliceTextResponse(text: string, tts?: string) {
  return {
    response: {
      text,
      tts: tts ?? text,
      end_session: false,
    },
    version: '1.0',
  };
}

function aliceStartAccountLinkingResponse() {
  return {
    start_account_linking: {},
    version: '1.0',
  };
}

function aliceUnauthorizedResponse(canLink: boolean) {
  if (canLink) {
    return aliceStartAccountLinkingResponse();
  }

  return aliceTextResponse(
    'Чтобы использовать навык, нужно привязать аккаунт llmstore. Откройте настройки навыка и выполните привязку.',
  );
}

const ALICE_PENDING_COMMAND_TTL_MS = 15 * 60 * 1000;
const pendingAliceCommands = new Map<string, { command: string; createdAt: number }>();

function extractAliceSkillUserId(payload: any): string | null {
  const sessionUserId = typeof payload?.session?.user_id === 'string' ? payload.session.user_id : null;
  const nestedUserId = typeof payload?.session?.user?.user_id === 'string' ? payload.session.user.user_id : null;
  return sessionUserId || nestedUserId || null;
}

function savePendingAliceCommand(skillUserId: string | null, command: string): void {
  const trimmed = command.trim();
  if (!skillUserId || !trimmed) return;

  const now = Date.now();
  for (const [key, value] of pendingAliceCommands.entries()) {
    if (now - value.createdAt > ALICE_PENDING_COMMAND_TTL_MS) {
      pendingAliceCommands.delete(key);
    }
  }

  pendingAliceCommands.set(skillUserId, { command: trimmed, createdAt: now });
}

function takePendingAliceCommand(skillUserId: string | null): string | null {
  if (!skillUserId) return null;
  const pending = pendingAliceCommands.get(skillUserId);
  if (!pending) return null;
  pendingAliceCommands.delete(skillUserId);

  if (Date.now() - pending.createdAt > ALICE_PENDING_COMMAND_TTL_MS) {
    return null;
  }

  return pending.command;
}

function buildAuthorizedAliceCommandResponse(command: string) {
  const trimmed = command.trim();
  const normalized = normalizeAliceCommand(trimmed);

  if (isAliceHelpCommand(normalized)) {
    return aliceTextResponse(aliceHelpText(true));
  }

  if (isAliceGreetingCommand(normalized)) {
    return aliceTextResponse(aliceGreetingText(true));
  }

  if (!trimmed) {
    return aliceTextResponse('Аккаунт llmstore подключен. Скажите, что сделать в чате.');
  }

  return aliceTextResponse(
    `Команда получена: ${trimmed}. Интеграция с выбранным чатом сейчас завершается.`,
  );
}

function supportsAccountLinking(payload: any): boolean {
  return Boolean(payload?.meta?.interfaces?.account_linking);
}

function extractAliceCommand(payload: any): string {
  const command = typeof payload?.request?.command === 'string' ? payload.request.command : '';
  const originalUtterance = typeof payload?.request?.original_utterance === 'string'
    ? payload.request.original_utterance
    : '';

  return (command || originalUtterance).trim();
}

function normalizeAliceCommand(command: string): string {
  return command
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isAliceHelpCommand(command: string): boolean {
  return command === 'помощь'
    || command === 'помоги'
    || command === 'что ты умеешь'
    || command === 'что умеешь'
    || command === 'help';
}

function isAliceGreetingCommand(command: string): boolean {
  return command === ''
    || command === 'привет'
    || command === 'здравствуй'
    || command === 'здравствуйте'
    || command === 'начать'
    || command === 'старт';
}

function isAliceAuthorizationCommand(command: string): boolean {
  return command === 'авторизоваться'
    || command === 'авторизация'
    || command === 'войти'
    || command === 'вход'
    || command === 'войти в аккаунт'
    || command === 'подключить аккаунт'
    || command === 'привязать аккаунт';
}

function aliceGreetingText(isAuthorized: boolean): string {
  if (!isAuthorized) {
    return 'Это навык LLM Store. Он помогает работать с аккаунтом llmstore.pro голосом. Чтобы начать, авторизуйтесь, а затем сможете продиктовать запрос для чата или сказать: помощь.';
  }

  return 'Это навык LLM Store. Я могу передать ваш голосовой запрос в llmstore.pro. Скажите помощь, чтобы узнать примеры, или сразу продиктуйте ваш запрос.';
}

function aliceHelpText(isAuthorized: boolean): string {
  if (!isAuthorized) {
    return 'Навык LLM Store работает с вашим аккаунтом llmstore.pro. Скажите авторизоваться, чтобы привязать аккаунт, а затем можно продиктовать запрос для чата. Например: объясни ошибку в коде или помоги составить письмо клиенту.';
  }

  return 'Навык LLM Store принимает ваш голосовой запрос и отправляет его в llmstore.pro. Можно сказать, например: объясни ошибку в коде, помоги составить письмо клиенту или подскажи план задачи.';
}

function hasAccountLinkingCompleteEvent(payload: any): boolean {
  return Boolean(payload?.account_linking_complete_event);
}

function extractAccessToken(req: Request, payload: any): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim() || null;
  }
  const tokenFromSession = payload?.session?.user?.access_token;
  return typeof tokenFromSession === 'string' && tokenFromSession.length > 0 ? tokenFromSession : null;
}

function parseBasicClientCredentials(req: Request): { clientId?: string; clientSecret?: string } {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) return {};
  try {
    const raw = Buffer.from(authHeader.slice('Basic '.length), 'base64').toString('utf-8');
    const separatorIndex = raw.indexOf(':');
    if (separatorIndex < 0) return {};
    return {
      clientId: raw.slice(0, separatorIndex),
      clientSecret: raw.slice(separatorIndex + 1),
    };
  } catch {
    return {};
  }
}

function resolveSafeNextUrl(next: string | undefined): string | null {
  if (!next) return null;

  try {
    const parsed = new URL(next);
    const allowedOrigins = new Set([env.BACKEND_URL, env.FRONTEND_URL].map((value) => new URL(value).origin));
    if (!allowedOrigins.has(parsed.origin)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
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

function renderLoginRequiredPage(loginUrl: string): string {
  const safeLoginUrl = escapeHtml(loginUrl);
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Вход в LLM Store</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #f4f6f8; color: #111827; }
    .wrap { max-width: 560px; margin: 64px auto; background: #fff; border-radius: 16px; padding: 28px; box-shadow: 0 12px 30px rgba(0,0,0,.08); }
    h1 { margin: 0 0 12px; font-size: 22px; }
    p { margin: 0 0 18px; line-height: 1.5; color: #374151; }
    a { display: inline-block; text-decoration: none; background: #111827; color: #fff; border-radius: 10px; padding: 10px 16px; font-size: 15px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Нужен вход в LLM Store</h1>
    <p>Чтобы продолжить привязку аккаунта Алисы, сначала войдите в llmstore.pro. После входа вы вернетесь к подтверждению доступа.</p>
    <a href="${safeLoginUrl}">Войти в llmstore.pro</a>
  </div>
</body>
</html>`;
}

function renderAliceLoginPage(nextUrl: string, error?: string): string {
  const safeNextUrl = escapeHtml(nextUrl);
  const errorBlock = error
    ? `<div class="error">${escapeHtml(error)}</div>`
    : '';

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Вход в LLM Store</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #f4f6f8; color: #111827; }
    .wrap { max-width: 560px; margin: 64px auto; background: #fff; border-radius: 16px; padding: 28px; box-shadow: 0 12px 30px rgba(0,0,0,.08); }
    h1 { margin: 0 0 12px; font-size: 22px; }
    p { margin: 0 0 18px; line-height: 1.5; color: #374151; }
    label { display: block; margin-bottom: 6px; font-size: 14px; font-weight: 600; }
    input { width: 100%; border: 1px solid #d1d5db; border-radius: 10px; padding: 12px 14px; font-size: 15px; box-sizing: border-box; }
    .field { margin-bottom: 14px; }
    .actions { display: flex; gap: 10px; margin-top: 18px; }
    button { border: 0; border-radius: 10px; padding: 10px 16px; font-size: 15px; cursor: pointer; background: #111827; color: #fff; }
    .hint { margin-top: 14px; font-size: 13px; color: #6b7280; }
    .error { margin-bottom: 14px; border-radius: 10px; background: #fef2f2; color: #b91c1c; padding: 12px 14px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Войдите в LLM Store</h1>
    <p>Чтобы завершить привязку аккаунта Алисы, войдите в ваш аккаунт LLM Store.</p>
    ${errorBlock}
    <form method="post" action="/api/integrations/alice/oauth/login">
      <input type="hidden" name="next" value="${safeNextUrl}" />
      <div class="field">
        <label for="email">Email</label>
        <input id="email" type="email" name="email" autocomplete="username" required />
      </div>
      <div class="field">
        <label for="password">Пароль</label>
        <input id="password" type="password" name="password" autocomplete="current-password" required />
      </div>
      <div class="actions">
        <button type="submit">Войти</button>
      </div>
      <p class="hint">После входа вы вернётесь к подтверждению доступа для навыка Алисы.</p>
    </form>
  </div>
</body>
</html>`;
}

export async function oauthAuthorize(req: Request, res: Response, next: NextFunction) {
  try {
    applyAliceOAuthEmbedHeaders(res);

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
      logger.info({ nextUrl }, 'alice oauth authorize: inline login page');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(renderAliceLoginPage(nextUrl));
      return;
    }

    logger.info({ userId: req.session.userId }, 'alice oauth authorize: consent page');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(renderConsentPage(request));
  } catch (err) {
    if (err instanceof AliceOAuthError) {
      const redirectUri = toStringOrUndefined(req.query.redirect_uri);
      const state = toStringOrUndefined(req.query.state);
      if (redirectUri && oauthService.isAllowedRedirectUri(redirectUri)) {
        res.redirect(oauthService.createAuthorizeErrorRedirect(redirectUri, err.code, state));
        return;
      }
      oauthJsonError(res, err);
      return;
    }
    next(err);
  }
}

export async function oauthLoginPage(req: Request, res: Response, next: NextFunction) {
  try {
    applyAliceOAuthEmbedHeaders(res);

    const nextUrl = resolveSafeNextUrl(toStringOrUndefined(req.query.next)) ?? `${env.BACKEND_URL}/api/integrations/alice/oauth/authorize`;
    if (req.session.userId) {
      res.redirect(nextUrl);
      return;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(renderAliceLoginPage(nextUrl));
  } catch (err) {
    next(err);
  }
}

export async function oauthLoginSubmit(req: Request, res: Response, next: NextFunction) {
  try {
    applyAliceOAuthEmbedHeaders(res);

    const nextUrl = resolveSafeNextUrl(toStringOrUndefined(req.body.next)) ?? `${env.BACKEND_URL}/api/integrations/alice/oauth/authorize`;

    const user = await authService.login({
      email: toStringOrUndefined(req.body.email) ?? '',
      password: toStringOrUndefined(req.body.password) ?? '',
    });

    req.session.userId = user.id;
    req.session.userRole = user.role;
    res.redirect(nextUrl);
  } catch (err) {
    if (err instanceof Error) {
      const nextUrl = resolveSafeNextUrl(toStringOrUndefined(req.body.next)) ?? `${env.BACKEND_URL}/api/integrations/alice/oauth/authorize`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(401).send(renderAliceLoginPage(nextUrl, err.message || 'Ошибка входа'));
      return;
    }
    next(err);
  }
}

export async function oauthAuthorizeDecision(req: Request, res: Response, next: NextFunction) {
  try {
    applyAliceOAuthEmbedHeaders(res);

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
      if (redirectUri && oauthService.isAllowedRedirectUri(redirectUri)) {
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
    const basicCreds = parseBasicClientCredentials(req);
    const clientId = toStringOrUndefined(req.body.client_id) ?? basicCreds.clientId;
    const clientSecret = toStringOrUndefined(req.body.client_secret) ?? basicCreds.clientSecret;
    oauthService.validateClientCredentials(clientId, clientSecret);

    if (grantType === 'authorization_code') {
      const code = toStringOrUndefined(req.body.code);
      const redirectUri = toStringOrUndefined(req.body.redirect_uri);
      if (!code || !redirectUri) throw new AliceOAuthError('invalid_request', 'code and redirect_uri are required');
      if (!oauthService.isAllowedRedirectUri(redirectUri)) {
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
    const basicCreds = parseBasicClientCredentials(req);
    const clientId = toStringOrUndefined(req.body.client_id) ?? basicCreds.clientId;
    const clientSecret = toStringOrUndefined(req.body.client_secret) ?? basicCreds.clientSecret;
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

export async function webhook(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = req.body ?? {};
    const token = extractAccessToken(req, payload);
    const canLink = supportsAccountLinking(payload);
    const linkingCompleted = hasAccountLinkingCompleteEvent(payload);
    const rawCommand = extractAliceCommand(payload);
    const skillUserId = extractAliceSkillUserId(payload);
    const normalizedCommand = normalizeAliceCommand(rawCommand);

    if (linkingCompleted) {
      if (!token) {
        if (canLink) {
          res.status(200).json(
            aliceTextResponse('Не удалось завершить авторизацию. Скажите авторизоваться и попробуйте войти ещё раз.'),
          );
          return;
        }

        res.status(200).json(
          aliceTextResponse('Не удалось завершить авторизацию. Пожалуйста, заново привяжите аккаунт LLM Store.'),
        );
        return;
      }

      const linkedUserId = await oauthService.resolveUserByAccessToken(token);
      if (!linkedUserId) {
        if (canLink) {
          res.status(200).json(
            aliceTextResponse('Срок действия авторизации истёк. Скажите авторизоваться и войдите ещё раз.'),
          );
          return;
        }

        res.status(200).json(
          aliceTextResponse('Срок действия авторизации истёк. Пожалуйста, заново привяжите аккаунт LLM Store.'),
        );
        return;
      }

      const pendingCommand = takePendingAliceCommand(skillUserId);
      if (pendingCommand) {
        res.status(200).json(buildAuthorizedAliceCommandResponse(pendingCommand));
        return;
      }

      res.status(200).json(
        aliceTextResponse('Вы успешно авторизовались в LLM Store. Теперь можно продолжать работу с навыком.'),
      );
      return;
    }

    if (!token) {
      savePendingAliceCommand(skillUserId, rawCommand);
      res.status(200).json(aliceUnauthorizedResponse(canLink));
      return;

      if (canLink) {
        res.status(200).json(aliceStartAccountLinkingResponse());
        return;
      }
      res.status(200).json(
        aliceTextResponse(
          'Чтобы использовать навык, нужно привязать аккаунт llmstore. Откройте настройки навыка и выполните привязку.',
        ),
      );
      return;
    }

    const userId = await oauthService.resolveUserByAccessToken(token);
    if (!userId) {
      savePendingAliceCommand(skillUserId, rawCommand);
      res.status(200).json(aliceUnauthorizedResponse(canLink));
      return;

      if (canLink) {
        res.status(200).json(
          aliceTextResponse('Сессия истекла. Скажите авторизоваться и войдите в LLM Store ещё раз.'),
        );
        return;
      }
      res.status(200).json(
        aliceTextResponse('Сессия истекла. Пожалуйста, заново привяжите аккаунт llmstore.'),
      );
      return;
    }

    if (isAliceHelpCommand(normalizedCommand)) {
      res.status(200).json(aliceTextResponse(aliceHelpText(true)));
      return;
    }

    if (isAliceGreetingCommand(normalizedCommand)) {
      res.status(200).json(aliceTextResponse(aliceGreetingText(true)));
      return;
    }

    const command = typeof payload?.request?.command === 'string'
      ? payload.request.command.trim()
      : '';

    if (!command) {
      res.status(200).json(
        aliceTextResponse(
          'Аккаунт llmstore подключен. Скажите, что сделать в чате.',
        ),
      );
      return;
    }

    res.status(200).json(
      aliceTextResponse(
        `Команда получена: ${command}. Интеграция с выбранным чатом сейчас завершается.`,
      ),
    );
  } catch (err) {
    next(err);
  }
}
