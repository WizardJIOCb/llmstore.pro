import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { env } from './env.js';

export const UPLOADS_DIR = path.resolve(env.UPLOADS_DIR);
export const PRIVATE_UPLOADS_DIR = path.resolve(UPLOADS_DIR, '..', 'private-uploads');
export const CHAT_GENERATED_FILES_DIR = path.join(PRIVATE_UPLOADS_DIR, 'chat-message-files');
const NEWS_DIR = path.join(UPLOADS_DIR, 'news');
const CHAT_DIR = path.join(UPLOADS_DIR, 'chat');
const ARTICLES_DIR = path.join(UPLOADS_DIR, 'articles');

// Ensure upload directories exist
mkdirSync(NEWS_DIR, { recursive: true });
mkdirSync(CHAT_DIR, { recursive: true });
mkdirSync(ARTICLES_DIR, { recursive: true });
mkdirSync(CHAT_GENERATED_FILES_DIR, { recursive: true });

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
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
  'application/x-javascript',
  'application/typescript',
  'text/typescript',
  'text/x-typescript',
  'application/x-sh',
  'text/x-shellscript',
  'application/sql',
  'text/x-python',
  'text/x-java-source',
  'text/x-c',
  'text/x-c++',
  'text/x-rustsrc',
]);

const CHAT_ALLOWED_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.xml',
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.py',
  '.java',
  '.kt',
  '.go',
  '.rs',
  '.php',
  '.rb',
  '.sh',
  '.bash',
  '.zsh',
  '.sql',
  '.yml',
  '.yaml',
  '.toml',
  '.ini',
  '.conf',
  '.env',
  '.gitignore',
  '.dockerfile',
  '.svg',
]);

const CHAT_ALLOWED_BASENAMES = new Set([
  '.env',
  '.gitignore',
  'dockerfile',
]);

const CHAT_BUNDLE_ALLOWED_MIME_TYPES = new Set([
  'application/json',
  'text/json',
  'text/plain',
  'application/octet-stream',
]);

function isAllowedChatFile(file: Express.Multer.File): boolean {
  if (CHAT_ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return true;
  }

  const ext = path.extname(file.originalname).toLowerCase();
  const basename = path.basename(file.originalname).toLowerCase();
  return CHAT_ALLOWED_EXTENSIONS.has(ext) || CHAT_ALLOWED_BASENAMES.has(basename);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, NEWS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${randomUUID()}${ext}`);
  },
});

const articleStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ARTICLES_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${randomUUID()}${ext}`);
  },
});

export const articleUpload = multer({
  storage: articleStorage,
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpeg, png, webp, gif) are allowed'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
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
    if (isAllowedChatFile(file)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Allowed: images and common text/code files'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 8,
  },
});

export const chatBundleUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.json' || ext === '.llmchat' || CHAT_BUNDLE_ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported bundle file type. Allowed: .json, .llmchat'));
    }
  },
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 1,
  },
});
