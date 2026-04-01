import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import * as runtimeService from './runtime.service.js';

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
    const runs = await runtimeService.listRuns(req.session.userId!, agentId);
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

export async function createChat(req: Request, res: Response, next: NextFunction) {
  try {
    const chat = await runtimeService.createChat(req.session.userId!, req.body, req.session.userRole);
    res.status(201).json({ data: chat });
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
      res.status(response.status === 404 ? 404 : 502).end();
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
    res.status(201).json({ data: result });
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
