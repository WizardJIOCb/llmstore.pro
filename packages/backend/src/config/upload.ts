import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { env } from './env.js';

export const UPLOADS_DIR = path.resolve(env.UPLOADS_DIR);
const NEWS_DIR = path.join(UPLOADS_DIR, 'news');
const CHAT_DIR = path.join(UPLOADS_DIR, 'chat');

// Ensure upload directories exist
mkdirSync(NEWS_DIR, { recursive: true });
mkdirSync(CHAT_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const CHAT_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/xml',
  'text/xml',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, NEWS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${randomUUID()}${ext}`);
  },
});

export const newsUpload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpeg, png, webp, gif) are allowed'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 10,
  },
});

const chatStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, CHAT_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    cb(null, `${randomUUID()}${ext}`);
  },
});

export const chatUpload = multer({
  storage: chatStorage,
  fileFilter: (_req, file, cb) => {
    if (CHAT_ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Allowed: images, txt, md, csv, json, xml'));
    }
  },
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 8,
  },
});
