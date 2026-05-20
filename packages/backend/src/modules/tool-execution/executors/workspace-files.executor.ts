import { mkdir, readdir, readFile, rm, stat, writeFile } from 'fs/promises';
import path from 'path';
import { AppError, NotFoundError } from '../../../middleware/error-handler.js';

const DEFAULT_MAX_READ_BYTES = 512 * 1024;
const DEFAULT_MAX_WRITE_BYTES = 1024 * 1024;
const DEFAULT_MAX_LIST_ITEMS = 200;

function getWorkspaceRoot(config?: Record<string, unknown>): string {
  const root = typeof config?.workspace_root === 'string' ? config.workspace_root.trim() : '';
  if (!root) {
    throw new AppError(400, 'WORKSPACE_NOT_AVAILABLE', 'Workspace tools are available only inside project chats');
  }
  return path.resolve(root);
}

function normalizeWorkspacePath(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized === '.') return '';
  if (normalized.includes('\0') || normalized.split('/').some((part) => part === '..')) {
    throw new AppError(400, 'INVALID_WORKSPACE_PATH', 'Invalid workspace path');
  }
  return normalized;
}

function safeWorkspacePath(root: string, relativePath: unknown): { relativePath: string; absolutePath: string } {
  const normalized = normalizeWorkspacePath(relativePath);
  const target = path.resolve(root, normalized);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new AppError(400, 'INVALID_WORKSPACE_PATH', 'Invalid workspace path');
  }
  return { relativePath: normalized, absolutePath: target };
}

function toPositiveInt(value: unknown, fallback: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value)));
}

async function ensureFile(absolutePath: string) {
  const fileStat = await stat(absolutePath).catch(() => null);
  if (!fileStat?.isFile()) {
    throw new NotFoundError('Workspace file not found');
  }
  return fileStat;
}

export async function executeWorkspaceListFiles(input: Record<string, unknown>, config?: Record<string, unknown>) {
  const root = getWorkspaceRoot(config);
  const { relativePath, absolutePath } = safeWorkspacePath(root, input.path ?? '');
  const maxItems = toPositiveInt(input.max_items, DEFAULT_MAX_LIST_ITEMS, DEFAULT_MAX_LIST_ITEMS);
  const dirStat = await stat(absolutePath).catch(() => null);
  if (!dirStat?.isDirectory()) {
    throw new NotFoundError('Workspace directory not found');
  }

  const entries = await readdir(absolutePath, { withFileTypes: true });
  const items = [];
  for (const entry of entries.slice(0, maxItems)) {
    const entryRelativePath = [relativePath, entry.name].filter(Boolean).join('/');
    const entryAbsolutePath = path.join(absolutePath, entry.name);
    const entryStat = await stat(entryAbsolutePath).catch(() => null);
    items.push({
      name: entry.name,
      path: entryRelativePath,
      type: entry.isDirectory() ? 'directory' : 'file',
      size: entry.isDirectory() ? null : (entryStat?.size ?? null),
      updated_at: entryStat?.mtime ? entryStat.mtime.toISOString() : null,
    });
  }

  return {
    path: relativePath,
    items,
    truncated: entries.length > maxItems,
  };
}

export async function executeWorkspaceReadFile(input: Record<string, unknown>, config?: Record<string, unknown>) {
  const root = getWorkspaceRoot(config);
  const { relativePath, absolutePath } = safeWorkspacePath(root, input.path);
  if (!relativePath) throw new AppError(400, 'WORKSPACE_FILE_REQUIRED', 'File path is required');

  const maxBytes = toPositiveInt(config?.max_read_bytes, DEFAULT_MAX_READ_BYTES, DEFAULT_MAX_READ_BYTES);
  const fileStat = await ensureFile(absolutePath);
  if (fileStat.size > maxBytes) {
    throw new AppError(413, 'WORKSPACE_FILE_TOO_LARGE', 'Workspace file is too large to read through the model tool');
  }

  const content = await readFile(absolutePath, 'utf8');
  return {
    path: relativePath,
    content,
    size: fileStat.size,
    updated_at: fileStat.mtime.toISOString(),
  };
}

