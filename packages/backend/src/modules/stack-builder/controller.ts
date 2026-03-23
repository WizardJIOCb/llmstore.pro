import type { Request, Response, NextFunction } from 'express';
import * as service from './service.js';

export async function recommend(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.generateRecommendation(req.body);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function save(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.saveResult(req.session.userId!, req.body);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function listSaved(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.listSavedResults(req.session.userId!);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getSaved(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const data = await service.getSavedResult(req.session.userId!, req.params.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function exportResult(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.session?.userId;
    const result = await service.exportResult(req.body, userId);

    if (result.format === 'markdown') {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="stack-recommendation.md"');
      res.send(result.data);
    } else {
      res.json({ data: result.data });
    }
  } catch (err) {
    next(err);
  }
}

export async function createAgent(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.createAgentFromStack(req.session.userId!, req.body);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}
