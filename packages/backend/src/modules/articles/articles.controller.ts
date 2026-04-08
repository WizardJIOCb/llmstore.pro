import type { NextFunction, Request, Response } from 'express';
import * as articleService from './articles.service.js';
import { AppError } from '../../middleware/error-handler.js';

function buildViewerKey(req: Request) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
  const userAgent = req.get('user-agent') || 'unknown-agent';
  return `${ip}|${userAgent}`.slice(0, 512);
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await articleService.listArticles(req.query as any, req.session.userId);
    res.json({ data: result.items, meta: result.meta });
  } catch (error) {
    next(error);
  }
}

export async function getBySlug(req: Request<{ slug: string }>, res: Response, next: NextFunction) {
  try {
    const item = await articleService.getArticleBySlug(req.params.slug, {
      userId: req.session.userId,
      viewerKey: buildViewerKey(req),
    });
    res.json({ data: item });
  } catch (error) {
    next(error);
  }
}

export async function like(req: Request<{ slug: string }>, res: Response, next: NextFunction) {
  try {
    const state = await articleService.likeArticle(req.params.slug, req.session.userId!);
    res.json({ data: state });
  } catch (error) {
    next(error);
  }
}

export async function unlike(req: Request<{ slug: string }>, res: Response, next: NextFunction) {
  try {
    const state = await articleService.unlikeArticle(req.params.slug, req.session.userId!);
    res.json({ data: state });
  } catch (error) {
    next(error);
  }
}

export async function bookmark(req: Request<{ slug: string }>, res: Response, next: NextFunction) {
  try {
    const state = await articleService.bookmarkArticle(req.params.slug, req.session.userId!);
    res.json({ data: state });
  } catch (error) {
    next(error);
  }
}

export async function unbookmark(req: Request<{ slug: string }>, res: Response, next: NextFunction) {
  try {
    const state = await articleService.unbookmarkArticle(req.params.slug, req.session.userId!);
    res.json({ data: state });
  } catch (error) {
    next(error);
  }
}

export async function report(req: Request<{ slug: string }>, res: Response, next: NextFunction) {
  try {
    const result = await articleService.reportArticle(req.params.slug, req.session.userId!, req.body);
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function listMine(req: Request, res: Response, next: NextFunction) {
  try {
    const items = await articleService.listMyArticles(req.session.userId!);
    res.json({ data: items });
  } catch (error) {
    next(error);
  }
}

export async function listBookmarks(req: Request, res: Response, next: NextFunction) {
  try {
    const items = await articleService.listMyBookmarkedArticles(req.session.userId!);
    res.json({ data: items });
  } catch (error) {
    next(error);
  }
}

export async function analytics(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await articleService.getMyArticleAnalytics(req.session.userId!);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function getMineById(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const item = await articleService.getMyArticleById(req.params.id, req.session.userId!);
    res.json({ data: item });
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await articleService.createArticle(req.body, req.session.userId!);
    res.status(201).json({ data: item });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const item = await articleService.updateMyArticle(req.params.id, req.body, req.session.userId!);
    res.json({ data: item });
  } catch (error) {
    next(error);
  }
}

export async function uploadHeroImage(req: Request, res: Response, next: NextFunction) {
  try {
    const file = req.file;
    if (!file) {
      throw new AppError(400, 'BAD_REQUEST', 'Не передано изображение для загрузки');
    }

    res.status(201).json({
      data: {
        filename: file.filename,
        original_name: file.originalname,
        url: `/uploads/articles/${file.filename}`,
      },
    });
  } catch (error) {
    next(error);
  }
}
