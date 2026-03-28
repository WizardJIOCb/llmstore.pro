import type { Request, Response, NextFunction } from 'express';
import * as runtimeService from './runtime.service.js';

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
      req.session.userRole,
    );
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function getSharedChatById(req: Request<{ token: string }>, res: Response, next: NextFunction) {
  try {
    const result = await runtimeService.getSharedChatById(req.params.token);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}
