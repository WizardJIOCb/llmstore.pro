import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID, createHash } from 'crypto';
import { AppError } from '../../../middleware/error-handler.js';
import { CHAT_GENERATED_FILES_DIR } from '../../../config/upload.js';

const DEFAULT_MAX_FILES = 8;
const DEFAULT_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_SIZE_BYTES = 8 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  '.txt',
  '.log',
  '.md',
  '.csv',
  '.json',
  '.xml',
  '.html',
  '.htm',
  '.css',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.py',
  '.sql',
  '.yml',
  '.yaml',
  '.toml',
  '.ini',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
]);

const MIME_BY_EXTENSION = new Map<string, string>([
  ['.txt', 'text/plain'],
  ['.log', 'text/plain'],
  ['.md', 'text/markdown'],
  ['.csv', 'text/csv'],
  ['.json', 'application/json'],
  ['.xml', 'application/xml'],
  ['.html', 'text/html'],
  ['.htm', 'text/html'],
  ['.css', 'text/css'],
  ['.js', 'application/javascript'],
  ['.jsx', 'application/javascript'],
  ['.mjs', 'application/javascript'],
  ['.cjs', 'application/javascript'],
  ['.ts', 'application/typescript'],
  ['.tsx', 'application/typescript'],
  ['.py', 'text/x-python'],
  ['.sql', 'application/sql'],
  ['.yml', 'application/yaml'],
  ['.yaml', 'application/yaml'],
  ['.toml', 'application/toml'],
  ['.ini', 'text/plain'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
]);

interface ChatFileInputItem {
  name?: unknown;
  mime_type?: unknown;
  content?: unknown;
  content_base64?: unknown;
}

interface ChatFileCreateInput {
  files?: unknown;
}

export interface CreatedChatFileArtifact {
  filename: string;
  storage_filename: string;
  original_name: string;
  mime_type: string;
  kind: 'image' | 'text' | 'file';
  size: number;
  sha256: string;
  text_preview?: string;
}

function toPositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function sanitizeOriginalName(value: unknown, index: number): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  const basename = path.basename(raw).replace(/[\u0000-\u001f<>:"|?*]+/g, '-').trim();
  const collapsed = basename.replace(/\s+/g, ' ').replace(/^-+|-+$/g, '');
  return collapsed.slice(0, 180) || `file-${index + 1}.txt`;
}

function resolveExtension(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  if (!ext) return '.txt';
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new AppError(400, 'UNSUPPORTED_FILE_EXTENSION', `Unsupported generated file extension: ${ext}`);
  }
  return ext;
}

function resolveMimeType(originalName: string, requestedMime: unknown): string {
  if (typeof requestedMime === 'string') {
    const mime = requestedMime.trim().toLowerCase();
    if (/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(mime) && mime.length <= 120) {
      return mime;
    }
  }

  return MIME_BY_EXTENSION.get(path.extname(originalName).toLowerCase()) ?? 'application/octet-stream';
}

function resolveKind(mimeType: string): CreatedChatFileArtifact['kind'] {
  if (mimeType.startsWith('image/')) return 'image';
  if (
    mimeType.startsWith('text/')
    || mimeType === 'application/json'
    || mimeType === 'application/xml'
    || mimeType === 'application/javascript'
    || mimeType === 'application/typescript'
    || mimeType === 'application/yaml'
    || mimeType === 'application/toml'
    || mimeType === 'application/sql'
  ) {
    return 'text';
  }
  return 'file';
}

function decodeContent(file: ChatFileInputItem): Buffer {
  if (typeof file.content_base64 === 'string' && file.content_base64.trim()) {
    return Buffer.from(file.content_base64.trim(), 'base64');
  }

  if (typeof file.content === 'string') {
    return Buffer.from(file.content, 'utf8');
  }

  return Buffer.alloc(0);
}

function buildTextPreview(buffer: Buffer, kind: CreatedChatFileArtifact['kind']): string | undefined {
  if (kind !== 'text') return undefined;
  const preview = buffer.toString('utf8').replace(/\r\n/g, '\n').trim();
  return preview ? preview.slice(0, 400) : undefined;
}

export async function executeChatFileCreate(
  input: ChatFileCreateInput,
  config?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const rawFiles = Array.isArray(input.files) ? input.files : [];
  if (rawFiles.length === 0) {
    throw new AppError(400, 'NO_FILES', 'At least one file is required');
  }

  const maxFiles = Math.min(toPositiveInteger(config?.max_files, DEFAULT_MAX_FILES), DEFAULT_MAX_FILES);
  const maxFileSize = Math.min(
    toPositiveInteger(config?.max_file_size_bytes, DEFAULT_MAX_FILE_SIZE_BYTES),
    DEFAULT_MAX_FILE_SIZE_BYTES,
  );
  const maxTotalSize = Math.min(
    toPositiveInteger(config?.max_total_size_bytes, DEFAULT_MAX_TOTAL_SIZE_BYTES),
    DEFAULT_MAX_TOTAL_SIZE_BYTES,
  );
  const storageDir = typeof config?.storage_dir === 'string' && config.storage_dir.trim()
    ? path.resolve(config.storage_dir)
    : CHAT_GENERATED_FILES_DIR;

  await mkdir(storageDir, { recursive: true });

  const createdFiles: CreatedChatFileArtifact[] = [];
  let totalSize = 0;

  for (const [index, rawFile] of rawFiles.slice(0, maxFiles).entries()) {
    if (!rawFile || typeof rawFile !== 'object') continue;
    const file = rawFile as ChatFileInputItem;
    const originalName = sanitizeOriginalName(file.name, index);
    const ext = resolveExtension(originalName);
    const mimeType = resolveMimeType(originalName, file.mime_type);
    const kind = resolveKind(mimeType);
    const buffer = decodeContent(file);

    if (buffer.length === 0) {
      throw new AppError(400, 'EMPTY_FILE', `Generated file is empty: ${originalName}`);
    }
    if (buffer.length > maxFileSize) {
      throw new AppError(400, 'FILE_TOO_LARGE', `Generated file is too large: ${originalName}`);
    }
    if (totalSize + buffer.length > maxTotalSize) {
      throw new AppError(400, 'FILES_TOO_LARGE', 'Generated files exceed the total size limit');
    }

    const storageFilename = `${randomUUID()}${ext}`;
    const filePath = path.join(storageDir, storageFilename);
    await writeFile(filePath, buffer);

    totalSize += buffer.length;
    createdFiles.push({
      filename: storageFilename,
      storage_filename: storageFilename,
      original_name: originalName,
      mime_type: mimeType,
      kind,
      size: buffer.length,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      text_preview: buildTextPreview(buffer, kind),
    });
  }

  if (createdFiles.length === 0) {
    throw new AppError(400, 'NO_VALID_FILES', 'No valid files were provided');
  }

  return {
    files: createdFiles,
    total_size: totalSize,
    note: 'Files were created and will be attached to the final chat response as download cards.',
  };
}
