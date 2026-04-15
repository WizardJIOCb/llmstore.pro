import type { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import * as authService from '../auth/auth.service.js';
import * as aliceChatService from './alice.chat.service.js';
import * as aliceLoggingService from './alice.logging.service.js';
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

function buildUnauthorizedAliceText(command: string): string {
  const normalized = normalizeAliceCommand(command);

  if (isAliceHelpCommand(normalized)) {
    return `${aliceHelpText(false)} Чтобы начать, авторизуйтесь.`;
  }

  if (isAliceGreetingCommand(normalized)) {
    return `${aliceGreetingText(false)} Чтобы начать, авторизуйтесь.`;
  }

  if (isAliceAuthorizationCommand(normalized)) {
    return 'Чтобы начать работу с навыком LLM Store, авторизуйтесь и привяжите аккаунт llmstore.pro.';
  }

  if (command.trim()) {
    return `Я понял запрос: ${command.trim()}. Чтобы выполнить его через ваш аккаунт llmstore.pro, авторизуйтесь. После этого можно будет продолжить без повторения запроса.`;
  }

  return 'Навык LLM Store работает с вашим аккаунтом llmstore.pro. Чтобы начать, авторизуйтесь.';
}

function aliceUnauthorizedResponse(canLink: boolean, command: string) {
  if (canLink) {
    return aliceStartAccountLinkingResponse();
  }

  return aliceTextResponse(buildUnauthorizedAliceText(command));
}

const ALICE_PENDING_COMMAND_TTL_MS = 15 * 60 * 1000;
const pendingAliceCommands = new Map<string, { command: string; createdAt: number }>();

function extractAliceSkillUserId(payload: any): string | null {
  const sessionUserId = typeof payload?.session?.user_id === 'string' ? payload.session.user_id : null;
  const nestedUserId = typeof payload?.session?.user?.user_id === 'string' ? payload.session.user.user_id : null;
  return sessionUserId || nestedUserId || null;
}

function extractAliceApplicationId(payload: any): string | null {
  return typeof payload?.session?.application?.application_id === 'string'
    ? payload.session.application.application_id
    : null;
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

function normalizeAliceRawText(command: string): string {
  return command
    .toLowerCase()
    .replaceAll('ё', 'е')
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

function isAliceAboutServiceCommand(command: string): boolean {
  return command.includes('llm store')
    && (
      command.includes('о чем')
      || command.includes('что такое')
      || command.includes('что это')
      || command.includes('что умеет')
      || command.includes('что можно')
      || command.includes('расскажи')
      || command.includes('возможност')
    );
}

function isAliceCapabilitiesCommand(command: string): boolean {
  return command === 'что ты умеешь'
    || command === 'что умеешь'
    || command === 'что ты можешь'
    || command === 'что можешь';
}

function isAliceTaskStatusCommand(command: string): boolean {
  return command.includes('статус задачи')
    || command.includes('уточни статус')
    || command.includes('уточнить статус')
    || command.includes('статус последней задачи')
    || command === 'статус';
}

function isAliceTaskContinuationCommand(command: string): boolean {
  return command.includes('продолжи ответ')
    || command.includes('продолжить ответ')
    || command.includes('следующая часть ответа')
    || command.includes('продолжение ответа');
}

function extractAliceLinkCode(command: string): string | null {
  if (!command.includes('привяж') && !command.includes('свяж')) return null;
  const directMatch = command.match(/\b(\d{4,8})\b/);
  if (directMatch?.[1]) return directMatch[1];

  const groupedMatch = command.match(/((?:\d[\s-]*){4,8})/);
  if (!groupedMatch?.[1]) return null;

  const normalizedCode = groupedMatch[1].replace(/\D+/g, '');
  if (normalizedCode.length < 4 || normalizedCode.length > 8) return null;
  return normalizedCode;
}

function getAliceAccountSummaryIntentSafe(command: string): 'chats' | 'balance' | 'both' | null {
  const asksChats = command.includes('\u0447\u0430\u0442')
    && (
      command.includes('\u0441\u043a\u043e\u043b\u044c\u043a\u043e')
      || command.includes('\u0447\u0438\u0441\u043b\u043e')
      || command.includes('\u043a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432')
      || command.includes('\u0443 \u043c\u0435\u043d\u044f')
    );
  const asksBalance = command.includes('\u0431\u0430\u043b\u0430\u043d\u0441')
    || command.includes('\u0441\u043a\u043e\u043b\u044c\u043a\u043e \u0443 \u043c\u0435\u043d\u044f \u0434\u0435\u043d\u0435\u0433')
    || command.includes('\u0441\u043a\u043e\u043b\u044c\u043a\u043e \u0443 \u043c\u0435\u043d\u044f \u043d\u0430 \u0431\u0430\u043b\u0430\u043d\u0441\u0435');

  if (asksChats && asksBalance) return 'both';
  if (asksChats) return 'chats';
  if (asksBalance) return 'balance';
  return null;
}

function delay<T>(timeoutMs: number, value: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), timeoutMs);
  });
}

