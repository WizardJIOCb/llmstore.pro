import type { Request, Response, NextFunction } from 'express';
import * as runtimeService from './runtime.service.js';

export async function startRun(req: Request<{ agentId: string }>, res: Response, next: NextFunction) {
  try {
    const result = await runtimeService.startRun(req.params.agentId, req.session.userId!, req.body);
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
