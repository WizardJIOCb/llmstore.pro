import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentPropsWithoutRef, CSSProperties, KeyboardEvent, ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Pencil, Trash2 } from 'lucide-react';
import type { CodingReport, CodingReportProject, ProjectRunResult, ToolTrace } from '../../lib/api/agents';
import type { ProjectDeployment, PublishedLanding } from '../../lib/api/chats';
import { cn } from '../../lib/utils';
import { ToolTracePanel } from './ToolTracePanel';
import { ChatCodeBlock, ChatInlineCode } from './ChatCodeBlock';
import { Button } from '../ui/Button';

interface Attachment {
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  kind: 'image' | 'text' | 'file';
  url: string;
  text_preview?: string;
}

interface ChatMessageProps {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  authorLabel?: ReactNode;
  animateOnMount?: boolean;
  attachments?: Attachment[];
  toolTraces?: ToolTrace[];
  codingReport?: CodingReport | null;
  previewPageUrl?: string | null;
  canEditPreview?: boolean;
  onSavePreview?: (payload: { title?: string | null; html: string }) => Promise<void>;
  canRunProject?: boolean;
  onRunProject?: () => Promise<ProjectRunResult>;
  projectRunCount?: number | null;
  onFixProjectError?: (prompt: string) => Promise<void>;
  canManageDeployment?: boolean;
  onLoadProjectDeployment?: () => Promise<ProjectDeployment | null>;
  onUpsertProjectDeployment?: (payload: { env?: Record<string, string>; linked_agent_id?: string | null; set_telegram_webhook?: boolean }) => Promise<ProjectDeployment>;
  onStartProjectDeployment?: () => Promise<ProjectDeployment>;
  onReinstallProjectDeploymentWebhook?: () => Promise<ProjectDeployment>;
  onStopProjectDeployment?: () => Promise<ProjectDeployment>;
  publishedLanding?: PublishedLanding | null;
  publishingLanding?: boolean;
  onPublishLanding?: () => Promise<PublishedLanding>;
  onUpdateLanding?: (payload: { subdomain: string }) => Promise<PublishedLanding>;
  onUnpublishLanding?: () => Promise<void>;
  canEditMessage?: boolean;
  onEditMessage?: () => Promise<void> | void;
  canDeleteMessage?: boolean;
  onDeleteMessage?: () => Promise<void>;
  bubbleStyle?: CSSProperties;
}

function trimFixPayload(value: string, limit = 12_000): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n...[truncated]`;
}

function buildFixProjectPrompt(project: CodingReportProject, result: ProjectRunResult): string {
  const lines = [
    'Исправь ошибку в последнем runnable project bundle.',
    '',
    'Контекст запуска:',
    `- Runtime: ${project.runtime}`,
    `- Entrypoint: ${result.entrypoint ?? project.entrypoint ?? 'unknown'}`,
    `- Command: ${result.command.join(' ')}`,
    `- Status: ${result.status}`,
    `- Duration: ${result.duration_ms} ms`,
    `- Verification: ${result.verification.message}`,
    '',
    'stderr:',
    '```text',
    trimFixPayload(result.stderr || '(empty)'),
    '```',
    '',
    'stdout:',
    '```text',
    trimFixPayload(result.stdout || '(empty)'),
    '```',
    '',
    'Что нужно:',
    '1. Найди и исправь причину ошибки.',
    '2. Верни полный обновлённый runnable Project Bundle, а не только diff.',
    '3. Сохрани текущий runtime, если нет веской причины его менять.',
    '4. Убедись, что новый bundle проходит Run без этой ошибки.',
  ];

  return lines.join('\n');
}

function parseEnvText(value: string): Record<string, string> {
  const normalized: Record<string, string> = {};

  value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .forEach((line) => {
      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) return;
      const key = line.slice(0, separatorIndex).trim().toUpperCase();
      const envValue = line.slice(separatorIndex + 1);
      if (!/^[A-Z_][A-Z0-9_]{0,63}$/.test(key)) return;
      normalized[key] = envValue;
    });

  return normalized;
}

function formatEnvText(value: Record<string, string> | undefined): string {
  if (!value) return '';
  return Object.entries(value)
    .map(([key, envValue]) => `${key}=${envValue}`)
    .join('\n');
}

function looksLikeErrorLog(value: string): boolean {
  const text = value.trim().toLowerCase();
  if (!text) return false;

  return (
    text.includes('traceback')
    || text.includes('exception')
    || text.includes('error')
    || text.includes('failed')
    || text.includes('fatal')
    || /\b5\d\d\b/.test(text)
  );
}

function getLogLineClassName(line: string): string {
  const text = line.trim();
  if (!text) return 'text-slate-500';

  const lower = text.toLowerCase();
  const httpStatusMatch = text.match(/"\s+([1-5]\d{2})\b/) ?? text.match(/\bstatus(?:=|:)\s*([1-5]\d{2})\b/i);
  const statusCode = httpStatusMatch ? Number(httpStatusMatch[1]) : null;

  if (statusCode !== null) {
    if (statusCode >= 200 && statusCode < 300) return 'text-emerald-400';
    if (statusCode >= 300 && statusCode < 400) return 'text-sky-300';
    if (statusCode >= 400 && statusCode < 500) return 'text-amber-300';
    if (statusCode >= 500) return 'text-rose-300';
  }

  if (lower.includes('traceback') || lower.includes('exception') || lower.includes('fatal')) {
    return 'text-rose-300';
  }

  if (/\berror\b/i.test(text) || /\bfailed\b/i.test(text)) {
    return 'text-rose-300';
  }

  if (/\bwarn(?:ing)?\b/i.test(text)) {
    return 'text-amber-300';
  }

  if (/\binfo\b/i.test(text) || /\bstarted\b/i.test(text) || /\bstarting\b/i.test(text)) {
    return 'text-sky-200';
  }

  return 'text-slate-100';
}

function splitDeploymentLogLines(stdout: string, stderr: string): string[] {
  return [stdout, stderr]
    .filter((chunk) => chunk && chunk.trim())
    .join('\n')
    .replace(/\r\n/g, '\n')
    .split('\n');
}

function stripDevReportEnvelope(content: string): string {
  return content.replace(/<dev-report>\s*[\s\S]*?(?:\s*<\/dev-report>|$)/gi, '').trim();
}

function autolinkBareDomainsOutsideCode(content: string): string {
  const fencePattern = /(```[\s\S]*?```|`[^`\n]+`)/g;
  const bareDomainPattern = /(^|[\s([{"'«])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?:\/[^\s<]*)?)(?=[$\s)\]},"'».!?:;])/gim;

  return content
    .split(fencePattern)
    .map((part) => {
      if (!part) return part;
      if (part.startsWith('```') || (part.startsWith('`') && part.endsWith('`'))) {
        return part;
      }

      return part.replace(bareDomainPattern, (match, prefix: string, domain: string) => {
        const normalized = domain.toLowerCase();
        if (
          normalized.startsWith('http://')
          || normalized.startsWith('https://')
          || normalized.startsWith('www.')
          || prefix.includes('@')
        ) {
          return match;
        }

        return `${prefix}[${domain}](https://${domain})`;
      });
    })
    .join('');
}

function resolveBrowserUrl(url?: string | null): string | null {
  if (!url) return null;

  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
}

function withPreviewId(url: string, previewId: string): string {
  try {
    const nextUrl = new URL(url, window.location.origin);
    nextUrl.searchParams.set('previewId', previewId);
    return nextUrl.toString();
  } catch {
    return url;
  }
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

function formatUsdAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '$0';
  if (value < 0.0001) return '<$0.0001';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(3)}`;
}

function formatRubAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 ₽';
  if (value < 0.01) return '<0.01 ₽';
  return `${value.toFixed(2)} ₽`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Не было';
  return new Date(iso).toLocaleString('ru-RU');
}

function getRunStatusLabel(status: string): string {
  switch (status) {
    case 'completed':
      return 'Успешно';
    case 'failed':
      return 'Ошибка';
    case 'running':
      return 'Выполняется';
    case 'preparing':
      return 'Подготовка';
    case 'cancelled':
      return 'Отменён';
    default:
      return status;
  }
}

function getRunStatusTone(status: string): string {
  switch (status) {
    case 'completed':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'failed':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'running':
    case 'preparing':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    default:
      return 'border-border bg-muted/30 text-muted-foreground';
  }
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/70 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

function normalizeBlockText(value: string, indent: string): string {
  const lines = value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return '';
  return lines.map((line) => `${indent}${line}`).join('\n');
}

function beautifyHtml(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const root = doc.documentElement;
    const indentUnit = '  ';

    const formatNode = (node: Node, depth: number): string => {
      const indent = indentUnit.repeat(depth);
      const childIndent = indentUnit.repeat(depth + 1);

      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        return text ? `${indent}${text}` : '';
      }

      if (node.nodeType === Node.COMMENT_NODE) {
        const text = node.textContent?.trim() ?? '';
        return `${indent}<!--${text}-->`;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }

      const element = node as Element;
      const tag = element.tagName.toLowerCase();
      const attrs = Array.from(element.attributes)
        .map((attr) => ` ${attr.name}="${attr.value}"`)
        .join('');
      const openTag = `${indent}<${tag}${attrs}>`;

      if (VOID_TAGS.has(tag)) {
        return openTag;
      }

      if (tag === 'script' || tag === 'style') {
        const raw = normalizeBlockText(element.textContent ?? '', childIndent);
        return raw
          ? `${openTag}\n${raw}\n${indent}</${tag}>`
          : `${openTag}</${tag}>`;
      }

      if (tag === 'pre' || tag === 'textarea') {
        const raw = (element.textContent ?? '').replace(/\r\n/g, '\n');
        return `${openTag}${raw}</${tag}>`;
      }

      const childLines = Array.from(element.childNodes)
        .map((child) => formatNode(child, depth + 1))
        .filter(Boolean);

      if (childLines.length === 0) {
        return `${openTag}</${tag}>`;
      }

      if (
        childLines.length === 1
        && element.childNodes.length === 1
        && element.firstChild?.nodeType === Node.TEXT_NODE
      ) {
        return `${openTag}${element.textContent?.replace(/\s+/g, ' ').trim() ?? ''}</${tag}>`;
      }

      return `${openTag}\n${childLines.join('\n')}\n${indent}</${tag}>`;
    };

    return `<!DOCTYPE html>\n${formatNode(root, 0)}`.trim();
  } catch {
    return html;
  }
}

function getStringHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function slugifyFilename(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return slug || 'preview-project';
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let current = index;
    for (let bit = 0; bit < 8; bit += 1) {
      current = (current & 1) !== 0 ? (0xedb88320 ^ (current >>> 1)) : (current >>> 1);
    }
    table[index] = current >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function buildZipArchiveTextOnly(files: Array<{ name: string; content: string }>): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const contentBytes = encoder.encode(file.content);
    const checksum = crc32(contentBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0x0800);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, 0);
    writeUint16(localView, 12, 0);
    writeUint32(localView, 14, checksum);
    writeUint32(localView, 18, contentBytes.length);
    writeUint32(localView, 22, contentBytes.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, contentBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0x0800);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, 0);
    writeUint16(centralView, 14, 0);
    writeUint32(centralView, 16, checksum);
    writeUint32(centralView, 20, contentBytes.length);
    writeUint32(centralView, 24, contentBytes.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, offset);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + contentBytes.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, files.length);
  writeUint16(endView, 10, files.length);
  writeUint32(endView, 12, centralSize);
  writeUint32(endView, 16, offset);
  writeUint16(endView, 20, 0);

  const toBlobPart = (part: Uint8Array) => new Uint8Array(part).buffer;

  return new Blob(
    [...localParts, ...centralParts, endRecord].map(toBlobPart),
    { type: 'application/zip' },
  );
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function downloadPreviewProjectArchiveLegacy(preview: { title: string; html: string }) {
  const projectSlug = slugifyFilename(preview.title || 'preview-project');
  const readme = [
    `# ${preview.title || 'Preview project'}`,
    '',
    'Это standalone preview, экспортированный из LLMStore.',
    '',
    '## Файлы',
    '- `index.html` - готовая страница preview.',
    '',
    '## Как запустить',
    '1. Распакуйте архив.',
    '2. Откройте `index.html` в браузере.',
    '3. Если нужны локальные запросы или модули, поднимите простой static server в этой папке.',
  ].join('\n');

  const zip = buildZipArchive([
    { name: `${projectSlug}/index.html`, content: preview.html },
    { name: `${projectSlug}/README.md`, content: readme },
  ]);

  downloadBlob(`${projectSlug}.zip`, zip);
}

