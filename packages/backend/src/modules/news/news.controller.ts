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
