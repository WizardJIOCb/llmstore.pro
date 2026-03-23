import type { Request, Response, NextFunction } from 'express';
import * as catalogService from './catalog.service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { items, nextCursor } = await catalogService.list(req.query as any);
    res.json({
      data: items,
      meta: { cursor: nextCursor },
    });
  } catch (err) {
    next(err);
  }
}

export async function getByTypeAndSlug(req: Request<{ type: string; slug: string }>, res: Response, next: NextFunction) {
  try {
    const item = await catalogService.getByTypeAndSlug(req.params.type, req.params.slug);
    res.json({ data: item });
  } catch (err) {
    next(err);
  }
}

export async function getCategories(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await catalogService.listCategories();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getTags(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await catalogService.listTags();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getUseCases(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await catalogService.listUseCases();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