type ZipArchiveFile = {
  name: string;
  content: string | Uint8Array;
};

type OfflineAssetStore = {
  files: ZipArchiveFile[];
  pathBySource: Map<string, string>;
  usedPaths: Set<string>;
};

const ZIP_ENCODER = new TextEncoder();
const EMOJI_REGEX = /\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?/gu;

function toZipContentBytes(content: string | Uint8Array): Uint8Array {
  return typeof content === 'string' ? ZIP_ENCODER.encode(content) : content;
}

function sanitizeArchivePathSegment(value: string, fallback: string): string {
  const normalized = value
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map((segment) => segment
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('/');

  return normalized || fallback;
}

function getFileExtensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/(\.[a-z0-9]+)$/i);
    return match?.[1]?.toLowerCase() ?? '';
  } catch {
    return '';
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createOfflineAssetStore(): OfflineAssetStore {
  return {
    files: [],
    pathBySource: new Map<string, string>(),
    usedPaths: new Set<string>(),
  };
}

function allocateAssetPath(store: OfflineAssetStore, preferredPath: string): string {
  const normalized = sanitizeArchivePathSegment(preferredPath, `assets/file-${store.files.length + 1}`);
  if (!store.usedPaths.has(normalized)) {
    store.usedPaths.add(normalized);
    return normalized;
  }

  const extMatch = normalized.match(/(\.[a-z0-9]+)$/i);
  const ext = extMatch?.[1] ?? '';
  const base = ext ? normalized.slice(0, -ext.length) : normalized;

  for (let index = 2; index < 5000; index += 1) {
    const candidate = `${base}-${index}${ext}`;
    if (!store.usedPaths.has(candidate)) {
      store.usedPaths.add(candidate);
      return candidate;
    }
  }

  const fallback = `${base}-${Date.now()}${ext}`;
  store.usedPaths.add(fallback);
  return fallback;
}

async function fetchBinary(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Не удалось скачать ассет: ${url}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Не удалось скачать ресурс: ${url}`);
  }

  return response.text();
}

async function registerBinaryAsset(
  store: OfflineAssetStore,
  sourceUrl: string,
  preferredPath: string,
): Promise<string> {
  const existingPath = store.pathBySource.get(sourceUrl);
  if (existingPath) {
    return existingPath;
  }

  const assetPath = allocateAssetPath(store, preferredPath);
  const content = await fetchBinary(sourceUrl);
  store.files.push({ name: assetPath, content });
  store.pathBySource.set(sourceUrl, assetPath);
  return assetPath;
}

async function localizeFontUrlsInCss(
  cssText: string,
  baseUrl: string,
  store: OfflineAssetStore,
): Promise<string> {
  const matches = Array.from(cssText.matchAll(/url\(([^)]+)\)/gi));
  let nextCss = cssText;

  for (const match of matches) {
    const rawUrl = match[1]?.trim().replace(/^['"]|['"]$/g, '');
    if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('#')) {
      continue;
    }

    let resolvedUrl: string;
    try {
      resolvedUrl = new URL(rawUrl, baseUrl).toString();
    } catch {
      continue;
    }

    const ext = getFileExtensionFromUrl(resolvedUrl);
    if (!['.woff', '.woff2', '.ttf', '.otf'].includes(ext)) {
      continue;
    }

    const localPath = await registerBinaryAsset(
      store,
      resolvedUrl,
      `assets/fonts/font-${getStringHash(resolvedUrl)}${ext || '.woff2'}`,
    );
    nextCss = nextCss.replace(
      new RegExp(escapeRegExp(match[0]), 'g'),
      `url('${localPath}')`,
    );
  }

  return nextCss;
}

async function loadGoogleFontsCss(url: string, store: OfflineAssetStore): Promise<string> {
  const cssText = await fetchText(url);
  return localizeFontUrlsInCss(cssText, url, store);
}

async function inlineGoogleFontImports(cssText: string, store: OfflineAssetStore): Promise<string> {
  const matches = Array.from(cssText.matchAll(/@import\s+url\(([^)]+)\)\s*;?/gi));
  let nextCss = cssText;

  for (const match of matches) {
    const rawUrl = match[1]?.trim().replace(/^['"]|['"]$/g, '');
    if (!rawUrl) {
      continue;
    }

    let resolvedUrl: string;
    try {
      resolvedUrl = new URL(rawUrl, window.location.origin).toString();
    } catch {
      continue;
    }

    if (!/fonts\.googleapis\.com/i.test(resolvedUrl)) {
      continue;
    }

    const inlinedCss = await loadGoogleFontsCss(resolvedUrl, store);
    nextCss = nextCss.replace(match[0], `${inlinedCss}\n`);
  }

  return nextCss;
}

function toEmojiCodePoint(value: string): string {
  return Array.from(value)
    .map((symbol) => symbol.codePointAt(0)?.toString(16))
    .filter((code): code is string => Boolean(code) && code !== 'fe0f')
    .join('-');
}

function collectEmojiCodes(value: string): string[] {
  const codes = new Set<string>();
  EMOJI_REGEX.lastIndex = 0;
  for (const match of value.matchAll(EMOJI_REGEX)) {
    const code = toEmojiCodePoint(match[0] ?? '');
    if (code) {
      codes.add(code);
    }
  }
  return [...codes];
}

async function addEmojiAssets(store: OfflineAssetStore, html: string): Promise<string[]> {
  const codes = collectEmojiCodes(html);
  const downloadedCodes: string[] = [];

  for (const code of codes) {
    try {
      await registerBinaryAsset(
        store,
        new URL(`/api/emoji/${code}.svg`, window.location.origin).toString(),
        `assets/emoji/${code}.svg`,
      );
      downloadedCodes.push(code);
    } catch {
      // Keep native emoji as fallback when a local asset cannot be fetched.
    }
  }

  return downloadedCodes;
}

function injectOfflineEmojiBridge(html: string, assetBase = './assets/emoji/'): string {
  const bridgeStyles = `
<style id="llmstore-offline-emoji-support">
.llmstore-emoji-fallback {
  display: inline-block !important;
  width: 1em !important;
  height: 1em !important;
  vertical-align: -0.12em !important;
  object-fit: contain !important;
}
.llmstore-emoji-native {
  display: inline !important;
}
.llmstore-emoji-attr::before {
  content: '' !important;
  background-image: var(--llmstore-emoji-url) !important;
  background-repeat: no-repeat !important;
  background-size: contain !important;
  background-position: center !important;
}
</style>`;

  const bridgeScript = `
<script>
(() => {
  const emojiRegex = /\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?/gu;
  const emojiAssetBase = ${JSON.stringify(assetBase)};
  const unsupportedEmojiCodes = new Set();

  const shouldSkipEmojiWrap = (node) => {
    const parent = node.parentElement;
    if (!parent) return true;
    return !!parent.closest('script, style, textarea, input, option, .llmstore-emoji-native');
  };

  const toEmojiCodePoint = (value) => Array.from(value)
    .map((symbol) => symbol.codePointAt(0)?.toString(16))
    .filter((code) => code && code !== 'fe0f')
    .join('-');

  const createNativeEmojiSpan = (value, code) => {
    const span = document.createElement('span');
    span.className = 'llmstore-emoji-native';
    span.textContent = value;
    if (code) {
      span.dataset.llmstoreEmojiCode = code;
    }
    return span;
  };

  const wrapEmojiTextNode = (node) => {
    if (!node.nodeValue) return;
    emojiRegex.lastIndex = 0;
    if (!emojiRegex.test(node.nodeValue)) return;
    emojiRegex.lastIndex = 0;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    const matches = node.nodeValue.matchAll(emojiRegex);

    for (const match of matches) {
      const value = match[0];
      const code = toEmojiCodePoint(value);
      const index = match.index ?? 0;
      if (index > lastIndex) {
        fragment.appendChild(document.createTextNode(node.nodeValue.slice(lastIndex, index)));
      }

      if (!code || unsupportedEmojiCodes.has(code)) {
        fragment.appendChild(createNativeEmojiSpan(value, code));
        lastIndex = index + value.length;
        continue;
      }

      const img = document.createElement('img');
      img.className = 'llmstore-emoji-fallback';
      img.alt = value;
      img.src = emojiAssetBase + code + '.svg';
      img.decoding = 'async';
      img.loading = 'lazy';
      img.draggable = false;
      img.onerror = () => {
        unsupportedEmojiCodes.add(code);
        img.replaceWith(createNativeEmojiSpan(value, code));
      };
      fragment.appendChild(img);
      lastIndex = index + value.length;
    }

    if (lastIndex < node.nodeValue.length) {
      fragment.appendChild(document.createTextNode(node.nodeValue.slice(lastIndex)));
    }

    node.parentNode?.replaceChild(fragment, node);
  };

  const applyEmojiFallback = (root = document.body) => {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let current;
    while ((current = walker.nextNode())) {
      if (!shouldSkipEmojiWrap(current)) textNodes.push(current);
    }
    for (const textNode of textNodes) {
      wrapEmojiTextNode(textNode);
    }
  };

  window.addEventListener('load', () => applyEmojiFallback());
  window.addEventListener('DOMContentLoaded', () => applyEmojiFallback());
  applyEmojiFallback();
})();
</script>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${bridgeStyles}${bridgeScript}</body>`);
  }

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${bridgeStyles}${bridgeScript}</head>`);
  }

  return `${bridgeStyles}${bridgeScript}${html}`;
}

async function buildStandalonePreviewHtml(previewHtml: string): Promise<{ html: string; assets: ZipArchiveFile[] }> {
  const store = createOfflineAssetStore();
  const parser = new DOMParser();
  const doc = parser.parseFromString(previewHtml, 'text/html');

  doc.querySelectorAll(
    'link[rel~="icon"], link[rel="manifest"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"], link[rel="mask-icon"]',
  ).forEach((node) => node.remove());

  for (const link of Array.from(doc.querySelectorAll('link[rel~="stylesheet"][href]'))) {
    const href = link.getAttribute('href');
    if (!href) continue;

    let resolvedUrl: string;
    try {
      resolvedUrl = new URL(href, window.location.origin).toString();
    } catch {
      continue;
    }

    if (!/fonts\.googleapis\.com/i.test(resolvedUrl)) {
      continue;
    }

    try {
      const style = doc.createElement('style');
      style.textContent = await loadGoogleFontsCss(resolvedUrl, store);
      link.replaceWith(style);
    } catch {
      // Leave the original link in place if the stylesheet cannot be localized.
    }
  }

  for (const style of Array.from(doc.querySelectorAll('style'))) {
    try {
      style.textContent = await inlineGoogleFontImports(style.textContent ?? '', store);
    } catch {
      // Keep the original CSS when inlining fails.
    }
  }

  const emojiCodes = await addEmojiAssets(store, doc.documentElement.outerHTML);
  if (emojiCodes.length > 0) {
    for (const element of Array.from(doc.querySelectorAll<HTMLElement>('[data-emoji]'))) {
      const emojiValue = element.getAttribute('data-emoji') ?? '';
      const code = toEmojiCodePoint(emojiValue);
      if (!code || !emojiCodes.includes(code)) continue;
      element.classList.add('llmstore-emoji-attr');
      element.style.setProperty('--llmstore-emoji-url', `url('./assets/emoji/${code}.svg')`);
    }
  }

  let html = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
  html = injectOfflineEmojiBridge(html);
  return {
    html,
    assets: store.files,
  };
}

