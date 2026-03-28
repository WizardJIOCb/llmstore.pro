import type { Request, Response, NextFunction } from 'express';
import * as newsService from './news.service.js';

// ─── Public ─────────────────────────────────────────────────

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await newsService.listPublished(req.query as any);
    res.json({ data: result.items, meta: result.meta });
  } catch (err) {
    next(err);
  }
}

export async function getBySlug(req: Request<{ slug: string }>, res: Response, next: NextFunction) {
  try {
    const article = await newsService.getBySlug(req.params.slug);
    res.json({ data: article });
  } catch (err) {
    next(err);
  }
}

export async function listComments(req: Request<{ slug: string }>, res: Response, next: NextFunction) {
  try {
    const comments = await newsService.listCommentsBySlug(req.params.slug);
    res.json({ data: comments });
  } catch (err) {
    next(err);
  }
}

export async function createComment(req: Request<{ slug: string }>, res: Response, next: NextFunction) {
  try {
    const comment = await newsService.createCommentBySlug(req.params.slug, req.session.userId!, req.body.content);
    res.status(201).json({ data: comment });
  } catch (err) {
    next(err);
  }
}

export async function deleteComment(
  req: Request<{ slug: string; commentId: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await newsService.deleteCommentBySlug(
      req.params.slug,
      req.params.commentId,
      req.session.userId!,
      req.session.userRole,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}
