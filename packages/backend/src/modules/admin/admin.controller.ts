import type { Request, Response, NextFunction } from 'express';
import * as adminService from './admin.service.js';
import * as newsService from '../news/news.service.js';
import { unlink } from 'fs/promises';
import path from 'path';
import { UPLOADS_DIR } from '../../config/upload.js';

type IdParams = { id: string };

export async function getDashboardStats(_req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await adminService.getDashboardStats();
    res.json({ data: stats });
  } catch (err) {
    next(err);
  }
}

// ─── Catalog Items ──────────────────────────────────────────

export async function listItems(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await adminService.listItems(req.query as any);
    res.json({ data: result.items, meta: result.meta });
  } catch (err) {
    next(err);
  }
}

export async function getItem(req: Request<IdParams>, res: Response, next: NextFunction) {
  try {
    const item = await adminService.getItemById(req.params.id);
    res.json({ data: item });
  } catch (err) {
    next(err);
  }
}

export async function createItem(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await adminService.createItem(req.body, req.session.userId!);
    res.status(201).json({ data: item });
  } catch (err) {
    next(err);
  }
}

export async function updateItem(req: Request<IdParams>, res: Response, next: NextFunction) {
  try {
    const item = await adminService.updateItem(req.params.id, req.body);
    res.json({ data: item });
  } catch (err) {
    next(err);
  }
}

export async function deleteItem(req: Request<IdParams>, res: Response, next: NextFunction) {
  try {
    const result = await adminService.deleteItem(req.params.id);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

// ─── Categories ─────────────────────────────────────────────

export async function createCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const cat = await adminService.createCategory(req.body);
    res.status(201).json({ data: cat });
  } catch (err) {
    next(err);
  }
}

export async function updateCategory(req: Request<IdParams>, res: Response, next: NextFunction) {
  try {
    const cat = await adminService.updateCategory(req.params.id, req.body);
    res.json({ data: cat });
  } catch (err) {
    next(err);
  }
}

export async function deleteCategory(req: Request<IdParams>, res: Response, next: NextFunction) {
  try {
    const result = await adminService.deleteCategory(req.params.id);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

// ─── Tags ───────────────────────────────────────────────────

export async function createTag(req: Request, res: Response, next: NextFunction) {
  try {
    const tag = await adminService.createTag(req.body);
    res.status(201).json({ data: tag });
  } catch (err) {
    next(err);
  }
}

export async function updateTag(req: Request<IdParams>, res: Response, next: NextFunction) {
  try {
    const tag = await adminService.updateTag(req.params.id, req.body);
    res.json({ data: tag });
  } catch (err) {
    next(err);
  }
}

export async function deleteTag(req: Request<IdParams>, res: Response, next: NextFunction) {
  try {
    const result = await adminService.deleteTag(req.params.id);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

// ─── Use Cases ──────────────────────────────────────────────

export async function createUseCase(req: Request, res: Response, next: NextFunction) {
  try {
    const uc = await adminService.createUseCase(req.body);
    res.status(201).json({ data: uc });
  } catch (err) {
    next(err);
  }
}

export async function updateUseCase(req: Request<IdParams>, res: Response, next: NextFunction) {
  try {
    const uc = await adminService.updateUseCase(req.params.id, req.body);
    res.json({ data: uc });
  } catch (err) {
    next(err);
  }
}

export async function deleteUseCase(req: Request<IdParams>, res: Response, next: NextFunction) {
  try {
    const result = await adminService.deleteUseCase(req.params.id);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

// ─── Tools ──────────────────────────────────────────────────────────

export async function listTools(_req: Request, res: Response, next: NextFunction) {
  try {
    const tools = await adminService.listTools();
    res.json({ data: tools });
  } catch (err) {
    next(err);
  }
}

export async function createTool(req: Request, res: Response, next: NextFunction) {
  try {
    const tool = await adminService.createTool(req.body);
    res.status(201).json({ data: tool });
  } catch (err) {
    next(err);
  }
}

export async function updateTool(req: Request<IdParams>, res: Response, next: NextFunction) {
  try {
    const tool = await adminService.updateTool(req.params.id, req.body);
    res.json({ data: tool });
  } catch (err) {
    next(err);
  }
}

export async function deleteTool(req: Request<IdParams>, res: Response, next: NextFunction) {
  try {
    const result = await adminService.deleteTool(req.params.id);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

// ─── Users ──────────────────────────────────────────────────

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await adminService.listUsers(req.query as any);
    res.json({ data: result.users, meta: result.meta });
  } catch (err) {
    next(err);
  }
}

export async function getUser(req: Request<IdParams>, res: Response, next: NextFunction) {
  try {
    const user = await adminService.getUserById(req.params.id);
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
}

export async function updateUserRole(req: Request<IdParams>, res: Response, next: NextFunction) {
  try {
    const result = await adminService.updateUserRole(req.params.id, req.body.role);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function updateUserStatus(req: Request<IdParams>, res: Response, next: NextFunction) {
  try {
    const result = await adminService.updateUserStatus(req.params.id, req.body.status);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

// ─── User Balance ───────────────────────────────────────────

export async function adjustUserBalance(req: Request<IdParams>, res: Response, next: NextFunction) {
  try {
    const result = await adminService.adjustUserBalance(req.session.userId!, {
      user_id: req.params.id,
      amount: req.body.amount,
      description: req.body.description,
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

// ─── All Agents ─────────────────────────────────────────────

export async function listAllAgents(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await adminService.listAllAgents(req.query as any);
    res.json({ data: result.agents, meta: result.meta });
  } catch (err) {
    next(err);
  }
}

// ─── News ───────────────────────────────────────────────────

export async function listNews(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await newsService.listForAdmin(req.query as any);
    res.json({ data: result.items, meta: result.meta });
  } catch (err) {
    next(err);
  }
}

export async function getNews(req: Request<IdParams>, res: Response, next: NextFunction) {
  try {
    const article = await newsService.getById(req.params.id);
    res.json({ data: article });
  } catch (err) {
    next(err);
  }
}

export async function createNews(req: Request, res: Response, next: NextFunction) {
  try {
    const article = await newsService.create(req.body, req.session.userId!);
    res.status(201).json({ data: article });
  } catch (err) {
    next(err);
  }
}

export async function updateNews(req: Request<IdParams>, res: Response, next: NextFunction) {
  try {
    const article = await newsService.update(req.params.id, req.body);
    res.json({ data: article });
  } catch (err) {
    next(err);
  }
}

export async function deleteNews(req: Request<IdParams>, res: Response, next: NextFunction) {
  try {
    const result = await newsService.remove(req.params.id);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

// ─── News Image Upload ──────────────────────────────────────

export async function uploadNewsImages(req: Request, res: Response, next: NextFunction) {
  try {
    const files = req.files as Express.Multer.File[];
    const result = files.map((f) => ({
      filename: f.filename,
      original_name: f.originalname,
      url: `/uploads/news/${f.filename}`,
    }));
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function deleteNewsImage(req: Request<{ filename: string }>, res: Response, next: NextFunction) {
  try {
    const filePath = path.join(UPLOADS_DIR, 'news', req.params.filename);
    await unlink(filePath);
    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
}
