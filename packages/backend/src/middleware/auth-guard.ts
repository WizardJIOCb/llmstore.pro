import type { Request, Response, NextFunction } from 'express';
import type { UserRole } from '@llmstore/shared';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Требуется авторизация' },
    });
    return;
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.userId) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Требуется авторизация' },
      });
      return;
    }
    if (!req.session.userRole || !roles.includes(req.session.userRole as UserRole)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Недостаточно прав' },
      });
      return;
    }
    next();
  };
}