const ALICE_SYNC_RESPONSE_TIMEOUT_MS = 4000;

function aliceGreetingText(isAuthorized: boolean): string {
  if (!isAuthorized) {
    return 'Это навык LLM Store. Я могу автоматически создать для вас чат и отправлять туда ваши голосовые запросы.';
  }

  return 'Это навык LLM Store. Просто продиктуйте задачу, и я отправлю её в ваш чат.';
}

function aliceHelpText(isAuthorized: boolean): string {
  if (!isAuthorized) {
    return 'Навык LLM Store автоматически создаёт для вас внутренний чат и отправляет туда голосовые запросы. Просто скажите, что нужно сделать.';
  }

  return 'Скажите задачу обычной фразой. Например: объясни ошибку в коде, составь письмо клиенту или придумай план запуска.';
}

function formatBonusAmountUsd(amountUsd: number | null): string {
  if (amountUsd === null) return '';
  return Number(amountUsd).toFixed(2);
}

function buildAliceReadyText(context: { isNewUser: boolean; bonusGranted: boolean; bonusAmountUsd: number | null }): string {
  if (context.isNewUser && context.bonusGranted) {
    return `Готово. Я создала для вас чат в LLM Store и начислила стартовый бонус ${formatBonusAmountUsd(context.bonusAmountUsd)} USD. Теперь просто скажите, что нужно сделать.`;
  }

  if (context.isNewUser) {
    return 'Готово. Я создала для вас чат в LLM Store. Теперь просто скажите, что нужно сделать.';
  }

  return 'Чат уже готов. Просто скажите, что нужно сделать.';
}

function buildAliceAboutServiceText(): string {
  return 'LLM Store — это конструктор AI-агентов, моделей, инструментов и готовых AI-сценариев. В сервисе есть обычные чаты через OpenRouter, агентные чаты, публикация результатов, а также можно генерировать лендинги и привязывать их к поддоменам вроде rodion.llmstore.pro.';
}

function buildAliceWelcomeText(): string {
  return 'Это навык LLM Store. Он помогает с текстами, идеями, кодом и вопросами о сервисе. Скажите, например: «объясни ошибку в коде», «напиши письмо клиенту» или «о чём LLM Store?».';
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

async function legacyWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = req.body ?? {};
    const rawCommand = extractAliceCommand(payload);
    const skillUserId = extractAliceSkillUserId(payload);
    const applicationId = extractAliceApplicationId(payload);
    const normalizedCommand = normalizeAliceCommand(rawCommand);
    const normalizedRawCommand = normalizeAliceRawText(rawCommand);

    if (!skillUserId) {
      res.status(200).json(
        aliceTextResponse('Не удалось определить пользователя Алисы. Попробуйте запустить навык ещё раз.'),
      );
      return;
    }

    if (rawCommand.toLowerCase() === 'ping') {
      res.status(200).json(aliceTextResponse('pong', 'pong'));
      return;
    }

    if (hasAccountLinkingCompleteEvent(payload)) {
      const context = await aliceChatService.ensureAliceSessionContext(skillUserId, applicationId);
      res.status(200).json(aliceTextResponse(buildAliceReadyText(context)));
      return;
    }

    if (
      isAliceCapabilitiesCommand(normalizedCommand)
      || isAliceCapabilitiesCommand(normalizedRawCommand)
      || isAliceHelpCommand(normalizedCommand)
      || isAliceHelpCommand(normalizedRawCommand)
    ) {
      await aliceChatService.ensureAliceSessionContext(skillUserId, applicationId);
      res.status(200).json(aliceTextResponse(buildAliceWelcomeText()));
      return;
    }

    if (
      isAliceGreetingCommand(normalizedCommand)
      || isAliceGreetingCommand(normalizedRawCommand)
      || isAliceAuthorizationCommand(normalizedCommand)
      || isAliceAuthorizationCommand(normalizedRawCommand)
    ) {
      await aliceChatService.ensureAliceSessionContext(skillUserId, applicationId);
      res.status(200).json(aliceTextResponse(buildAliceWelcomeText()));
      return;
    }

    if (isAliceAboutServiceCommand(normalizedCommand)) {
      await aliceChatService.ensureAliceSessionContext(skillUserId, applicationId);
      res.status(200).json(aliceTextResponse(buildAliceAboutServiceText()));
      return;
    }

    if (!rawCommand.trim()) {
      res.status(200).json(
        aliceTextResponse(buildAliceWelcomeText()),
      );
      return;
    }

    const reply = await aliceChatService.sendAliceChatMessage(skillUserId, applicationId, rawCommand);
    res.status(200).json(aliceTextResponse(reply.text, reply.tts));
  } catch (err) {
    next(err);
  }
}

