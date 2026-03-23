import type { Request, Response, NextFunction } from 'express';
import * as agentService from './agent.service.js';

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const agent = await agentService.createAgent(req.session.userId!, req.body);
    res.status(201).json({ data: agent });
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const agents = await agentService.listAgents(req.session.userId!);
    res.json({ data: agents });
  } catch (err) {
    next(err);
  }
}

export async function get(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const agent = await agentService.getAgent(req.params.id, req.session.userId!);
    res.json({ data: agent });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const agent = await agentService.updateAgent(req.params.id, req.session.userId!, req.body);
    res.json({ data: agent });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    await agentService.deleteAgent(req.params.id, req.session.userId!);
    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
}

export async function createVersion(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const version = await agentService.createAgentVersion(req.params.id, req.session.userId!, req.body);
    res.status(201).json({ data: version });
  } catch (err) {
    next(err);
  }
}

export async function listBuiltinTools(_req: Request, res: Response, next: NextFunction) {
  try {
    const tools = await agentService.listBuiltinTools();
    res.json({ data: tools });
  } catch (err) {
    next(err);
  }
}

export async function getStats(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await agentService.getAgentStats(req.session.userId!);
    res.json({ data: stats });
  } catch (err) {
    next(err);
  }
}