function buildZipArchive(files: ZipArchiveFile[]): Blob {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = ZIP_ENCODER.encode(file.name);
    const contentBytes = toZipContentBytes(file.content);
    const checksum = crc32(contentBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0x0800);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, 0);
    writeUint16(localView, 12, 0);
    writeUint32(localView, 14, checksum);
    writeUint32(localView, 18, contentBytes.length);
    writeUint32(localView, 22, contentBytes.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, contentBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0x0800);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, 0);
    writeUint16(centralView, 14, 0);
    writeUint32(centralView, 16, checksum);
    writeUint32(centralView, 20, contentBytes.length);
    writeUint32(centralView, 24, contentBytes.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, offset);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + contentBytes.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, files.length);
  writeUint16(endView, 10, files.length);
  writeUint32(endView, 12, centralSize);
  writeUint32(endView, 16, offset);
  writeUint16(endView, 20, 0);

  const toBlobPart = (part: Uint8Array) => new Uint8Array(part).buffer;

  return new Blob(
    [...localParts, ...centralParts, endRecord].map(toBlobPart),
    { type: 'application/zip' },
  );
}

function getProjectRuntimeLabel(runtime: CodingReportProject['runtime']): string {
  switch (runtime) {
    case 'node':
      return 'Node.js';
    case 'python':
      return 'Python';
    case 'static':
      return 'Static HTML';
    default:
      return 'Generic';
  }
}

function buildProjectManifest(project: CodingReportProject, fallbackTitle: string): string {
  return JSON.stringify({
    title: project.title || fallbackTitle,
    runtime: project.runtime,
    root_dir: project.root_dir ?? null,
    entrypoint: project.entrypoint ?? null,
    install: project.install ?? [],
    run: project.run ?? [],
    test: project.test ?? [],
    notes: project.notes ?? [],
    files: project.files.map((file) => ({
      path: file.path,
      summary: file.summary ?? null,
      language: file.language ?? null,
      entrypoint: Boolean(file.entrypoint),
    })),
  }, null, 2);
}

function buildProjectReadme(project: CodingReportProject, fallbackTitle: string): string {
  const lines = [
    `# ${project.title || fallbackTitle}`,
    '',
    `Runtime: ${getProjectRuntimeLabel(project.runtime)}`,
    project.entrypoint ? `Entrypoint: \`${project.entrypoint}\`` : null,
    project.root_dir ? `Root dir: \`${project.root_dir}\`` : null,
    '',
    '## Files',
    ...project.files.map((file) => `- \`${file.path}\`${file.summary ? ` - ${file.summary}` : ''}`),
    '',
  ].filter((line): line is string => line !== null);

  if (project.install && project.install.length > 0) {
    lines.push('## Install');
    lines.push(...project.install.map((command) => `- \`${command}\``));
    lines.push('');
  }

  if (project.run && project.run.length > 0) {
    lines.push('## Run');
    lines.push(...project.run.map((command) => `- \`${command}\``));
    lines.push('');
  }

  if (project.test && project.test.length > 0) {
    lines.push('## Verify');
    lines.push(...project.test.map((command) => `- \`${command}\``));
    lines.push('');
  }

  if (project.notes && project.notes.length > 0) {
    lines.push('## Notes');
    lines.push(...project.notes.map((note) => `- ${note}`));
    lines.push('');
  }

  lines.push('Собрано из LLMStore project bundle.');
  return lines.join('\n');
}

function buildShellScript(commands: string[], shell: 'bash' | 'powershell'): string {
  if (shell === 'powershell') {
    return [
      '$ErrorActionPreference = \'Stop\'',
      ...commands,
      '',
    ].join('\n');
  }

  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    ...commands,
    '',
  ].join('\n');
}

function buildProjectBundleArchive(project: CodingReportProject, fallbackTitle: string): Blob {
  const projectSlug = slugifyFilename(project.title || fallbackTitle || 'project-bundle');
  const files: ZipArchiveFile[] = [];

  for (const file of project.files) {
    files.push({
      name: `${projectSlug}/${sanitizeArchivePathSegment(file.path, `file-${files.length + 1}.txt`)}`,
      content: file.content,
    });
  }

  files.push({
    name: `${projectSlug}/README.md`,
    content: buildProjectReadme(project, fallbackTitle),
  });
  files.push({
    name: `${projectSlug}/llmstore.project.json`,
    content: buildProjectManifest(project, fallbackTitle),
  });

  if (project.run && project.run.length > 0) {
    files.push({
      name: `${projectSlug}/run.ps1`,
      content: buildShellScript(project.run, 'powershell'),
    });
    files.push({
      name: `${projectSlug}/run.sh`,
      content: buildShellScript(project.run, 'bash'),
    });
  }

  if (project.test && project.test.length > 0) {
    files.push({
      name: `${projectSlug}/verify.ps1`,
      content: buildShellScript(project.test, 'powershell'),
    });
    files.push({
      name: `${projectSlug}/verify.sh`,
      content: buildShellScript(project.test, 'bash'),
    });
  }

  return buildZipArchive(files);
}

async function downloadPreviewProjectArchive(preview: { title: string; html: string }) {
  const projectSlug = slugifyFilename(preview.title || 'preview-project');
  const standalone = await buildStandalonePreviewHtml(preview.html);
  const readme = [
    `# ${preview.title || 'Preview project'}`,
    '',
    'Это standalone preview, экспортированный из LLMStore.',
    '',
    '## Файлы',
    '- `index.html` - автономная страница preview.',
    '- `assets/` - локальные шрифты и emoji-ассеты, если они были нужны.',
    '',
    '## Как запустить',
    '1. Распакуйте архив.',
    '2. Откройте `index.html` в браузере.',
    '3. Если preview использует локальные запросы или модули, поднимите простой static server в этой папке.',
  ].join('\n');

  const zip = buildZipArchive([
    { name: `${projectSlug}/index.html`, content: standalone.html },
    { name: `${projectSlug}/README.md`, content: readme },
    ...standalone.assets.map((asset) => ({
      name: `${projectSlug}/${asset.name}`,
      content: asset.content,
    })),
  ]);

  downloadBlob(`${projectSlug}.zip`, zip);
}