export async function webhook(req: Request, res: Response, _next: NextFunction) {
  const startedAt = Date.now();
  const payload = req.body ?? {};
  const rawCommand = extractAliceCommand(payload);
  const skillUserId = extractAliceSkillUserId(payload);
  const applicationId = extractAliceApplicationId(payload);
  const sessionId = typeof payload?.session?.session_id === 'string' ? payload.session.session_id : null;
  const messageId = typeof payload?.session?.message_id === 'number' ? payload.session.message_id : null;
  let context: aliceChatService.AliceSessionContext | null = null;

  const respond = async (
    body: Record<string, unknown>,
    options?: {
      context?: aliceChatService.AliceSessionContext | null;
      status?: 'success' | 'error';
      statusCode?: number;
      errorCode?: string | null;
      errorMessage?: string | null;
    },
  ) => {
    const resolvedContext = options?.context ?? context;
    const responseText = typeof body.response === 'object'
      && body.response
      && typeof (body.response as { text?: unknown }).text === 'string'
      ? (body.response as { text: string }).text
      : null;
    const durationMs = Date.now() - startedAt;

    try {
      await aliceLoggingService.createAliceWebhookLog({
        payload,
        status: options?.status ?? 'success',
        statusCode: options?.statusCode ?? 200,
        responseBody: body,
        responseText,
        errorCode: options?.errorCode ?? null,
        errorMessage: options?.errorMessage ?? null,
        context: resolvedContext,
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
        durationMs,
      });
    } catch (logError) {
      logger.error({ err: logError, skillUserId, sessionId, messageId }, 'alice webhook log persist failed');
    }

    logger.info({
      skillUserId,
      applicationId,
      sessionId,
      messageId,
      userId: resolvedContext?.userId ?? null,
      chatId: resolvedContext?.chatId ?? null,
      command: rawCommand || null,
      responseText,
      status: options?.status ?? 'success',
      durationMs,
    }, 'alice webhook handled');

    res.status(options?.statusCode ?? 200).json(body);
  };

  try {
    const normalizedCommand = normalizeAliceCommand(rawCommand);
    const normalizedRawCommand = normalizeAliceRawText(rawCommand);
    const accountSummaryIntent = getAliceAccountSummaryIntentSafe(normalizedCommand)
      ?? getAliceAccountSummaryIntentSafe(normalizedRawCommand);

    if (!skillUserId) {
      await respond(
        aliceTextResponse('Не удалось определить пользователя Алисы. Попробуйте запустить навык ещё раз.'),
      );
      return;
    }

    if (rawCommand.toLowerCase() === 'ping') {
      await respond(aliceTextResponse('pong', 'pong'));
      return;
    }

    if (hasAccountLinkingCompleteEvent(payload)) {
      context = await aliceChatService.ensureAliceSessionContext(skillUserId, applicationId);
      await respond(aliceTextResponse(buildAliceReadyText(context)), { context });
      return;
    }

    if (
      isAliceCapabilitiesCommand(normalizedCommand)
      || isAliceCapabilitiesCommand(normalizedRawCommand)
      || isAliceHelpCommand(normalizedCommand)
      || isAliceHelpCommand(normalizedRawCommand)
    ) {
      context = await aliceChatService.ensureAliceSessionContext(skillUserId, applicationId);
      await respond(aliceTextResponse(buildAliceWelcomeText()), { context });
      return;
    }

    if (
      isAliceGreetingCommand(normalizedCommand)
      || isAliceGreetingCommand(normalizedRawCommand)
      || isAliceAuthorizationCommand(normalizedCommand)
      || isAliceAuthorizationCommand(normalizedRawCommand)
    ) {
      context = await aliceChatService.ensureAliceSessionContext(skillUserId, applicationId);
      await respond(aliceTextResponse(buildAliceWelcomeText()), { context });
      return;
    }

    if (isAliceAboutServiceCommand(normalizedCommand)) {
      context = await aliceChatService.ensureAliceSessionContext(skillUserId, applicationId);
      await respond(aliceTextResponse(buildAliceAboutServiceText()), { context });
      return;
    }

    if (accountSummaryIntent) {
      const summaryResult = await aliceChatService.getAliceAccountSummaryText(
        skillUserId,
        applicationId,
        accountSummaryIntent,
      );
      context = summaryResult.context;
      await respond(aliceTextResponse(summaryResult.text), { context });
      return;
    }

    const aliceLinkCode = extractAliceLinkCode(normalizedCommand) ?? extractAliceLinkCode(normalizedRawCommand);
    if (aliceLinkCode) {
      const linkResult = await aliceChatService.linkAliceAccountByCode(skillUserId, applicationId, aliceLinkCode);
      context = linkResult.context;
      await respond(aliceTextResponse(linkResult.text), { context });
      return;
    }

    if (isAliceTaskStatusCommand(normalizedCommand) || isAliceTaskStatusCommand(normalizedRawCommand)) {
      const statusResult = await aliceChatService.getAliceLastTaskStatusText(skillUserId, applicationId);
      context = statusResult.context;
      await respond(aliceTextResponse(statusResult.text), { context });
      return;
    }

    if (isAliceTaskContinuationCommand(normalizedCommand) || isAliceTaskContinuationCommand(normalizedRawCommand)) {
      const continuationResult = await aliceChatService.getAliceLastTaskContinuationText(skillUserId, applicationId);
      context = continuationResult.context;
      await respond(aliceTextResponse(continuationResult.text), { context });
      return;
    }

    if (!rawCommand.trim()) {
      context = skillUserId
        ? await aliceChatService.ensureAliceSessionContext(skillUserId, applicationId)
        : null;
      await respond(aliceTextResponse(buildAliceWelcomeText()), { context });
      return;
    }

    const guardedReply = aliceChatService.sendAliceChatMessageTracked(skillUserId, applicationId, rawCommand)
      .then((reply) => ({ kind: 'reply' as const, reply }))
      .catch((error) => ({ kind: 'error' as const, error }));

    const raceResult = await Promise.race([
      guardedReply,
      delay(ALICE_SYNC_RESPONSE_TIMEOUT_MS, { kind: 'timeout' as const }),
    ]);

    if (raceResult.kind === 'timeout') {
      context = await aliceChatService.ensureAliceSessionContext(skillUserId, applicationId);
      await respond(aliceTextResponse('Задача уже в обработке. Вы можете уточнить статус задачи или просто сказать: продолжи ответ.'), { context });
      return;
    }

    if (raceResult.kind === 'error') {
      throw raceResult.error;
    }

    context = raceResult.reply.context;
    await aliceChatService.acknowledgeAliceReplyDelivery(raceResult.reply);
    await respond(aliceTextResponse(raceResult.reply.text, raceResult.reply.tts), { context });
  } catch (err) {
    const errorCode = typeof (err as { code?: unknown })?.code === 'string'
      ? (err as { code: string }).code
      : 'ALICE_WEBHOOK_ERROR';
    const errorMessage = err instanceof Error ? err.message : 'Unknown Alice webhook error';
    const userFacingMessage = errorCode.startsWith('ALICE_LINK_')
      || errorCode.startsWith('ALICE_ALREADY_')
      || errorCode === 'ALICE_SKILL_USER_ID_REQUIRED'
      ? errorMessage
      : 'Извините, произошла ошибка. Попробуйте ещё раз.';

    logger.error({
      err,
      skillUserId,
      applicationId,
      sessionId,
      messageId,
      command: rawCommand || null,
    }, 'alice webhook failed');

    await respond(aliceTextResponse(userFacingMessage), {
      context,
      status: 'error',
      statusCode: 200,
      errorCode,
      errorMessage,
    });
  }
}
