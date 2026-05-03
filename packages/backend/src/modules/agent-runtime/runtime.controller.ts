import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import * as runtimeService from './runtime.service.js';
import * as projectDeploymentsService from './project-deployments.service.js';
import * as telegramBotQuickstartService from './telegram-bot-quickstart.service.js';
import { AppError } from '../../middleware/error-handler.js';

const PREVIEW_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "font-src 'self' https: data:",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "img-src 'self' https: data:",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "script-src-attr 'unsafe-inline'",
  "style-src 'self' https: 'unsafe-inline'",
  'upgrade-insecure-requests',
].join(';');

const EMOJI_PROXY_BASE_URL = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/';
const EMOJI_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const emojiSvgCache = new Map<string, { body: Buffer; fetchedAt: number }>();
const VIEWER_COOKIE_NAME = 'llmstore_viewer_id';

function buildAttachmentDisposition(filename: string): string {
  const asciiFallback = filename
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]+/g, '-')
    .replace(/["\\]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'chat-export.llmchat.json';

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeEmojiCode(code: string): string | null {
  try {
    const points = code
      .split('-')
      .map((part) => Number.parseInt(part, 16))
      .filter((point) => Number.isInteger(point) && point >= 0 && point <= 0x10ffff);

    if (!points.length) {
      return null;
    }

    return String.fromCodePoint(...points);
  } catch {
    return null;
  }
}

function buildEmojiFallbackSvg(code: string): Buffer | null {
  const value = decodeEmojiCode(code);
  if (!value) {
    return null;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="56">${escapeSvgText(value)}</text>
</svg>`;

  return Buffer.from(svg, 'utf-8');
}

function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  if (!cookieHeader) return parsed;

  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rawValueParts] = part.split('=');
    const key = rawKey?.trim();
    if (!key) continue;
    const rawValue = rawValueParts.join('=').trim();
    parsed[key] = decodeURIComponent(rawValue);
  }

  return parsed;
}

function resolveViewerContext(req: Request, res: Response): { viewerUserId?: string | null; viewerKey?: string | null } {
  const viewerUserId = req.session?.userId ?? null;
  if (viewerUserId) {
    return { viewerUserId, viewerKey: `user:${viewerUserId}` };
  }

  const cookies = parseCookieHeader(req.headers.cookie);
  let viewerId = cookies[VIEWER_COOKIE_NAME]?.trim() ?? '';

  if (!/^[a-z0-9-]{16,128}$/i.test(viewerId)) {
    viewerId = randomUUID().replace(/-/g, '');
    res.cookie(VIEWER_COOKIE_NAME, viewerId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
      maxAge: 1000 * 60 * 60 * 24 * 365,
      path: '/',
    });
  }

  return { viewerUserId: null, viewerKey: `anon:${viewerId}` };
}

export async function startRun(req: Request<{ agentId: string }>, res: Response, next: NextFunction) {
  try {
    const result = await runtimeService.startRun(req.params.agentId, req.session.userId!, req.body, {
      sync_to_chats: true,
      user_role: req.session.userRole,
    });
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function getRun(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const run = await runtimeService.getRun(req.params.id, req.session.userId!);
    res.json({ data: run });
  } catch (err) {
    next(err);
  }
}

export async function listRuns(req: Request, res: Response, next: NextFunction) {
  try {
    const agentId = req.query.agent_id as string | undefined;
    const deploymentId = req.query.deployment_id as string | undefined;
    const runs = await runtimeService.listRuns(req.session.userId!, agentId, deploymentId);
    res.json({ data: runs });
  } catch (err) {
    next(err);
  }
}

export async function getChatHistory(req: Request<{ agentId: string }>, res: Response, next: NextFunction) {
  try {
    const result = await runtimeService.getChatHistory(req.params.agentId, req.session.userId!);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function shareChat(req: Request<{ agentId: string }>, res: Response, next: NextFunction) {
  try {
    const result = await runtimeService.shareChat(req.params.agentId, req.session.userId!);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function clearChat(req: Request<{ agentId: string }>, res: Response, next: NextFunction) {
  try {
    await runtimeService.clearChatHistory(req.params.agentId, req.session.userId!);
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
}

export async function getSharedChat(req: Request<{ token: string }>, res: Response, next: NextFunction) {
  try {
    const result = await runtimeService.getSharedChat(req.params.token);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function listChats(req: Request, res: Response, next: NextFunction) {
  try {
    const chats = await runtimeService.listChats(req.session.userId!);
    res.json({ data: chats });
  } catch (err) {
    next(err);
  }
}

export async function listGalleryPreviews(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const items = await runtimeService.listGalleryPreviews(
      Number.isFinite(limit) ? Number(limit) : undefined,
      req.session?.userId,
    );
    res.json({ data: items });
  } catch (err) {
    next(err);
  }
}

export async function listGalleryTextChats(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const sort = typeof req.query.sort === 'string' ? req.query.sort : undefined;
    const items = await runtimeService.listGalleryTextChats(
      Number.isFinite(limit) ? Number(limit) : undefined,
      req.session?.userId,
      sort,
    );
    res.json({ data: items });
  } catch (err) {
    next(err);
  }
}

export async function setGalleryPreviewReaction(req: Request<{ chatId: string }>, res: Response, next: NextFunction) {
  try {
    const result = await runtimeService.setGalleryPreviewReaction(
      req.params.chatId,
      req.session.userId!,
      req.body.reaction_type,
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function deleteGalleryPreviewReaction(req: Request<{ chatId: string }>, res: Response, next: NextFunction) {
  try {
    const result = await runtimeService.deleteGalleryPreviewReaction(
      req.params.chatId,
      req.session.userId!,
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function listChatAgents(req: Request, res: Response, next: NextFunction) {
  try {
    const agents = await runtimeService.listChatAgents(req.session.userId!, req.session.userRole);
    res.json({ data: agents });
  } catch (err) {
    next(err);
  }
}

export async function listPublicChatsByAgent(req: Request<{ agentId: string }>, res: Response, next: NextFunction) {
  try {
    const result = await runtimeService.listPublicChatsByAgent(req.params.agentId, req.session?.userId);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function listPublicChatsByModel(req: Request, res: Response, next: NextFunction) {
  try {
    const modelExternalId = typeof req.query.model === 'string' ? req.query.model : '';
    const result = await runtimeService.listPublicChatsByModel(modelExternalId, req.session?.userId);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function createChat(req: Request, res: Response, next: NextFunction) {
  try {
    const chat = await runtimeService.createChat(req.session.userId!, req.body, req.session.userRole);
    res.status(201).json({ data: chat });
  } catch (err) {
    next(err);
  }
}

export async function createTelegramBotQuickstart(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await telegramBotQuickstartService.createTelegramBotQuickstart(
      req.session.userId!,
      req.body,
    );
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function cloneChat(
  req: Request<{ chatId: string }, unknown, { include_messages?: boolean }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const chat = await runtimeService.cloneChat(
      req.params.chatId,
      req.session.userId!,
      req.session.userRole,
      { includeMessages: req.body.include_messages !== false },
    );
    res.status(201).json({ data: chat });
  } catch (err) {
    next(err);
  }
}

export async function importChatBundle(req: Request, res: Response, next: NextFunction) {
  try {
    const file = req.file;
    if (!file) {
      throw new AppError(400, 'CHAT_BUNDLE_REQUIRED', 'Файл переноса чата обязателен');
    }

    const chat = await runtimeService.importChatBundle(
      req.session.userId!,
      file,
      req.session.userRole,
    );
    res.status(201).json({ data: chat });
  } catch (err) {
    next(err);
  }
}

export async function exportChatBundle(req: Request<{ chatId: string }>, res: Response, next: NextFunction) {
  try {
    const bundle = await runtimeService.exportChatBundle(req.params.chatId, req.session.userId!);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', buildAttachmentDisposition(bundle.filename));
    res.json({ data: bundle.payload });
  } catch (err) {
    next(err);
  }
}

export async function getChatById(req: Request<{ chatId: string }>, res: Response, next: NextFunction) {
  try {
    const chat = await runtimeService.getChatById(req.params.chatId, req.session.userId!);
    res.json({ data: chat });
  } catch (err) {
    next(err);
  }
}

export async function getChatMessagePreview(req: Request<{ chatId: string; messageId: string }>, res: Response, next: NextFunction) {
  try {
    const viewer = resolveViewerContext(req, res);
    const html = await runtimeService.getChatMessagePreviewHtml(
      req.params.chatId,
      req.params.messageId,
      viewer.viewerUserId,
      viewer.viewerKey,
      {
        previewId: typeof req.query.previewId === 'string' ? req.query.previewId : undefined,
        galleryMode: req.query.gallery === '1',
      },
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Content-Security-Policy', PREVIEW_CSP);
    res.send(html);
  } catch (err) {
    next(err);
  }
}

export async function getSharedChatMessagePreview(req: Request<{ token: string; messageId: string }>, res: Response, next: NextFunction) {
  try {
    const viewer = resolveViewerContext(req, res);
    const html = await runtimeService.getSharedChatMessagePreviewHtml(
      req.params.token,
      req.params.messageId,
      viewer.viewerUserId,
      viewer.viewerKey,
      {
        previewId: typeof req.query.previewId === 'string' ? req.query.previewId : undefined,
        galleryMode: req.query.gallery === '1',
      },
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Content-Security-Policy', PREVIEW_CSP);
    res.send(html);
  } catch (err) {
    next(err);
  }
}

export async function updateChatMessagePreview(req: Request<{ chatId: string; messageId: string }>, res: Response, next: NextFunction) {
  try {
    const result = await runtimeService.updateChatMessagePreview(
      req.params.chatId,
      req.params.messageId,
      req.session.userId!,
      req.body,
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function updateSharedChatMessagePreview(req: Request<{ token: string; messageId: string }>, res: Response, next: NextFunction) {
  try {
    const result = await runtimeService.updateSharedChatMessagePreview(
      req.params.token,
      req.params.messageId,
      req.session.userId!,
      req.body,
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function runChatMessageProject(req: Request<{ chatId: string; messageId: string }>, res: Response, next: NextFunction) {
  try {
    const result = await runtimeService.runChatMessageProject(
      req.params.chatId,
      req.params.messageId,
      req.session.userId!,
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function runGalleryPreviewProject(req: Request<{ chatId: string; messageId: string }>, res: Response, next: NextFunction) {
  try {
    const result = await runtimeService.runGalleryPreviewProject(
      req.params.chatId,
      req.params.messageId,
      req.session.userId!,
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function getChatMessageProjectDeployment(req: Request<{ chatId: string; messageId: string }>, res: Response, next: NextFunction) {
  try {
    const result = await projectDeploymentsService.readProjectDeploymentForUser(
      req.params.chatId,
      req.params.messageId,
      req.session.userId!,
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function upsertChatMessageProjectDeployment(req: Request<{ chatId: string; messageId: string }>, res: Response, next: NextFunction) {
  try {
    const result = await projectDeploymentsService.upsertChatMessageProjectDeployment(
      req.params.chatId,
      req.params.messageId,
      req.session.userId!,
      req.body,
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function controlChatMessageProjectDeployment(req: Request<{ chatId: string; messageId: string }>, res: Response, next: NextFunction) {
  try {
    const result = await projectDeploymentsService.controlChatMessageProjectDeployment(
      req.params.chatId,
      req.params.messageId,
      req.session.userId!,
      req.body,
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function startChatMessageProjectDeployment(req: Request<{ chatId: string; messageId: string }>, res: Response, next: NextFunction) {
  try {
    const result = await projectDeploymentsService.startChatMessageProjectDeployment(
      req.params.chatId,
      req.params.messageId,
      req.session.userId!,
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function reinstallTelegramWebhookForChatMessageProjectDeployment(req: Request<{ chatId: string; messageId: string }>, res: Response, next: NextFunction) {
  try {
    const result = await projectDeploymentsService.reinstallTelegramWebhookForChatMessageProjectDeployment(
      req.params.chatId,
      req.params.messageId,
      req.session.userId!,
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function stopChatMessageProjectDeployment(req: Request<{ chatId: string; messageId: string }>, res: Response, next: NextFunction) {
  try {
    const result = await projectDeploymentsService.stopChatMessageProjectDeployment(
      req.params.chatId,
      req.params.messageId,
      req.session.userId!,
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function proxyProjectDeploymentWebhook(req: Request<{ token: string }>, res: Response, next: NextFunction) {
  try {
    const result = await projectDeploymentsService.proxyProjectDeploymentWebhook(req.params.token, req);
    result.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'content-length') return;
      res.setHeader(key, value);
    });
    res.status(result.status).send(result.body);
  } catch (err) {
    next(err);
  }
}

export async function runLinkedAgentForProjectDeployment(req: Request<{ token: string }>, res: Response, next: NextFunction) {
  try {
    const headerSecret = typeof req.headers['x-llmstore-deployment-secret'] === 'string'
      ? req.headers['x-llmstore-deployment-secret']
      : undefined;
    const result = await projectDeploymentsService.runLinkedAgentForProjectDeployment(
      req.params.token,
      headerSecret,
      req.body,
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function getEmojiSvg(req: Request<{ code: string }>, res: Response, next: NextFunction) {
  try {
    const code = req.params.code.trim().toLowerCase();
    if (!/^[0-9a-f-]+$/i.test(code)) {
      res.status(404).end();
      return;
    }

    const cached = emojiSvgCache.get(code);
    if (cached && (Date.now() - cached.fetchedAt) < EMOJI_CACHE_TTL_MS) {
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.send(cached.body);
      return;
    }

    const response = await fetch(`${EMOJI_PROXY_BASE_URL}${code}.svg`);
    if (!response.ok) {
      if (response.status === 404) {
        const fallbackBody = buildEmojiFallbackSvg(code);
        if (!fallbackBody) {
          res.status(404).end();
          return;
        }

        emojiSvgCache.set(code, { body: fallbackBody, fetchedAt: Date.now() });
        res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.send(fallbackBody);
        return;
      }

      res.status(502).end();
      return;
    }

    const body = Buffer.from(await response.arrayBuffer());
    emojiSvgCache.set(code, { body, fetchedAt: Date.now() });
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(body);
  } catch (err) {
    next(err);
  }
}

export async function streamChatEvents(req: Request<{ chatId: string }>, res: Response, next: NextFunction) {
  try {
    await runtimeService.streamChatEvents(req.params.chatId, req.session.userId!, res);
  } catch (err) {
    next(err);
  }
}

export async function getChatStats(req: Request<{ chatId: string }>, res: Response, next: NextFunction) {
  try {
    const stats = await runtimeService.getChatStats(req.params.chatId, req.session.userId!);
    res.json({ data: stats });
  } catch (err) {
    next(err);
  }
}

export async function updateChat(req: Request<{ chatId: string }>, res: Response, next: NextFunction) {
  try {
    const chat = await runtimeService.updateChat(req.params.chatId, req.session.userId!, req.body, req.session.userRole);
    res.json({ data: chat });
  } catch (err) {
    next(err);
  }
}

export async function deleteChat(req: Request<{ chatId: string }>, res: Response, next: NextFunction) {
  try {
    await runtimeService.deleteChat(req.params.chatId, req.session.userId!);
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
}

export async function deleteChatMessage(req: Request<{ chatId: string; messageId: string }>, res: Response, next: NextFunction) {
  try {
    const result = await runtimeService.deleteChatMessage(req.params.chatId, req.params.messageId, req.session.userId!);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function truncateChatFromMessage(req: Request<{ chatId: string; messageId: string }>, res: Response, next: NextFunction) {
  try {
    const result = await runtimeService.truncateChatFromMessage(req.params.chatId, req.params.messageId, req.session.userId!);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function shareChatById(req: Request<{ chatId: string }>, res: Response, next: NextFunction) {
  try {
    const result = await runtimeService.shareChatById(req.params.chatId, req.session.userId!);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function sendChatMessage(req: Request<{ chatId: string }>, res: Response, next: NextFunction) {
  try {
    const result = await runtimeService.sendChatMessage(
      req.params.chatId,
      req.session.userId!,
      req.body.content,
      req.body.attachments,
      req.session.userRole,
    );
    const statusCode = result && typeof result === 'object' && 'processing' in result && result.processing ? 202 : 201;
    res.status(statusCode).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function getPublishedLanding(req: Request<{ chatId: string; messageId: string }>, res: Response, next: NextFunction) {
  try {
    const result = await runtimeService.getPublishedLanding(
      req.params.chatId,
      req.params.messageId,
      req.session.userId!,
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function publishChatMessageLanding(req: Request<{ chatId: string; messageId: string }>, res: Response, next: NextFunction) {
  try {
    const result = await runtimeService.publishChatMessageLanding(
      req.params.chatId,
      req.params.messageId,
      req.session.userId!,
      req.body,
    );
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function updatePublishedLanding(req: Request<{ chatId: string; messageId: string }>, res: Response, next: NextFunction) {
  try {
    const result = await runtimeService.updatePublishedLanding(
      req.params.chatId,
      req.params.messageId,
      req.session.userId!,
      req.body,
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function unpublishChatMessageLanding(req: Request<{ chatId: string; messageId: string }>, res: Response, next: NextFunction) {
  try {
    await runtimeService.unpublishChatMessageLanding(
      req.params.chatId,
      req.params.messageId,
      req.session.userId!,
    );
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
}

export async function uploadChatFiles(req: Request, res: Response, next: NextFunction) {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    const result = await runtimeService.prepareUploadedChatFiles(files ?? []);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function getSharedChatById(req: Request<{ token: string }>, res: Response, next: NextFunction) {
  try {
    const viewer = resolveViewerContext(req, res);
    const result = await runtimeService.getSharedChatById(req.params.token, viewer.viewerUserId, viewer.viewerKey);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function streamSharedChatEvents(req: Request<{ token: string }>, res: Response, next: NextFunction) {
  try {
    await runtimeService.streamSharedChatEvents(req.params.token, res);
  } catch (err) {
    next(err);
  }
}

export async function exportSharedChatBundle(req: Request<{ token: string }>, res: Response, next: NextFunction) {
  try {
    const viewer = resolveViewerContext(req, res);
    const bundle = await runtimeService.exportSharedChatBundle(req.params.token, viewer.viewerUserId, viewer.viewerKey);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', buildAttachmentDisposition(bundle.filename));
    res.json({ data: bundle.payload });
  } catch (err) {
    next(err);
  }
}

export async function getPublishedLandingByHost(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
      next();
      return;
    }

    const hostname = req.hostname?.trim().toLowerCase();
    const frontendHost = new URL(process.env.FRONTEND_URL || 'https://llmstore.pro').hostname.toLowerCase();
    if (!hostname || hostname === frontendHost || !hostname.endsWith(`.${frontendHost}`)) {
      next();
      return;
    }

    const subdomain = hostname.slice(0, -(frontendHost.length + 1));
    if (!subdomain) {
      next();
      return;
    }

    const viewer = resolveViewerContext(req, res);
    const html = await runtimeService.getPublishedLandingHtmlBySubdomain(
      subdomain,
      viewer.viewerUserId,
      viewer.viewerKey,
      {
        previewId: typeof req.query.previewId === 'string' ? req.query.previewId : undefined,
      },
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Content-Security-Policy', PREVIEW_CSP);
    res.send(html);
  } catch (err) {
    next(err);
  }
}
