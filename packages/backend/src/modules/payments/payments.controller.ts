import type { NextFunction, Request, Response } from 'express';
import * as paymentsService from './payments.service.js';

export async function getPublicConfig(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ data: paymentsService.getYooKassaPublicConfig() });
  } catch (err) {
    next(err);
  }
}

export async function createYooKassaTopUp(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await paymentsService.createYooKassaTopUp(req.session.userId!, req.body);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function getTopUp(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const result = await paymentsService.getTopUpForUser(req.session.userId!, req.params.id);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function yookassaWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await paymentsService.handleYooKassaWebhook(req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
