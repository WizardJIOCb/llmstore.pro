import type { Request, Response, NextFunction } from 'express';
import * as adminService from './admin.service.js';

type IdParams = { id: string };

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