export async function executeWorkspaceWriteFile(input: Record<string, unknown>, config?: Record<string, unknown>) {
  const root = getWorkspaceRoot(config);
  const { relativePath, absolutePath } = safeWorkspacePath(root, input.path);
  if (!relativePath) throw new AppError(400, 'WORKSPACE_FILE_REQUIRED', 'File path is required');
  const content = typeof input.content === 'string' ? input.content : '';
  if (!content.trim()) throw new AppError(400, 'WORKSPACE_FILE_CONTENT_REQUIRED', 'Non-empty file content is required');

  const maxBytes = toPositiveInt(config?.max_write_bytes, DEFAULT_MAX_WRITE_BYTES, DEFAULT_MAX_WRITE_BYTES);
  if (Buffer.byteLength(content, 'utf8') > maxBytes) {
    throw new AppError(413, 'WORKSPACE_FILE_TOO_LARGE', 'Workspace file is too large to write through the model tool');
  }

  const mode = input.mode === 'append' ? 'append' : 'overwrite';
  let nextContent = content;
  if (mode === 'append') {
    const current = await readFile(absolutePath, 'utf8').catch(() => '');
    const separator = current && !current.endsWith('\n') ? '\n' : '';
    nextContent = `${current}${separator}${content}`;
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, nextContent, 'utf8');
  const fileStat = await stat(absolutePath);
  return {
    path: relativePath,
    mode,
    size: fileStat.size,
    updated_at: fileStat.mtime.toISOString(),
  };
}

export async function executeWorkspaceEditFile(input: Record<string, unknown>, config?: Record<string, unknown>) {
  const root = getWorkspaceRoot(config);
  const { relativePath, absolutePath } = safeWorkspacePath(root, input.path);
  if (!relativePath) throw new AppError(400, 'WORKSPACE_FILE_REQUIRED', 'File path is required');
  const search = typeof input.search === 'string' ? input.search : '';
  const replace = typeof input.replace === 'string' ? input.replace : '';
  if (!search) throw new AppError(400, 'WORKSPACE_EDIT_SEARCH_REQUIRED', 'Exact search text is required');

  const fileStat = await ensureFile(absolutePath);
  const maxBytes = toPositiveInt(config?.max_write_bytes, DEFAULT_MAX_WRITE_BYTES, DEFAULT_MAX_WRITE_BYTES);
  if (fileStat.size > maxBytes) {
    throw new AppError(413, 'WORKSPACE_FILE_TOO_LARGE', 'Workspace file is too large to edit through the model tool');
  }

  const current = await readFile(absolutePath, 'utf8');
  const matches = current.split(search).length - 1;
  if (matches === 0) {
    throw new AppError(400, 'WORKSPACE_EDIT_SEARCH_NOT_FOUND', 'Exact search text was not found in the file');
  }

  const replaceAll = input.replace_all === true;
  const nextContent = replaceAll
    ? current.split(search).join(replace)
    : current.replace(search, replace);
  if (Buffer.byteLength(nextContent, 'utf8') > maxBytes) {
    throw new AppError(413, 'WORKSPACE_FILE_TOO_LARGE', 'Edited workspace file is too large');
  }

  await writeFile(absolutePath, nextContent, 'utf8');
  const nextStat = await stat(absolutePath);
  return {
    path: relativePath,
    replacements: replaceAll ? matches : 1,
    available_matches: matches,
    size: nextStat.size,
    updated_at: nextStat.mtime.toISOString(),
  };
}

export async function executeWorkspaceDeleteFile(input: Record<string, unknown>, config?: Record<string, unknown>) {
  const root = getWorkspaceRoot(config);
  const { relativePath, absolutePath } = safeWorkspacePath(root, input.path);
  if (!relativePath) throw new AppError(400, 'WORKSPACE_FILE_REQUIRED', 'File path is required');

  const fileStat = await ensureFile(absolutePath);
  await rm(absolutePath);
  return {
    path: relativePath,
    deleted: true,
    size: fileStat.size,
  };
}
