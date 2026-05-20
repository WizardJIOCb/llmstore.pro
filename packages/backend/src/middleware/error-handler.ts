import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { logger } from '../lib/logger.js';

const CHAT_UPLOAD_MAX_FILE_MB = 10;
const DEFAULT_UPLOAD_MAX_FILE_MB = 5;
const CHAT_UPLOAD_MAX_FILES = 8;
const DEFAULT_UPLOAD_MAX_FILES = 10;

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Ресурс не найден') {
    super(404, 'NOT_FOUND', message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Ресурс уже существует') {
    super(409, 'CONFLICT', message);
  }
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    const isChatUpload = req.path.includes('/chats/uploads');
    const maxFileMb = isChatUpload ? CHAT_UPLOAD_MAX_FILE_MB : DEFAULT_UPLOAD_MAX_FILE_MB;
    const maxFiles = isChatUpload ? CHAT_UPLOAD_MAX_FILES : DEFAULT_UPLOAD_MAX_FILES;

    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        error: {
          code: 'FILE_TOO_LARGE',
          message: `Размер загружаемого файла превышает лимит ${maxFileMb} МБ`,
          details: {
            max_file_size_mb: maxFileMb,
          },
        },
      });
      return;
    }

    const message = err.code === 'LIMIT_FILE_COUNT'
      ? `Слишком много файлов (максимум ${maxFiles})`
      : 'Ошибка загрузки файла';

    res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message,
      },
    });
    return;
  }

  if (
    err.message === 'Only image files (jpeg, png, webp, gif) are allowed'
    || err.message === 'Unsupported file type. Allowed: images, txt, md, csv, json, xml'
    || err.message === 'Unsupported file type. Allowed: images and common text/code files'
  ) {
    res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: err.message === 'Only image files (jpeg, png, webp, gif) are allowed'
          ? 'Разрешены только изображения: jpeg, png, webp, gif'
          : 'Разрешены только изображения и типовые текстовые/кодовые файлы',
      },
    });
    return;
  }

  const maybeStatusCode = (err as Error & { statusCode?: number; status?: number }).statusCode
    ?? (err as Error & { statusCode?: number; status?: number }).status;
  if (typeof maybeStatusCode === 'number' && maybeStatusCode >= 400 && maybeStatusCode < 500) {
    res.status(maybeStatusCode).json({
      error: {
        code: 'BAD_REQUEST',
        message: err.message || 'Некорректный запрос',
      },
    });
    return;
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Внутренняя ошибка сервера',
    },
  });
}