function highlightHtmlAttributes(attrs: string): string {
  return attrs.replace(
    /(\s+)([^\s=/>]+)(\s*=\s*(?:&quot;.*?&quot;|&#39;.*?&#39;|[^\s"'=<>`]+))?/g,
    (_match, spacing: string, name: string, valueChunk?: string) => {
      if (!valueChunk) {
        return `${spacing}<span class="text-amber-600">${name}</span>`;
      }

      const eqMatch = valueChunk.match(/^(\s*=\s*)([\s\S]+)$/);
      if (!eqMatch) {
        return `${spacing}<span class="text-amber-600">${name}</span>${valueChunk}`;
      }

      return `${spacing}<span class="text-amber-600">${name}</span><span class="text-slate-500">${eqMatch[1]}</span><span class="text-emerald-700">${eqMatch[2]}</span>`;
    },
  );
}

function highlightHtmlCode(value: string): string {
  const placeholders: string[] = [];
  const stash = (html: string) => `___LLMSTORE_HTML_TOKEN_${placeholders.push(html) - 1}___`;
  const escapeHtml = (source: string) => source
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  let escaped = escapeHtml(value);

  escaped = escaped.replace(
    /&lt;!--[\s\S]*?--&gt;/g,
    (match) => stash(`<span class="text-slate-400">${match}</span>`),
  );

  escaped = escaped.replace(
    /&lt;!DOCTYPE[\s\S]*?&gt;/gi,
    (match) => stash(`<span class="text-fuchsia-600">${match}</span>`),
  );

  escaped = escaped.replace(
    /(&lt;\/?)([A-Za-z][\w:-]*)([\s\S]*?)(\/?&gt;)/g,
    (_match, open: string, tagName: string, attrs: string, close: string) => (
      `<span class="text-slate-500">${open}</span>`
      + `<span class="text-sky-700">${tagName}</span>`
      + highlightHtmlAttributes(attrs)
      + `<span class="text-slate-500">${close}</span>`
    ),
  );

  return escaped.replace(
    /___LLMSTORE_HTML_TOKEN_(\d+)___/g,
    (_match, index: string) => placeholders[Number(index)] ?? '',
  );
}

function forceStandardPreviewFavicon(html: string): string {
  const faviconMarkup = `
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/png" href="/icon.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">`;

  const cleaned = html
    .replace(/<link\b[^>]*\brel\s*=\s*["'][^"']*\b(?:shortcut\s+icon|icon|apple-touch-icon|apple-touch-icon-precomposed|mask-icon)\b[^"']*["'][^>]*>\s*/gi, '')
    .replace(/<link\b[^>]*\brel\s*=\s*["']manifest["'][^>]*>\s*/gi, '');

  if (/<\/head>/i.test(cleaned)) {
    return cleaned.replace(/<\/head>/i, `${faviconMarkup}\n</head>`);
  }

  if (/<html[^>]*>/i.test(cleaned)) {
    return cleaned.replace(/<html([^>]*)>/i, `<html$1><head>${faviconMarkup}</head>`);
  }

  return `<head>${faviconMarkup}</head>${cleaned}`;
}

function injectPreviewBridge(html: string, previewId: string): string {
  const htmlWithFavicon = forceStandardPreviewFavicon(html);
  const emojiAssetVersion = '20260401b';
  const bridge = `
<style id="llmstore-preview-emoji-bridge">
html, body {
  max-width: 100% !important;
  overflow-x: hidden !important;
}
body {
  overflow-wrap: break-word !important;
}
*, *::before, *::after {
  box-sizing: border-box;
}
img, svg, video, canvas, iframe, embed, object {
  max-width: 100% !important;
}
table {
  max-width: 100% !important;
  display: block;
  overflow-x: auto;
}
.llmstore-emoji-fallback {
  display: inline-block !important;
  width: 1em !important;
  height: 1em !important;
  vertical-align: -0.12em !important;
  object-fit: contain !important;
}
.llmstore-emoji-native {
  display: inline !important;
}
</style>
<script>
(() => {
  const previewId = ${JSON.stringify(previewId)};
  const emojiRegex = /\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?/gu;
  const previewOrigin = typeof window.__LLMSTORE_PREVIEW_ORIGIN__ === 'string' && window.__LLMSTORE_PREVIEW_ORIGIN__
    ? window.__LLMSTORE_PREVIEW_ORIGIN__
    : window.location.origin;
  const emojiAssetBase = new URL('/api/emoji/', previewOrigin).toString();
  const unsupportedEmojiCodes = new Set();

  const shouldSkipEmojiWrap = (node) => {
    const parent = node.parentElement;
    if (!parent) return true;
    return !!parent.closest('script, style, textarea, input, option, .llmstore-emoji-native');
  };

  const toEmojiCodePoint = (value) => Array.from(value)
    .map((symbol) => symbol.codePointAt(0)?.toString(16))
    .filter((code) => code && code !== 'fe0f')
    .join('-');

  const createNativeEmojiSpan = (value, code) => {
    const span = document.createElement('span');
    span.className = 'llmstore-emoji-native';
    span.textContent = value;
    if (code) {
      span.dataset.llmstoreEmojiCode = code;
    }
    return span;
  };

  const wrapEmojiTextNode = (node) => {
    if (!node.nodeValue) return;
    emojiRegex.lastIndex = 0;
    if (!emojiRegex.test(node.nodeValue)) return;
    emojiRegex.lastIndex = 0;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    const matches = node.nodeValue.matchAll(emojiRegex);

    for (const match of matches) {
      const value = match[0];
      const code = toEmojiCodePoint(value);
      const index = match.index ?? 0;
      if (index > lastIndex) {
        fragment.appendChild(document.createTextNode(node.nodeValue.slice(lastIndex, index)));
      }

      if (!code || unsupportedEmojiCodes.has(code)) {
        fragment.appendChild(createNativeEmojiSpan(value, code));
        lastIndex = index + value.length;
        continue;
      }

      const img = document.createElement('img');
      img.className = 'llmstore-emoji-fallback';
      img.alt = value;
      img.src = emojiAssetBase + code + '.svg?v=${emojiAssetVersion}';
      img.decoding = 'async';
      img.loading = 'lazy';
      img.draggable = false;
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => {
        unsupportedEmojiCodes.add(code);
        img.replaceWith(createNativeEmojiSpan(value, code));
      };
      fragment.appendChild(img);

      lastIndex = index + value.length;
    }

    if (lastIndex < node.nodeValue.length) {
      fragment.appendChild(document.createTextNode(node.nodeValue.slice(lastIndex)));
    }

    node.parentNode?.replaceChild(fragment, node);
  };

  const applyEmojiFallback = (root = document.body) => {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let current;
    while ((current = walker.nextNode())) {
      if (!shouldSkipEmojiWrap(current)) textNodes.push(current);
    }
    for (const textNode of textNodes) {
      wrapEmojiTextNode(textNode);
    }
  };

  const sendState = () => {
    try {
      window.parent.postMessage({
        type: 'llmstore-preview-state',
        previewId,
        href: window.location.href,
        title: document.title || ''
      }, '*');
    } catch {}
  };

  const wrapHistory = (method) => {
    const original = history[method];
    if (typeof original !== 'function') return;
    history[method] = function(...args) {
      const result = original.apply(this, args);
      setTimeout(sendState, 0);
      return result;
    };
  };

  wrapHistory('pushState');
  wrapHistory('replaceState');
  window.addEventListener('load', () => {
    applyEmojiFallback();
    sendState();
  });
  window.addEventListener('DOMContentLoaded', () => applyEmojiFallback());
  window.addEventListener('hashchange', sendState);
  window.addEventListener('popstate', sendState);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) applyEmojiFallback(node);
        if (node instanceof Text && !shouldSkipEmojiWrap(node)) wrapEmojiTextNode(node);
      }
    }
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.type !== 'llmstore-preview-command' || data.previewId !== previewId) return;
    if (data.command === 'reload') window.location.reload();
    if (data.command === 'back') history.back();
    if (data.command === 'forward') history.forward();
  });
  applyEmojiFallback();
  sendState();
})();
</script>`;

  if (/<\/body>/i.test(htmlWithFavicon)) {
    return htmlWithFavicon.replace(/<\/body>/i, `${bridge}</body>`);
  }

  if (/<head[^>]*>/i.test(htmlWithFavicon)) {
    return htmlWithFavicon.replace(/<head[^>]*>/i, (match) => `${match}${bridge}`);
  }

  return `${bridge}${htmlWithFavicon}`;
}

function HtmlPreviewBrowser({
  html,
  title,
  previewPageUrl,
  revisionKey,
  className,
}: {
  html: string;
  title: string;
  previewPageUrl?: string | null;
  revisionKey?: string;
  className?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [previewId] = useState(() => `preview-${Math.random().toString(36).slice(2, 10)}`);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const resolvedPreviewPageUrl = resolveBrowserUrl(previewPageUrl);
  const embeddedPreviewUrl = resolvedPreviewPageUrl
    ? `${resolvedPreviewPageUrl}${resolvedPreviewPageUrl.includes('?') ? '&' : '?'}previewId=${encodeURIComponent(previewId)}${revisionKey ? `&rev=${encodeURIComponent(revisionKey)}` : ''}`
    : null;
  const [currentHref, setCurrentHref] = useState(resolvedPreviewPageUrl || 'about:blank');
  const [historyEntries, setHistoryEntries] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    if (resolvedPreviewPageUrl) {
      setObjectUrl(null);
      setCurrentHref(resolvedPreviewPageUrl);
      setHistoryEntries([resolvedPreviewPageUrl]);
      setHistoryIndex(0);
      return;
    }

    const blob = new Blob([injectPreviewBridge(html, previewId)], { type: 'text/html' });
    const nextUrl = URL.createObjectURL(blob);
    setObjectUrl(nextUrl);
    setCurrentHref(nextUrl);
    setHistoryEntries([nextUrl]);
    setHistoryIndex(0);

    return () => URL.revokeObjectURL(nextUrl);
  }, [html, previewId, resolvedPreviewPageUrl]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        previewId?: string;
        href?: string;
        title?: string;
      };
      if (!data || data.type !== 'llmstore-preview-state' || data.previewId !== previewId) return;

      const nextHref = typeof data.href === 'string' && data.href.length > 0
        ? data.href
        : (resolvedPreviewPageUrl ?? objectUrl ?? 'about:blank');

      setCurrentHref(nextHref);
      setHistoryEntries((prev) => {
        if (prev.length === 0) {
          setHistoryIndex(0);
          return [nextHref];
        }

        if (prev[historyIndex] === nextHref) return prev;

        const existingIndex = prev.lastIndexOf(nextHref);
        if (existingIndex >= 0) {
          setHistoryIndex(existingIndex);
          return prev;
        }

        const nextHistory = [...prev.slice(0, historyIndex + 1), nextHref];
        setHistoryIndex(nextHistory.length - 1);
        return nextHistory.slice(-24);
      });
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [historyIndex, objectUrl, previewId, resolvedPreviewPageUrl]);

  const sendCommand = (command: 'reload' | 'back' | 'forward') => {
    iframeRef.current?.contentWindow?.postMessage({
      type: 'llmstore-preview-command',
      previewId,
      command,
    }, '*');
  };

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex >= 0 && historyIndex < historyEntries.length - 1;
  const shareableHref = currentHref
    && !currentHref.startsWith('about:')
    && !currentHref.startsWith('blob:')
    ? currentHref
    : (resolvedPreviewPageUrl ?? currentHref);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="rounded-md border border-border/70 bg-background/80 p-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="whitespace-nowrap" onClick={() => sendCommand('back')} disabled={!canGoBack}>
            Back
          </Button>
          <Button type="button" variant="outline" size="sm" className="whitespace-nowrap" onClick={() => sendCommand('forward')} disabled={!canGoForward}>
            Forward
          </Button>
          <Button type="button" variant="outline" size="sm" className="whitespace-nowrap" onClick={() => sendCommand('reload')} disabled={!(embeddedPreviewUrl || objectUrl)}>
            Reload
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="whitespace-nowrap"
            onClick={async () => {
              await navigator.clipboard.writeText(shareableHref || 'about:blank');
            }}
            disabled={!shareableHref}
          >
            Copy Link
          </Button>
        </div>
        <div className="mt-2 min-w-0 w-full rounded-md border border-border/70 bg-muted/50 px-3 py-1.5">
          <p className="truncate font-mono text-xs text-foreground" title={shareableHref || 'about:blank'}>
            {shareableHref || 'about:blank'}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-md border bg-white">
        {objectUrl && (
          <iframe
            ref={iframeRef}
            title={title}
            src={embeddedPreviewUrl ?? objectUrl}
            sandbox="allow-scripts"
            className="h-full w-full bg-white"
          />
        )}

        {!objectUrl && embeddedPreviewUrl && (
          <iframe
            ref={iframeRef}
            title={title}
            src={embeddedPreviewUrl}
            sandbox="allow-scripts"
            className="h-full w-full bg-white"
          />
        )}
      </div>
    </div>
  );
}

export function ChatMessage({
  role,
  content,
  authorLabel = null,
  animateOnMount = false,
  attachments = [],
  toolTraces = [],
  codingReport = null,
  previewPageUrl = null,
  canEditPreview = false,
  onSavePreview,
  canRunProject = false,
  onRunProject,
  projectRunCount = null,
  onFixProjectError,
  canManageDeployment = false,
  onLoadProjectDeployment,
  onUpsertProjectDeployment,
  onStartProjectDeployment,
  onReinstallProjectDeploymentWebhook,
  onStopProjectDeployment,
  publishedLanding,
  publishingLanding = false,
  onPublishLanding,
  onUpdateLanding,
  onUnpublishLanding,
  canEditMessage = false,
  onEditMessage,
  canDeleteMessage = false,
  onDeleteMessage,
  bubbleStyle,
}: ChatMessageProps) {
  const isUser = role === 'user';
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewAlt, setPreviewAlt] = useState('');
  const [htmlPreview, setHtmlPreview] = useState<{ title: string; html: string } | null>(null);
  const [projectRunResultFullscreen, setProjectRunResultFullscreen] = useState<ProjectRunResult | null>(null);
  const [previewEditor, setPreviewEditor] = useState<{ title: string; html: string } | null>(null);
  const [previewExporting, setPreviewExporting] = useState(false);
  const [projectExporting, setProjectExporting] = useState(false);
  const [projectRunning, setProjectRunning] = useState(false);
  const [projectFixing, setProjectFixing] = useState(false);
  const [projectRunResult, setProjectRunResult] = useState<ProjectRunResult | null>(null);
  const [projectDeployment, setProjectDeployment] = useState<ProjectDeployment | null>(null);
  const [projectDeploymentLoading, setProjectDeploymentLoading] = useState(false);
  const [projectDeploying, setProjectDeploying] = useState(false);
  const [projectStartingDeployment, setProjectStartingDeployment] = useState(false);
  const [projectReinstallingWebhook, setProjectReinstallingWebhook] = useState(false);
  const [projectStoppingDeployment, setProjectStoppingDeployment] = useState(false);
  const [projectDeploymentError, setProjectDeploymentError] = useState<string | null>(null);
  const [projectDeploymentStatus, setProjectDeploymentStatus] = useState<string | null>(null);
  const [projectDeploymentEditorOpen, setProjectDeploymentEditorOpen] = useState(false);
  const [projectDeploymentEnvText, setProjectDeploymentEnvText] = useState('');
  const [projectDeploymentLinkedAgentId, setProjectDeploymentLinkedAgentId] = useState('');
  const [projectDeploymentSetTelegramWebhook, setProjectDeploymentSetTelegramWebhook] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorExporting, setEditorExporting] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorStatus, setEditorStatus] = useState<string | null>(null);
  const [messageActionError, setMessageActionError] = useState<string | null>(null);
  const [messageActionStatus, setMessageActionStatus] = useState<string | null>(null);
  const [deletingMessage, setDeletingMessage] = useState(false);
  const [editingMessage, setEditingMessage] = useState(false);
  const editorTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editorHighlightRef = useRef<HTMLPreElement | null>(null);
  const editorHistoryRef = useRef<string[]>([]);
  const editorHistoryIndexRef = useRef(-1);
  const editorStatusTimeoutRef = useRef<number | null>(null);
  const beautifyAppliedSourceHashesRef = useRef<Set<string>>(new Set());
  const isEditorOpen = Boolean(previewEditor);
  const absolutePreviewPageUrl = resolveBrowserUrl(previewPageUrl);
  const renderUserAsMarkdown = isUser && /(^|\n)```|`[^`\n]+`|(^|\n)(?:[-*]|\d+\.)\s/m.test(content);
  const renderedContent = (!isUser || renderUserAsMarkdown)
    ? autolinkBareDomainsOutsideCode(stripDevReportEnvelope(content))
    : content;
  const propHtmlPreview = codingReport?.preview?.type === 'html' && codingReport.preview.html
    ? {
      title: codingReport.preview.title || 'Agent preview',
      html: codingReport.preview.html,
    }
    : null;
  const [previewOverride, setPreviewOverride] = useState<{ title: string; html: string } | null>(propHtmlPreview);
  const projectBundle = codingReport?.project && codingReport.project.files.length > 0
    ? codingReport.project
    : null;
  const canDeployProject = Boolean(
    projectBundle
    && canManageDeployment
    && onUpsertProjectDeployment
    && onLoadProjectDeployment
    && (projectBundle.runtime === 'node' || projectBundle.runtime === 'python'),
  );
  const showDeploymentOwnerHint = Boolean(
    projectBundle
    && (projectBundle.runtime === 'node' || projectBundle.runtime === 'python')
    && !canManageDeployment,
  );
  const displayedProjectRunCount = projectRunResult?.project_run_count ?? projectRunCount ?? 0;
  const resolvedHtmlPreview = previewOverride ?? propHtmlPreview;
  const highlightedEditorHtml = useMemo(
    () => (previewEditor ? highlightHtmlCode(previewEditor.html) : ''),
    [previewEditor],
  );
  const resolvedPreviewRevision = resolvedHtmlPreview ? getStringHash(resolvedHtmlPreview.html) : undefined;
  const editorBusy = editorSaving || editorExporting;
  const messageActionBusy = deletingMessage || editingMessage;
  const onLoadProjectDeploymentRef = useRef(onLoadProjectDeployment);
  const deploymentPollingTimerRef = useRef<number | null>(null);

  onLoadProjectDeploymentRef.current = onLoadProjectDeployment;

  useEffect(() => {
    if (!isEditorOpen || !previewEditor) return;
    editorHistoryRef.current = [previewEditor.html];
    editorHistoryIndexRef.current = 0;
    setEditorStatus(null);
    editorTextareaRef.current?.focus();
  }, [isEditorOpen]);

  useEffect(() => () => {
    if (editorStatusTimeoutRef.current) {
      window.clearTimeout(editorStatusTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    setPreviewOverride(propHtmlPreview);
  }, [propHtmlPreview?.title, propHtmlPreview?.html]);

  useEffect(() => {
    if (!canDeployProject || !onLoadProjectDeploymentRef.current) return;

    let cancelled = false;

    const loadDeployment = async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setProjectDeploymentLoading(true);
      }
      setProjectDeploymentError(null);
      try {
        const deployment = await onLoadProjectDeploymentRef.current?.();
        if (cancelled) return;
        setProjectDeployment(deployment ?? null);
        setProjectDeploymentEnvText((current) => (current ? current : formatEnvText(deployment?.env)));
        setProjectDeploymentLinkedAgentId((current) => (current ? current : (deployment?.linked_agent_id ?? '')));
        setProjectDeploymentSetTelegramWebhook(false);
      } catch (error) {
        if (cancelled) return;
        setProjectDeploymentError(error instanceof Error ? error.message : 'Не удалось загрузить deployment');
      } finally {
        if (!cancelled && !options?.silent) {
          setProjectDeploymentLoading(false);
        }
      }
    };

    void loadDeployment();

    return () => {
      cancelled = true;
    };
  }, [canDeployProject, content]);

  useEffect(() => {
    if (deploymentPollingTimerRef.current) {
      window.clearInterval(deploymentPollingTimerRef.current);
      deploymentPollingTimerRef.current = null;
    }

    if (
      !canDeployProject
      || !projectDeployment
      || !onLoadProjectDeploymentRef.current
      || (projectDeployment.status !== 'running' && projectDeployment.status !== 'deploying')
    ) {
      return;
    }

    let cancelled = false;

    const pollDeployment = async () => {
      try {
        const deployment = await onLoadProjectDeploymentRef.current?.();
        if (cancelled || !deployment) return;
        setProjectDeployment(deployment);
      } catch {
        // Preserve the previous deployment snapshot if background refresh fails.
      }
    };

    deploymentPollingTimerRef.current = window.setInterval(() => {
      void pollDeployment();
    }, document.visibilityState === 'visible' ? 2000 : 5000);

    return () => {
      cancelled = true;
      if (deploymentPollingTimerRef.current) {
        window.clearInterval(deploymentPollingTimerRef.current);
        deploymentPollingTimerRef.current = null;
      }
    };
  }, [canDeployProject, projectDeployment?.id, projectDeployment?.status]);

  const deploymentLogLines = useMemo(
    () => splitDeploymentLogLines(projectDeployment?.live_stdout ?? '', projectDeployment?.live_stderr ?? ''),
    [projectDeployment?.live_stdout, projectDeployment?.live_stderr],
  );
  const deploymentRunsDashboardUrl = projectDeployment
    ? `/dashboard/runs?deploymentId=${encodeURIComponent(projectDeployment.id)}`
    : null;

  const setEditorTransientStatus = (message: string | null) => {
    if (editorStatusTimeoutRef.current) {
      window.clearTimeout(editorStatusTimeoutRef.current);
      editorStatusTimeoutRef.current = null;
    }

    setEditorStatus(message);

    if (message) {
      editorStatusTimeoutRef.current = window.setTimeout(() => {
        setEditorStatus(null);
        editorStatusTimeoutRef.current = null;
      }, 2200);
    }
  };

  const openPreviewEditor = (title: string, html: string) => {
    const sourceHash = getStringHash(html);
    const shouldAutoBeautify = !beautifyAppliedSourceHashesRef.current.has(sourceHash);
    const nextHtml = shouldAutoBeautify ? beautifyHtml(html) : html;

    if (shouldAutoBeautify) {
      beautifyAppliedSourceHashesRef.current.add(sourceHash);
    }

    setEditorError(null);
    setPreviewEditor({ title, html: nextHtml });
  };

  const applyBeautifyToEditor = () => {
    if (!previewEditor) return;
    beautifyAppliedSourceHashesRef.current.add(getStringHash(previewEditor.html));
    updatePreviewEditorHtml(beautifyHtml(previewEditor.html));
    setEditorTransientStatus('HTML аккуратно отформатирован');
  };

  const exportPreviewProject = async () => {
    if (!previewEditor) return;

    setEditorExporting(true);
    setEditorError(null);

    try {
      const projectSlug = slugifyFilename(previewEditor.title || 'preview-project');
      const readme = [
        `# ${previewEditor.title || 'Preview project'}`,
        '',
        'Это standalone preview, экспортированный из LLMStore.',
        '',
        '## Файлы',
        '- `index.html` — готовая страница preview.',
        '',
        '## Как запустить',
        '1. Распакуйте архив.',
        '2. Откройте `index.html` в браузере.',
        '3. Если нужны локальные запросы/модули, поднимите простый static server в этой папке.',
      ].join('\n');

      const zip = buildZipArchive([
        { name: `${projectSlug}/index.html`, content: previewEditor.html },
        { name: `${projectSlug}/README.md`, content: readme },
      ]);

      downloadBlob(`${projectSlug}.zip`, zip);
      setEditorTransientStatus('Архив проекта экспортирован');
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Не удалось экспортировать архив');
    } finally {
      setEditorExporting(false);
    }
  };

  const exportResolvedPreviewProject = async () => {
    if (!resolvedHtmlPreview) return;

    setPreviewExporting(true);
    setMessageActionError(null);
    setMessageActionStatus(null);

    try {
      downloadPreviewProjectArchive(resolvedHtmlPreview);
    } catch (error) {
      setMessageActionError(error instanceof Error ? error.message : 'Не удалось экспортировать архив');
    } finally {
      setPreviewExporting(false);
    }
  };

  const exportStandalonePreviewProject = async (preview: { title: string; html: string }) => {
    setMessageActionError(null);
    setMessageActionStatus(null);

    try {
      await downloadPreviewProjectArchive(preview);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось экспортировать архив';
      setMessageActionError(message);
      throw error;
    }
  };

  const exportPreviewCardProject = async () => {
    if (!resolvedHtmlPreview) return;

    setPreviewExporting(true);
    try {
      await exportStandalonePreviewProject(resolvedHtmlPreview);
    } finally {
      setPreviewExporting(false);
    }
  };

  const exportEditedPreviewProject = async () => {
    if (!previewEditor) return;

    setEditorExporting(true);
    setEditorError(null);

    try {
      await downloadPreviewProjectArchive(previewEditor);
      setEditorTransientStatus('Архив preview экспортирован');
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Не удалось экспортировать архив');
    } finally {
      setEditorExporting(false);
    }
  };

  const exportProjectBundle = async () => {
    if (!projectBundle) return;

    setProjectExporting(true);
    setMessageActionError(null);
    setMessageActionStatus(null);

    try {
      const zip = buildProjectBundleArchive(projectBundle, projectBundle.title || 'project-bundle');
      const filename = `${slugifyFilename(projectBundle.title || 'project-bundle')}.zip`;
      downloadBlob(filename, zip);
    } catch (error) {
      setMessageActionError(error instanceof Error ? error.message : 'Не удалось экспортировать проект');
    } finally {
      setProjectExporting(false);
    }
  };

  const runProjectBundleOnServer = async () => {
    if (!onRunProject) return;

    const shouldRefreshFullscreen = Boolean(projectRunResultFullscreen);
    setProjectRunning(true);
    setMessageActionError(null);
    setMessageActionStatus(null);
    setProjectRunResult(null);

    try {
      const result = await onRunProject();
      setProjectRunResult(result);
      if (shouldRefreshFullscreen) {
        setProjectRunResultFullscreen(result);
      }
    } catch (error) {
      setMessageActionError(error instanceof Error ? error.message : 'Не удалось выполнить проект на сервере');
    } finally {
      setProjectRunning(false);
    }
  };

  const requestProjectFixFromError = async () => {
    if (!onFixProjectError || !projectBundle || !projectRunResult) return;

    setProjectFixing(true);
    setMessageActionError(null);
    setMessageActionStatus(null);

    try {
      await onFixProjectError(buildFixProjectPrompt(projectBundle, projectRunResult));
      setMessageActionStatus('Запрос на исправление отправлен в чат');
    } catch (error) {
      setMessageActionError(error instanceof Error ? error.message : 'Не удалось отправить запрос на исправление');
    } finally {
      setProjectFixing(false);
    }
  };

  const copyTextToClipboard = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setProjectDeploymentStatus(successMessage);
      setProjectDeploymentError(null);
    } catch {
      setProjectDeploymentError('Не удалось скопировать в буфер обмена');
    }
  };

  const saveProjectDeployment = async () => {
    if (!onUpsertProjectDeployment) return;

    setProjectDeploying(true);
    setProjectDeploymentError(null);
    setProjectDeploymentStatus(null);
    try {
      const deployment = await onUpsertProjectDeployment({
        env: parseEnvText(projectDeploymentEnvText),
        linked_agent_id: projectDeploymentLinkedAgentId.trim() || null,
        set_telegram_webhook: projectDeploymentSetTelegramWebhook,
      });
      setProjectDeployment(deployment);
      setProjectDeploymentEditorOpen(false);
      setProjectDeploymentStatus(
        projectDeploymentSetTelegramWebhook
          ? 'Webhook-проект развернут, и Telegram webhook установлен'
          : 'Webhook-проект развернут и готов принимать запросы',
      );
    } catch (error) {
      setProjectDeploymentError(error instanceof Error ? error.message : 'Не удалось развернуть webhook-проект');
    } finally {
      setProjectDeploying(false);
    }
  };

  const startProjectDeployment = async () => {
    if (!onStartProjectDeployment) return;
    setProjectStartingDeployment(true);
    setProjectDeploymentError(null);
    setProjectDeploymentStatus(null);
    try {
      const deployment = await onStartProjectDeployment();
      setProjectDeployment(deployment);
      setProjectDeploymentStatus('Deployment снова запущен');
    } catch (error) {
      setProjectDeploymentError(error instanceof Error ? error.message : 'Не удалось запустить deployment');
    } finally {
      setProjectStartingDeployment(false);
    }
  };

  const stopProjectDeployment = async () => {
    if (!onStopProjectDeployment) return;
    setProjectStoppingDeployment(true);
    setProjectDeploymentError(null);
    setProjectDeploymentStatus(null);
    try {
      const deployment = await onStopProjectDeployment();
      setProjectDeployment(deployment);
      setProjectDeploymentStatus('Deployment остановлен');
    } catch (error) {
      setProjectDeploymentError(error instanceof Error ? error.message : 'Не удалось остановить deployment');
    } finally {
      setProjectStoppingDeployment(false);
    }
  };

  const reinstallProjectDeploymentWebhook = async () => {
    if (!onReinstallProjectDeploymentWebhook) return;
    setProjectReinstallingWebhook(true);
    setProjectDeploymentError(null);
    setProjectDeploymentStatus(null);
    try {
      const deployment = await onReinstallProjectDeploymentWebhook();
      setProjectDeployment(deployment);
      setProjectDeploymentStatus('Telegram webhook переустановлен');
    } catch (error) {
      setProjectDeploymentError(error instanceof Error ? error.message : 'Не удалось переустановить webhook');
    } finally {
      setProjectReinstallingWebhook(false);
    }
  };

  const pushEditorHistory = (nextHtml: string) => {
    const currentHistory = editorHistoryRef.current;
    const currentIndex = editorHistoryIndexRef.current;

    if (currentHistory[currentIndex] === nextHtml) return;

    const nextHistory = [...currentHistory.slice(0, currentIndex + 1), nextHtml].slice(-200);
    editorHistoryRef.current = nextHistory;
    editorHistoryIndexRef.current = nextHistory.length - 1;
  };

  const updatePreviewEditorHtml = (
    nextHtml: string,
    options?: {
      selectionStart?: number;
      selectionEnd?: number;
      pushHistory?: boolean;
    },
  ) => {
    setPreviewEditor((prev) => (prev ? { ...prev, html: nextHtml } : prev));
    setEditorError(null);
    setEditorStatus(null);

    if (options?.pushHistory !== false) {
      pushEditorHistory(nextHtml);
    }

    if (typeof options?.selectionStart === 'number' && typeof options.selectionEnd === 'number') {
      requestAnimationFrame(() => {
        if (!editorTextareaRef.current) return;
        editorTextareaRef.current.selectionStart = options.selectionStart!;
        editorTextareaRef.current.selectionEnd = options.selectionEnd!;
      });
    }
  };

  const stepEditorHistory = (direction: 'undo' | 'redo') => {
    if (!previewEditor) return;

    const history = editorHistoryRef.current;
    const delta = direction === 'undo' ? -1 : 1;
    const nextIndex = Math.min(Math.max(editorHistoryIndexRef.current + delta, 0), history.length - 1);

    if (nextIndex === editorHistoryIndexRef.current) return;

    editorHistoryIndexRef.current = nextIndex;
    const nextHtml = history[nextIndex] ?? previewEditor.html;
    setPreviewEditor((prev) => (prev ? { ...prev, html: nextHtml } : prev));
    setEditorError(null);
    setEditorTransientStatus(direction === 'undo' ? 'Последнее изменение отменено' : 'Изменение возвращено');

    requestAnimationFrame(() => {
      if (!editorTextareaRef.current) return;
      const caret = nextHtml.length;
      editorTextareaRef.current.selectionStart = caret;
      editorTextareaRef.current.selectionEnd = caret;
    });
  };

  const syncEditorScroll = () => {
    if (!editorTextareaRef.current || !editorHighlightRef.current) return;
    editorHighlightRef.current.scrollTop = editorTextareaRef.current.scrollTop;
    editorHighlightRef.current.scrollLeft = editorTextareaRef.current.scrollLeft;
  };

  const savePreviewEditor = async () => {
    if (!onSavePreview || !previewEditor) return;
    const nextPreview = {
      title: previewEditor.title || 'Agent preview',
      html: previewEditor.html,
    };
    setEditorSaving(true);
    setEditorError(null);
    try {
      await onSavePreview(nextPreview);
      setPreviewOverride(nextPreview);
      setHtmlPreview((prev) => (prev ? nextPreview : prev));
      setEditorTransientStatus('Preview сохранён');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось сохранить preview';
      setEditorError(message);
    } finally {
      setEditorSaving(false);
    }
  };

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    const key = event.key.toLowerCase();

    if ((event.ctrlKey || event.metaKey) && key === 's') {
      event.preventDefault();
      void savePreviewEditor();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && key === 'z') {
      event.preventDefault();
      stepEditorHistory(event.shiftKey ? 'redo' : 'undo');
      return;
    }

    if (!previewEditor) return;

    if (event.key === 'Tab') {
      event.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = previewEditor.html;

      if (!event.shiftKey && start === end) {
        const nextValue = `${value.slice(0, start)}  ${value.slice(end)}`;
        updatePreviewEditorHtml(nextValue, {
          selectionStart: start + 2,
          selectionEnd: start + 2,
        });
        return;
      }

      const blockStart = value.lastIndexOf('\n', Math.max(start - 1, 0)) + 1;
      const nextLineBreak = value.indexOf('\n', end);
      const blockEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
      const block = value.slice(blockStart, blockEnd);
      const lines = block.split('\n');

      if (event.shiftKey) {
        let firstLineRemoved = 0;
        let totalRemoved = 0;

        const nextBlock = lines.map((line, index) => {
          let removed = 0;
          if (line.startsWith('  ')) {
            removed = 2;
          } else if (line.startsWith('\t')) {
            removed = 1;
          } else if (line.startsWith(' ')) {
            removed = 1;
          }

          if (index === 0) {
            firstLineRemoved = removed;
          }
          totalRemoved += removed;

          return removed > 0 ? line.slice(removed) : line;
        }).join('\n');

        const nextValue = `${value.slice(0, blockStart)}${nextBlock}${value.slice(blockEnd)}`;
        updatePreviewEditorHtml(nextValue, {
          selectionStart: Math.max(blockStart, start - firstLineRemoved),
          selectionEnd: Math.max(blockStart, end - totalRemoved),
        });
        return;
      }

      const nextBlock = lines.map((line) => `  ${line}`).join('\n');
      const nextValue = `${value.slice(0, blockStart)}${nextBlock}${value.slice(blockEnd)}`;
      updatePreviewEditorHtml(nextValue, {
        selectionStart: start + 2,
        selectionEnd: end + (2 * lines.length),
      });
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentLineStart = previewEditor.html.lastIndexOf('\n', start - 1) + 1;
      const currentLine = previewEditor.html.slice(currentLineStart, start);
      const indent = currentLine.match(/^\s*/)?.[0] ?? '';
      const insertion = `\n${indent}`;
      const nextValue = `${previewEditor.html.slice(0, start)}${insertion}${previewEditor.html.slice(end)}`;
      const nextCaret = start + insertion.length;
      updatePreviewEditorHtml(nextValue, {
        selectionStart: nextCaret,
        selectionEnd: nextCaret,
      });
    }
  };

  const deleteMessage = async () => {
    if (!onDeleteMessage || deletingMessage) return;
    const confirmed = window.confirm('Удалить это сообщение из чата?');
    if (!confirmed) return;

    setDeletingMessage(true);
    setMessageActionError(null);
    setMessageActionStatus(null);
    try {
      await onDeleteMessage();
    } catch (error) {
      setMessageActionError(error instanceof Error ? error.message : 'Не удалось удалить сообщение');
    } finally {
      setDeletingMessage(false);
    }
  };

  const editMessage = async () => {
    if (!onEditMessage || editingMessage) return;

    setEditingMessage(true);
    setMessageActionError(null);
    setMessageActionStatus(null);
    try {
      await onEditMessage();
    } catch (error) {
      setMessageActionError(error instanceof Error ? error.message : 'Не удалось подготовить сообщение к редактированию');
    } finally {
      setEditingMessage(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          'group flex min-w-0 max-w-full',
          isUser ? 'justify-end' : 'justify-start',
          animateOnMount && 'chat-message-enter',
          animateOnMount && isUser && 'chat-message-enter--user',
          animateOnMount && !isUser && 'chat-message-enter--assistant',
        )}
      >
        <div className={cn('min-w-0 max-w-full', isUser ? 'max-w-[80%]' : 'w-full')}>
          {authorLabel && (
            <p
              className={cn(
                'mb-1 px-1 text-[11px] font-medium tracking-wide',
                isUser ? 'text-right text-sky-700/80' : 'text-muted-foreground',
              )}
            >
              {authorLabel}
            </p>
          )}
          <div
            className={cn(
              'relative overflow-visible rounded-lg px-4 py-3 text-sm',
              isUser
                ? 'border border-sky-200/80 bg-sky-50 text-slate-900 shadow-sm'
                : 'bg-muted text-foreground',
              isUser && !renderUserAsMarkdown ? 'whitespace-pre-wrap' : '',
            )}
            style={bubbleStyle}
          >
          {(canEditMessage || canDeleteMessage) && (
            <div className="absolute -bottom-8 right-0 z-[2] flex justify-end gap-1">
              {canEditMessage && onEditMessage && (
                <button
                  type="button"
                  className={cn(
                    'inline-flex h-7 w-7 items-center justify-center rounded-full border text-[0] transition-all',
                    'pointer-events-none translate-y-1 opacity-0',
                    'group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100',
                    'group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100',
                    isUser
                      ? 'border-sky-200/80 bg-white/90 text-sky-700 hover:bg-sky-50 hover:text-sky-900'
                      : 'border-border/80 bg-background/90 text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                  onClick={() => void editMessage()}
                  disabled={messageActionBusy}
                  aria-label={editingMessage ? 'Подготавливаю редактирование сообщения' : 'Изменить сообщение'}
                  title={editingMessage ? 'Подготавливаю...' : 'Изменить'}
                >
                  <Pencil className={cn('h-3.5 w-3.5', editingMessage && 'animate-pulse')} />
                </button>
              )}
              {canDeleteMessage && onDeleteMessage && (
                <button
                type="button"
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-full border text-[0] transition-all',
                  'pointer-events-none translate-y-1 opacity-0',
                  'group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100',
                  'group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100',
                  isUser
                    ? 'border-sky-200/80 bg-white/90 text-sky-700 hover:bg-sky-50 hover:text-sky-900'
                    : 'border-border/80 bg-background/90 text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
                onClick={() => void deleteMessage()}
                disabled={messageActionBusy}
                aria-label={deletingMessage ? 'Удаляю сообщение' : 'Удалить сообщение'}
                title={deletingMessage ? 'Удаляю...' : 'Удалить'}
              >
                <Trash2 className={cn('h-3.5 w-3.5', deletingMessage && 'animate-pulse')} />
                {deletingMessage ? 'Удаляю...' : 'Удалить'}
                </button>
              )}
            </div>
          )}
          {messageActionError && (
            <p className={cn('mb-2 text-xs', isUser ? 'text-rose-700' : 'text-destructive')}>{messageActionError}</p>
          )}
          {messageActionStatus && (
            <p className="mb-2 text-xs text-emerald-700">{messageActionStatus}</p>
          )}
          {(isUser && !renderUserAsMarkdown) ? (
            content
          ) : (
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:opacity-80">
                    {children}
                  </a>
                ),
                ol: ({ children }) => <ol className="list-decimal pl-5 my-1 space-y-1">{children}</ol>,
                ul: ({ children }) => <ul className="list-disc pl-5 my-1 space-y-1">{children}</ul>,
                p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                pre: ({ children }) => <>{children}</>,
                code: ({ className, children }: ComponentPropsWithoutRef<'code'> & { inline?: boolean }) => {
                  const codeValue = String(children ?? '').replace(/\n$/, '');
                  const isBlock = Boolean(className?.includes('language-')) || codeValue.includes('\n');

                  if (isBlock) {
                    return <ChatCodeBlock code={codeValue} className={className} />;
                  }

                  return (
                    <ChatInlineCode>
                      {String(children ?? '')}
                    </ChatInlineCode>
                  );
                },
              }}
            >
              {renderedContent}
            </Markdown>
          )}

          {!isUser && codingReport && (
            <div className="mt-3 space-y-3">
              {codingReport.summary && (
                <SectionCard title="Итог">
                  <p className="whitespace-pre-wrap text-sm">{codingReport.summary}</p>
                </SectionCard>
              )}

              {codingReport.worklog && codingReport.worklog.length > 0 && (
                <SectionCard title="Ход разработки">
                  <ol className="list-decimal space-y-1 pl-5 text-sm">
                    {codingReport.worklog.map((item, index) => (
                      <li key={`${item}-${index}`} className="whitespace-pre-wrap">
                        {item}
                      </li>
                    ))}
                  </ol>
                </SectionCard>
              )}

              {codingReport.changed_files && codingReport.changed_files.length > 0 && (
                <SectionCard title="Измененные файлы">
                  <div className="space-y-2">
                    {codingReport.changed_files.map((file) => (
                      <div key={`${file.path}-${file.summary ?? ''}`} className="rounded-md border border-border/60 bg-muted/30 px-2 py-2">
                        <p className="font-mono text-xs">{file.path}</p>
                        {file.summary && (
                          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                            {file.summary}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {codingReport.how_to_run && codingReport.how_to_run.length > 0 && (
                <SectionCard title="Как запустить">
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {codingReport.how_to_run.map((item, index) => (
                      <li key={`${item}-${index}`} className="whitespace-pre-wrap">
                        {item}
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              )}

              {codingReport.notes && codingReport.notes.length > 0 && (
                <SectionCard title="Заметки">
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {codingReport.notes.map((item, index) => (
                      <li key={`${item}-${index}`} className="whitespace-pre-wrap">
                        {item}
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              )}

              {projectBundle && (
                <SectionCard title="Project Bundle">
                  <div className="space-y-3">
                    <div className="space-y-1 text-sm">
                      <p className="font-medium text-slate-900">
                        {projectBundle.title || 'Runnable project'}
                      </p>
                      <p className="text-muted-foreground">
                        Runtime: {getProjectRuntimeLabel(projectBundle.runtime)}. Files: {projectBundle.files.length}
                        {projectBundle.entrypoint ? `, entrypoint: ${projectBundle.entrypoint}` : ''}
                      </p>
                      <p className="text-muted-foreground">
                        Запусков: {displayedProjectRunCount}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="whitespace-nowrap"
                        onClick={() => { void exportProjectBundle(); }}
                        disabled={projectExporting}
                      >
                        {projectExporting ? 'Экспортирую...' : 'Скачать проект'}
                      </Button>
                      {canRunProject && onRunProject && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="whitespace-nowrap"
                          onClick={() => { void runProjectBundleOnServer(); }}
                          disabled={projectRunning}
                        >
                          {projectRunning ? 'Запускаю...' : 'Запустить'}
                        </Button>
                      )}
                      {canDeployProject && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="whitespace-nowrap"
                          onClick={() => {
                            setProjectDeploymentEditorOpen(true);
                            setProjectDeploymentError(null);
                            setProjectDeploymentStatus(null);
                            setProjectDeploymentEnvText(formatEnvText(projectDeployment?.env));
                            setProjectDeploymentLinkedAgentId(projectDeployment?.linked_agent_id ?? '');
                            setProjectDeploymentSetTelegramWebhook(false);
                          }}
                          disabled={projectDeploymentLoading}
                        >
                          {projectDeployment ? 'Обновить deploy' : 'Развернуть webhook'}
                        </Button>
                      )}
                    </div>

                    {showDeploymentOwnerHint && (
                      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                        Управление deployment, webhook и секретами доступно только владельцу чата.
                      </div>
                    )}

                    {projectDeploymentLoading && (
                      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                        Загружаю состояние deployment...
                      </div>
                    )}

                    {projectDeployment && (
                      <div className="rounded-md border border-border/60 bg-background/80 p-3 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="font-medium text-slate-900">
                              Webhook deployment: {projectDeployment.status}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Runtime: {projectDeployment.runtime}
                              {projectDeployment.entrypoint ? `, entrypoint: ${projectDeployment.entrypoint}` : ''}
                            </p>
                            <p className="break-all text-xs text-muted-foreground">
                              Webhook URL: {projectDeployment.webhook_url}
                            </p>
                            {projectDeployment.linked_agent_name && (
                              <p className="text-xs text-muted-foreground">
                                Связанный агент: {projectDeployment.linked_agent_name}
                              </p>
                            )}
                            {projectDeployment.last_error && (
                              <p className="whitespace-pre-wrap text-xs text-rose-600">
                                {projectDeployment.last_error}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => { void copyTextToClipboard(projectDeployment.webhook_url, 'Webhook URL скопирован'); }}
                            >
                              Копировать URL
                            </Button>
                            {onReinstallProjectDeploymentWebhook && projectDeployment.env.TELEGRAM_BOT_TOKEN && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => { void reinstallProjectDeploymentWebhook(); }}
                                disabled={projectReinstallingWebhook}
                              >
                                {projectReinstallingWebhook ? 'Переустанавливаю...' : 'Переустановить webhook'}
                              </Button>
                            )}
                            {projectDeployment.status !== 'running' && onStartProjectDeployment && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => { void startProjectDeployment(); }}
                                disabled={projectStartingDeployment}
                              >
                                {projectStartingDeployment ? 'Запускаю...' : 'Запустить deploy'}
                              </Button>
                            )}
                            {projectDeployment.status === 'running' && onStopProjectDeployment && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => { void stopProjectDeployment(); }}
                                disabled={projectStoppingDeployment}
                              >
                                {projectStoppingDeployment ? 'Останавливаю...' : 'Остановить deploy'}
                              </Button>
                            )}
                            {deploymentRunsDashboardUrl && (
                              <a
                                href={deploymentRunsDashboardUrl}
                                className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
                              >
                                Все запросы
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                            Запросов: {formatCompactNumber(projectDeployment.run_stats.total_runs)}
                          </div>
                          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                            Токенов: {formatCompactNumber(projectDeployment.run_stats.total_tokens)}
                          </div>
                          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                            Стоимость: {formatUsdAmount(projectDeployment.run_stats.total_cost_usd)}
                          </div>
                          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                            В рублях: {formatRubAmount(projectDeployment.run_stats.total_cost_rub)}
                          </div>
                          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                            Успешно: {formatCompactNumber(projectDeployment.run_stats.completed_runs)}
                          </div>
                          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                            Ошибок: {formatCompactNumber(projectDeployment.run_stats.failed_runs)}
                          </div>
                          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 sm:col-span-2">
                            Последний запрос: {formatDateTime(projectDeployment.run_stats.last_run_at)}
                          </div>
                        </div>
                        {deploymentLogLines.length > 0 && (
                          <div className="mt-3 space-y-1">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Логи</p>
                            <pre className={cn(
                              'max-h-[32rem] min-h-[18rem] w-full overflow-auto rounded bg-slate-950 p-3 text-xs',
                              looksLikeErrorLog(deploymentLogLines.join('\n'))
                                ? 'text-rose-200'
                                : 'text-slate-100',
                            )}>
                              {deploymentLogLines.map((line, index) => (
                                <span
                                  key={`${index}-${line}`}
                                  className={cn('block whitespace-pre-wrap break-all', getLogLineClassName(line))}
                                >
                                  {line || ' '}
                                </span>
                              ))}
                            </pre>
                          </div>
                        )}
                        {projectDeployment.recent_runs.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Последние запросы</p>
                            <div className="space-y-2">
                              {projectDeployment.recent_runs.map((run) => (
                                <div key={run.id} className="rounded-md border border-border/60 bg-background/70 p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium', getRunStatusTone(run.status))}>
                                      {getRunStatusLabel(run.status)}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground">
                                      {formatDateTime(run.started_at)}
                                      {typeof run.latency_ms === 'number' ? ` • ${(run.latency_ms / 1000).toFixed(1)}s` : ''}
                                    </span>
                                  </div>
                                  {run.input_summary && (
                                    <p className="mt-2 line-clamp-2 text-sm text-slate-900">
                                      {run.input_summary}
                                    </p>
                                  )}
                                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                                    <span>Токены: {formatCompactNumber(run.total_tokens)}</span>
                                    <span>Стоимость: {formatUsdAmount(run.estimated_cost_usd)}</span>
                                  </div>
                                  {run.error_message && (
                                    <p className="mt-2 line-clamp-2 text-xs text-rose-600">
                                      {run.error_message}
                                    </p>
                                  )}
                                  {!run.error_message && run.output_summary && (
                                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                                      {run.output_summary}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {(projectDeploymentStatus || projectDeploymentError) && (
                      <div className={cn(
                        'rounded-md border px-3 py-2 text-xs',
                        projectDeploymentError
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                      )}>
                        {projectDeploymentError ?? projectDeploymentStatus}
                      </div>
                    )}

                    <div className="space-y-2">
                      {projectBundle.files.map((file) => (
                        <div key={`${file.path}-${file.summary ?? ''}`} className="rounded-md border border-border/60 bg-muted/30 px-2 py-2">
                          <p className="font-mono text-xs">{file.path}</p>
                          {file.summary && (
                            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                              {file.summary}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                    {projectRunResult && (
                      <div className="rounded-md border border-border/60 bg-background/80 p-3 text-sm">
                        <p className="font-medium text-slate-900">
                          Результат: {projectRunResult.status}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {projectRunResult.command.join(' ')} · {projectRunResult.duration_ms} ms
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Запусков: {displayedProjectRunCount}
                        </p>
                        <p className="mt-2 text-xs">
                          {projectRunResult.verification.message}
                          {projectRunResult.verification.url ? ` (${projectRunResult.verification.url})` : ''}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="whitespace-nowrap"
                            onClick={() => setProjectRunResultFullscreen(projectRunResult)}
                          >
                            На весь экран
                          </Button>
                          {onFixProjectError && projectRunResult.status !== 'passed' && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="whitespace-nowrap"
                              onClick={() => { void requestProjectFixFromError(); }}
                              disabled={projectFixing}
                            >
                              {projectFixing ? 'Отправляю...' : 'Fix from error'}
                            </Button>
                          )}
                        </div>
                        {projectRunResult.stdout && (
                          <pre className="mt-3 max-h-96 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-100">
                            {projectRunResult.stdout}
                          </pre>
                        )}
                        {projectRunResult.stderr && (
                          <pre className="mt-3 max-h-96 overflow-auto rounded bg-slate-950 p-3 text-xs text-rose-200">
                            {projectRunResult.stderr}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                </SectionCard>
              )}

              {codingReport.preview?.type === 'url' && codingReport.preview.url && (
                <div className="rounded-lg border border-border/70 bg-background/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <a
                      href={codingReport.preview.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 truncate text-sm font-semibold text-primary underline"
                    >
                      {codingReport.preview.title || codingReport.preview.url}
                    </a>
                    <p className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Preview
                    </p>
                  </div>
                </div>
              )}

              {resolvedHtmlPreview && (
                <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border/70 bg-background/70 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {resolvedHtmlPreview.title || 'Preview'}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="whitespace-nowrap"
                        onClick={() => { void exportPreviewCardProject(); }}
                        disabled={previewExporting}
                      >
                        {previewExporting ? 'Экспортирую...' : 'Экспортировать'}
                      </Button>
                      {projectBundle && canRunProject && onRunProject && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="whitespace-nowrap"
                          onClick={() => { void runProjectBundleOnServer(); }}
                          disabled={projectRunning}
                        >
                          {projectRunning ? 'Запускаю...' : 'Запустить'}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="whitespace-nowrap"
                        onClick={() => {
                          if (absolutePreviewPageUrl) {
                            window.open(
                              withPreviewId(
                                absolutePreviewPageUrl,
                                `open-window-${Math.random().toString(36).slice(2, 10)}`,
                              ),
                              '_blank',
                              'noopener,noreferrer',
                            );
                            return;
                          }

                          const blob = new Blob([resolvedHtmlPreview.html || ''], { type: 'text/html' });
                          const url = URL.createObjectURL(blob);
                          window.open(url, '_blank', 'noopener,noreferrer');
                          setTimeout(() => URL.revokeObjectURL(url), 60_000);
                        }}
                      >
                        В новом окне
                      </Button>
                      {canEditPreview && onSavePreview && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="order-4 whitespace-nowrap"
                          onClick={() => openPreviewEditor(resolvedHtmlPreview.title, resolvedHtmlPreview.html)}
                        >
                          Редактор
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="order-3 whitespace-nowrap"
                        onClick={() => setHtmlPreview({
                          title: resolvedHtmlPreview.title,
                          html: resolvedHtmlPreview.html,
                        })}
                      >
                        На весь экран
                      </Button>
                      </div>
                    </div>
                    <p className="shrink-0 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Preview
                    </p>
                  </div>
                  <div className="mt-3 min-w-0 max-w-full overflow-hidden">
                    <HtmlPreviewBrowser
                      title={resolvedHtmlPreview.title}
                      html={resolvedHtmlPreview.html}
                      previewPageUrl={absolutePreviewPageUrl}
                      revisionKey={resolvedPreviewRevision}
                      className="h-80 w-full max-w-full overflow-hidden"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {!isUser && toolTraces.length > 0 && (
            <div className="mt-3 rounded-lg border border-border/70 bg-background/70 p-3">
              <ToolTracePanel traces={toolTraces} />
            </div>
          )}

          {attachments.length > 0 && (
            <div className="mt-2 space-y-2">
              {attachments.map((file) => (
                <div
                  key={file.filename}
                  className={cn('rounded border px-2 py-1.5 text-xs', isUser ? 'border-primary-foreground/30' : 'border-border')}
                >
                  <a href={file.url} target="_blank" rel="noopener noreferrer" className="underline">
                    {file.original_name || file.filename}
                  </a>
                  {file.kind === 'image' && (
                    <button
                      type="button"
                      className="mt-2 block w-full"
                      onClick={() => {
                        setPreviewUrl(file.url);
                        setPreviewAlt(file.original_name || file.filename);
                      }}
                    >
                      <img
                        src={file.url}
                        alt={file.original_name || file.filename}
                        className="max-h-48 w-full cursor-zoom-in rounded object-contain"
                      />
                    </button>
                  )}
                  {file.kind === 'text' && file.text_preview && (
                    <p className="mt-2 whitespace-pre-wrap opacity-90">{file.text_preview}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>

      {previewUrl && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="relative max-h-[95vh] max-w-[95vw]" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="absolute -right-3 -top-3 z-10 h-8 w-8 rounded-full bg-white text-black shadow hover:bg-neutral-200"
              onClick={() => setPreviewUrl(null)}
              aria-label="Закрыть"
            >
              ×
            </button>
            <img src={previewUrl} alt={previewAlt} className="max-h-[95vh] max-w-[95vw] rounded object-contain" />
          </div>
        </div>
      )}

      {htmlPreview && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/85 p-3"
          onClick={() => setHtmlPreview(null)}
        >
          <div
            className="flex h-[94vh] w-[96vw] max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{htmlPreview.title}</p>
                <p className="text-xs text-slate-500">Standalone preview</p>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setHtmlPreview(null)}>
                  Закрыть
                </Button>
              </div>
            </div>
            <HtmlPreviewBrowser
              title={htmlPreview.title}
              html={htmlPreview.html}
              previewPageUrl={absolutePreviewPageUrl}
              revisionKey={getStringHash(htmlPreview.html)}
              className="min-h-0 flex-1"
            />
          </div>
        </div>
      )}

      {projectRunResultFullscreen && (
        <div
          className="fixed inset-0 z-[132] flex items-center justify-center bg-black/85 p-3"
          onClick={() => setProjectRunResultFullscreen(null)}
        >
          <div
            className="flex h-[94vh] w-[96vw] max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  Результат запуска: {projectRunResultFullscreen.status}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {projectRunResultFullscreen.command.join(' ')} · {projectRunResultFullscreen.duration_ms} ms
                </p>
                <p className="truncate text-xs text-slate-500">
                  Запусков: {projectRunResultFullscreen.project_run_count ?? displayedProjectRunCount}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {canRunProject && onRunProject && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => { void runProjectBundleOnServer(); }}
                    disabled={projectRunning}
                  >
                    {projectRunning ? 'Запускаю...' : 'Запустить'}
                  </Button>
                )}
                <Button type="button" variant="outline" size="sm" onClick={() => setProjectRunResultFullscreen(null)}>
                  Закрыть
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
              <div className="flex min-h-full flex-col gap-4">
                <div className="rounded-lg border border-border/70 bg-background/70 p-3 text-sm">
                  <p className="font-medium text-slate-900">Проверка</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {projectRunResultFullscreen.verification.message}
                    {projectRunResultFullscreen.verification.url ? ` (${projectRunResultFullscreen.verification.url})` : ''}
                  </p>
                  {projectRunResultFullscreen.entrypoint && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Entrypoint: {projectRunResultFullscreen.entrypoint}
                    </p>
                  )}
                </div>
                <div className={cn(
                  'grid min-h-0 flex-1 gap-4',
                  projectRunResultFullscreen.stdout && projectRunResultFullscreen.stderr
                    ? 'lg:grid-cols-2'
                    : 'grid-cols-1',
                )}>
                {projectRunResultFullscreen.stdout && (
                  <div className="flex min-h-0 flex-col space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">stdout</p>
                    <pre className="min-h-0 flex-1 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
                      {projectRunResultFullscreen.stdout}
                    </pre>
                  </div>
                )}
                {projectRunResultFullscreen.stderr && (
                  <div className="flex min-h-0 flex-col space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">stderr</p>
                    <pre className="min-h-0 flex-1 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-rose-200">
                      {projectRunResultFullscreen.stderr}
                    </pre>
                  </div>
                )}
                </div>
                {!projectRunResultFullscreen.stdout && !projectRunResultFullscreen.stderr && (
                  <div className="rounded-lg border border-border/70 bg-background/70 p-3 text-sm text-muted-foreground">
                    Процесс не вернул stdout или stderr.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {projectDeploymentEditorOpen && (
        <div
          className="fixed inset-0 z-[133] flex items-center justify-center bg-black/85 p-3"
          onClick={() => !projectDeploying && setProjectDeploymentEditorOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">Deploy webhook-проекта</p>
                <p className="text-xs text-slate-500">
                  Подходит для Telegram webhook-ботов и других long-running HTTP проектов.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setProjectDeploymentEditorOpen(false)}
                disabled={projectDeploying}
              >
                Закрыть
              </Button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="space-y-2">
                <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Linked agent id
                </label>
                <input
                  value={projectDeploymentLinkedAgentId}
                  onChange={(e) => setProjectDeploymentLinkedAgentId(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  placeholder="Например: 4f20dda0-a03b-48d6-ac03-2ea2f25f6901"
                />
                <p className="text-xs text-muted-foreground">
                  Если указать агент, проект получит `LLMSTORE_AGENT_RUN_URL`, `LLMSTORE_LINKED_AGENT_ID`
                  и `LLMSTORE_DEPLOYMENT_SECRET` в env.
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Env переменные
                </label>
                <textarea
                  value={projectDeploymentEnvText}
                  onChange={(e) => setProjectDeploymentEnvText(e.target.value)}
                  className="min-h-[180px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
                  placeholder={'TELEGRAM_BOT_TOKEN=123456:ABC\nTELEGRAM_SECRET_TOKEN=my-secret'}
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground">
                  Формат: `KEY=value` по одной строке. Для Telegram обычно достаточно `TELEGRAM_BOT_TOKEN`
                  и опционально `TELEGRAM_SECRET_TOKEN`.
                </p>
              </div>

              <label className="flex items-start gap-3 rounded-md border border-border/70 bg-muted/20 px-3 py-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-input"
                  checked={projectDeploymentSetTelegramWebhook}
                  onChange={(e) => setProjectDeploymentSetTelegramWebhook(e.target.checked)}
                />
                <span className="space-y-1">
                  <span className="block font-medium text-foreground">Сразу установить webhook в Telegram</span>
                  <span className="block text-xs text-muted-foreground">
                    После успешного deploy backend вызовет `setWebhook` в Telegram на URL этого deployment.
                    Нужен `TELEGRAM_BOT_TOKEN`, а если указан `TELEGRAM_SECRET_TOKEN`, он тоже будет передан.
                  </span>
                </span>
              </label>

              {projectDeploymentError && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {projectDeploymentError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t bg-slate-50 px-5 py-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setProjectDeploymentEditorOpen(false)}
                disabled={projectDeploying}
              >
                Отмена
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => { void saveProjectDeployment(); }}
                disabled={projectDeploying}
              >
                {projectDeploying ? 'Разворачиваю...' : 'Развернуть'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {previewEditor && (
        <div
          className="fixed inset-0 z-[135] flex items-center justify-center bg-black/85 p-3"
          onClick={() => !editorBusy && setPreviewEditor(null)}
        >
          <div
            className="flex h-[94vh] w-[98vw] max-w-[1600px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">Редактор preview</p>
                <p className="text-xs text-slate-500">Файл: index.html</p>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="order-5" onClick={() => setPreviewEditor(null)} disabled={editorBusy}>
                  Закрыть
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="order-1"
                  disabled={editorBusy}
                  onClick={() => { void exportEditedPreviewProject(); }}
                >
                  {editorExporting ? 'Экспортирую...' : 'Экспортировать'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="order-3"
                  disabled={editorBusy}
                  onClick={applyBeautifyToEditor}
                >
                  Beautify
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="order-4"
                  disabled={editorBusy || !onSavePreview}
                  onClick={() => { void savePreviewEditor(); }}
                >
                  {editorSaving ? 'Сохраняю...' : 'Сохранить'}
                </Button>
              </div>
            </div>

            {editorError && (
              <div className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
                {editorError}
              </div>
            )}

            <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-h-0 border-b lg:border-b-0 lg:border-r">
                <div className="flex h-full min-h-0 flex-col">
                  <div className="border-b px-4 py-3">
                    <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Заголовок preview
                    </label>
                    <input
                      value={previewEditor.title}
                      onChange={(e) => {
                        setPreviewEditor((prev) => (prev ? { ...prev, title: e.target.value } : prev));
                        setEditorStatus(null);
                      }}
                      className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      placeholder="Название preview"
                    />
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-1 text-xs font-medium">
                        index.html
                      </div>
                      <p className="text-xs text-muted-foreground">HTML редактор</p>
                    </div>
                    <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border border-input bg-background">
                      <pre
                        ref={editorHighlightRef}
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 overflow-auto px-3 py-2 font-mono text-xs leading-5 text-slate-900"
                      >
                        <code
                          className="block min-h-full whitespace-pre-wrap break-words"
                          dangerouslySetInnerHTML={{ __html: `${highlightedEditorHtml || '<br />'}\n` }}
                        />
                      </pre>
                      <textarea
                        ref={editorTextareaRef}
                        value={previewEditor.html}
                        onChange={(e) => updatePreviewEditorHtml(e.target.value)}
                        onKeyDown={handleEditorKeyDown}
                        onScroll={syncEditorScroll}
                        className={cn(
                          'absolute inset-0 min-h-0 h-full w-full resize-none bg-transparent px-3 py-2',
                          'font-mono text-xs leading-5 text-transparent caret-slate-900',
                          'selection:bg-primary/20 outline-none ring-0 focus:outline-none focus:ring-0',
                        )}
                        spellCheck={false}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="min-h-0 bg-slate-50">
                <div className="flex h-full min-h-0 flex-col">
                  <div className="border-b bg-white px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Предпросмотр
                    </p>
                  </div>
                  <div className="min-h-0 flex-1 p-4">
                    <HtmlPreviewBrowser
                      title={previewEditor.title || 'Agent preview'}
                      html={previewEditor.html}
                      revisionKey={getStringHash(previewEditor.html)}
                      className="h-full w-full"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-slate-50 px-4 py-2 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-3">
                <span><span className="font-medium text-foreground">Tab</span> отступ</span>
                <span><span className="font-medium text-foreground">Shift+Tab</span> убрать отступ</span>
                <span><span className="font-medium text-foreground">Ctrl+Z</span> отмена</span>
                <span><span className="font-medium text-foreground">Ctrl+S</span> сохранить</span>
                <span><span className="font-medium text-foreground">Beautify</span> форматировать код</span>
              </div>
              <span className={cn('min-h-[1rem]', editorStatus ? 'text-foreground' : 'text-transparent')}>
                {editorStatus || 'status'}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
