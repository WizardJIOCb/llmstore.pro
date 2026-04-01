import { db } from '../../config/database.js';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import type { Response } from 'express';
import { agents, agentVersions, agentVersionTools, toolDefinitions } from '../../db/schema/agents.js';
import {
  agentRuns,
  agentRunMessages,
  agentRunToolCalls,
  chatSessions,
  chatConversations,
  chatConversationMessages,
} from '../../db/schema/runtime.js';
import { usageLedger } from '../../db/schema/analytics.js';
import { users } from '../../db/schema/auth.js';
import { eq, desc, and, or, sql, asc, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { openRouterClient } from '../openrouter/index.js';
import { executeTool } from '../tool-execution/index.js';
import { NotFoundError, AppError } from '../../middleware/error-handler.js';
import { logger } from '../../lib/logger.js';
import type { ChatMessage, ToolDefinitionParam } from '../openrouter/types.js';
import { UPLOADS_DIR } from '../../config/upload.js';
import { openChatEventStream, publishChatEvent } from './chat-events.service.js';
import {
  getStarterPromptSettings,
  getUsdToRubRate,
  resolveStarterPromptsForAgentSlug,
} from '../../lib/app-settings.js';
import { chargeUserBalanceForUsage } from '../../lib/billing.js';

const DEFAULT_MODEL = 'google/gemini-2.0-flash-001';
const DEFAULT_MAX_ITERATIONS = 4;
const CHAT_UPLOADS_DIR = path.join(UPLOADS_DIR, 'chat');

interface ChatAttachmentInput {
  filename: string;
  original_name?: string | null;
  url?: string | null;
  kind?: 'image' | 'text' | 'file' | null;
  mime_type?: string | null;
  size?: number | null;
}

interface ChatAttachmentMeta {
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  kind: 'image' | 'text' | 'file';
  url: string;
  text_preview?: string;
}

type ChatAccess = 'public' | 'private' | 'restricted';

interface CodingReportChangedFile {
  path: string;
  summary?: string;
}

interface CodingReportPreview {
  type: 'html' | 'url';
  title?: string;
  html?: string;
  url?: string;
}

interface CodingReport {
  summary?: string;
  worklog?: string[];
  changed_files?: CodingReportChangedFile[];
  how_to_run?: string[];
  notes?: string[];
  preview?: CodingReportPreview | null;
}

// Pricing per 1M tokens (USD) - OpenRouter rates, verified on April 1, 2026.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'google/gemini-2.0-flash-001': { input: 0.10, output: 0.40 },
  'google/gemini-2.0-flash-lite-001': { input: 0.075, output: 0.30 },
  'google/gemini-2.5-flash': { input: 0.15, output: 0.60 },
  'google/gemini-2.5-flash-preview': { input: 0.15, output: 0.60 },
  'openai/gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'openai/gpt-5.4-mini': { input: 0.75, output: 4.50 },
  'gpt-5.4-mini': { input: 0.75, output: 4.50 },
  'anthropic/claude-haiku-4.5': { input: 1.00, output: 5.00 },
  'claude-haiku-4.5': { input: 1.00, output: 5.00 },
  'anthropic/claude-sonnet-4.6': { input: 3.00, output: 15.00 },
  'claude-sonnet-4.6': { input: 3.00, output: 15.00 },
  'anthropic/claude-opus-4.6': { input: 5.00, output: 25.00 },
  'claude-opus-4.6': { input: 5.00, output: 25.00 },
  'qwen/qwen3-coder-plus': { input: 0.65, output: 3.25 },
  'qwen3-coder-plus': { input: 0.65, output: 3.25 },
};

function estimateCost(model: string, promptTokens: number, completionTokens: number): string {
  const normalizedModel = model.trim().toLowerCase();
  const pricing = MODEL_PRICING[normalizedModel] ?? { input: 0.10, output: 0.40 };
  const cost = (promptTokens * pricing.input + completionTokens * pricing.output) / 1_000_000;
  return cost.toFixed(6);
}

function recalculateUsageCost<T extends Record<string, unknown> | null>(usage: T): T {
  if (!usage) return usage;

  const model = typeof usage.model === 'string' ? usage.model.trim() : '';
  const promptTokens = toNumberOrNull(usage.prompt_tokens);
  const completionTokens = toNumberOrNull(usage.completion_tokens);
  const totalTokens = toNumberOrNull(usage.total_tokens)
    ?? ((promptTokens ?? 0) + (completionTokens ?? 0));

  if (!model || promptTokens === null || completionTokens === null) {
    return usage;
  }

  return {
    ...usage,
    total_tokens: totalTokens,
    estimated_cost: estimateCost(model, promptTokens, completionTokens),
    model,
  } as T;
}

function attachUsdToRubRate<T extends Record<string, unknown> | null>(usage: T, usdToRubRate: number): T {
  if (!usage) return usage;

  return {
    ...usage,
    usd_to_rub_rate: usdToRubRate,
  } as T;
}

async function ensureSufficientBalance(userId: string) {
  const [user] = await db
    .select({ balance_usd: users.balance_usd })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw new NotFoundError('Р РµСЃСѓСЂСЃ РЅРµ РЅР°Р№РґРµРЅ');

  const balance = Number(user.balance_usd);
  if (!(balance > 0)) {
    throw new AppError(
      402,
      'INSUFFICIENT_BALANCE',
      'У вас не осталось баланса. Скоро вы сможете пополнить его на сайте, а пока можете написать Родиону.',
    );
  }
}

function isPrivilegedRole(role?: string | null): boolean {
  return role === 'admin' || role === 'curator';
}

function normalizeChatAccess(value: unknown): ChatAccess {
  if (value === 'private' || value === 'restricted') return value;
  return 'public';
}

function normalizeAccessIdentifier(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;

  if (trimmed.includes('@') && !trimmed.startsWith('@')) {
    return trimmed;
  }

  const username = trimmed.replace(/^@+/, '');
  return username ? `@${username}` : null;
}

function normalizeAccessIdentifiers(values: unknown): string[] {
  if (!Array.isArray(values)) return [];

  const unique = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const normalized = normalizeAccessIdentifier(value);
    if (normalized) unique.add(normalized);
  }
  return Array.from(unique).slice(0, 200);
}

async function ensureChatShareToken(chatId: string, shareToken?: string | null): Promise<string> {
  if (shareToken) return shareToken;

  const token = uuidv4().replace(/-/g, '').slice(0, 16);
  await db.update(chatConversations)
    .set({ share_token: token, updated_at: new Date() })
    .where(eq(chatConversations.id, chatId));
  return token;
}

async function resolveUserIdentity(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      name: users.name,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw new NotFoundError('Ресурс не найден');
  return user;
}

async function ensureChatViewerAccess(
  chat: Pick<ChatConversationRow, 'id' | 'user_id' | 'access' | 'access_identifiers'>,
  viewerUserId?: string | null,
) {
  if (chat.access === 'public') return;

  if (!viewerUserId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Для этого чата требуется авторизация');
  }

  if (chat.user_id === viewerUserId) return;

  if (chat.access === 'private') {
    throw new AppError(403, 'FORBIDDEN', 'Этот чат приватный');
  }

  const viewer = await resolveUserIdentity(viewerUserId);
  const candidates = new Set<string>();
  if (viewer.email) candidates.add(viewer.email.trim().toLowerCase());
  if (viewer.username) {
    const normalizedUsername = viewer.username.trim().toLowerCase().replace(/^@+/, '');
    if (normalizedUsername) {
      candidates.add(normalizedUsername);
      candidates.add(`@${normalizedUsername}`);
    }
  }

  const allowed = normalizeAccessIdentifiers(chat.access_identifiers);
  if (allowed.some((item) => candidates.has(item))) return;

  throw new AppError(403, 'FORBIDDEN', 'У вас нет доступа к этому чату');
}

async function ensureAgentIsVisibleForUser(agentId: string, userId: string, userRole?: string | null) {
  const [agent] = await db
    .select({
      id: agents.id,
      owner_user_id: agents.owner_user_id,
      visibility: agents.visibility,
      status: agents.status,
      current_version_id: agents.current_version_id,
    })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent) {
    throw new NotFoundError('Р РµСЃСѓСЂСЃ РЅРµ РЅР°Р№РґРµРЅ');
  }

  if (agent.status !== 'active' || !agent.current_version_id) {
    throw new AppError(400, 'AGENT_UNAVAILABLE', 'Р’С‹Р±СЂР°РЅРЅС‹Р№ Р°РіРµРЅС‚ РЅРµРґРѕСЃС‚СѓРїРµРЅ');
  }

  if (
    agent.visibility === 'public'
    || agent.owner_user_id === userId
    || isPrivilegedRole(userRole)
  ) {
    return;
  }

  throw new AppError(403, 'FORBIDDEN', 'Р­С‚РѕС‚ Р°РіРµРЅС‚ РЅРµРґРѕСЃС‚СѓРїРµРЅ РґР»СЏ РІС‹Р±СЂР°РЅРЅРѕРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ');
}

// --- Types ---

interface StartRunInput {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  variables?: Record<string, string>;
  model_external_id?: string | null;
}

interface StrictPreviewEditOptions {
  user_request: string;
  original_html: string;
  preview_title?: string | null;
}

interface StartRunOptions {
  sync_to_chats?: boolean;
  on_event?: (event: string, payload: Record<string, unknown>) => void;
  strict_preview_edit?: StrictPreviewEditOptions | null;
}

interface RunResult {
  run_id: string;
  status: string;
  output: string;
  tool_traces: ToolTrace[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost: string;
    model: string;
    usd_to_rub_rate?: number;
  } | null;
  latency_ms: number;
  coding_report?: CodingReport | null;
  error_message?: string;
}

interface ToolTrace {
  tool_call_id: string;
  tool_name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  status: string;
  duration_ms: number | null;
  error?: string;
}

const TEXT_ATTACHMENT_EXTENSIONS = new Set([
  '.txt',
  '.log',
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
  '.svg',
]);

const TEXT_ATTACHMENT_BASENAMES = new Set([
  '.env',
  '.gitignore',
  'dockerfile',
]);

function extractAssistantText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!content) return '';

  if (Array.isArray(content)) {
    const parts = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (!part || typeof part !== 'object') return '';
        const maybePart = part as { type?: unknown; text?: unknown };
        if (typeof maybePart.text === 'string') return maybePart.text;
        if (maybePart.type === 'text' && typeof maybePart.text === 'string') return maybePart.text;
        return '';
      })
      .filter((v) => v.trim().length > 0);
    return parts.join('\n').trim();
  }

  if (typeof content === 'object') {
    const maybe = content as { text?: unknown };
    if (typeof maybe.text === 'string') return maybe.text.trim();
  }

  return '';
}

function extractAssistantTextFromMessage(message: unknown): string {
  if (!message || typeof message !== 'object') return '';
  const msg = message as {
    content?: unknown;
    output_text?: unknown;
    text?: unknown;
    refusal?: unknown;
  };

  const directCandidates = [msg.content, msg.output_text, msg.text, msg.refusal];
  for (const candidate of directCandidates) {
    const extracted = extractAssistantText(candidate);
    if (extracted) return extracted;
  }

  return '';
}

function normalizeOpenRouterModelId(modelId: string): string {
  const value = modelId.trim();
  if (!value) return DEFAULT_MODEL;

  const aliases: Record<string, string> = {
    'gemini-2.0-flash-001': 'google/gemini-2.0-flash-001',
    'gemini-2.0-flash-lite-001': 'google/gemini-2.0-flash-lite-001',
    'gemini-2.5-flash-preview': 'google/gemini-2.5-flash',
    'google/gemini-2.5-flash-preview': 'google/gemini-2.5-flash',
    'gemini-2.5-flash': 'google/gemini-2.5-flash',
    'gpt-4o-mini': 'openai/gpt-4o-mini',
    'gpt-4o': 'openai/gpt-4o',
  };
  return aliases[value] ?? value;
}

function isTextFilename(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  const basename = path.basename(filename).toLowerCase();
  return TEXT_ATTACHMENT_EXTENSIONS.has(ext) || TEXT_ATTACHMENT_BASENAMES.has(basename);
}

function getAttachmentMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const basename = path.basename(filename).toLowerCase();
  if (TEXT_ATTACHMENT_BASENAMES.has(basename)) {
    return 'text/plain';
  }
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    case '.txt':
    case '.log': return 'text/plain';
    case '.md': return 'text/markdown';
    case '.csv': return 'text/csv';
    case '.json': return 'application/json';
    case '.xml': return 'application/xml';
    case '.html':
    case '.htm': return 'text/html';
    case '.css':
    case '.scss':
    case '.sass':
    case '.less': return 'text/css';
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs': return 'application/javascript';
    case '.ts':
    case '.tsx': return 'application/typescript';
    case '.py':
    case '.java':
    case '.kt':
    case '.go':
    case '.rs':
    case '.php':
    case '.rb':
    case '.sh':
    case '.bash':
    case '.zsh':
    case '.sql':
    case '.yml':
    case '.yaml':
    case '.toml':
    case '.ini':
    case '.conf':
    case '.svg': return 'text/plain';
    default: return 'application/octet-stream';
  }
}

function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

function isTextMime(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/')
    || mimeType === 'application/json'
    || mimeType === 'application/xml'
    || mimeType === 'text/xml'
    || mimeType === 'application/javascript'
    || mimeType === 'application/x-javascript'
    || mimeType === 'application/typescript'
  );
}

function safeAttachmentPath(filename: string): string {
  return path.join(CHAT_UPLOADS_DIR, path.basename(filename));
}

function clampText(value: unknown, max = 4000): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function normalizeStringArray(value: unknown, maxItems = 12, maxItemLength = 1000): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map((item) => clampText(item, maxItemLength))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeChangedFiles(value: unknown): CodingReportChangedFile[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as { path?: unknown; summary?: unknown };
      const filePath = clampText(row.path, 500);
      if (!filePath) return null;
      const summary = clampText(row.summary, 500);
      return summary
        ? { path: filePath, summary }
        : { path: filePath };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 20);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizePreview(value: unknown): CodingReportPreview | null | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const preview = value as { type?: unknown; title?: unknown; html?: unknown; url?: unknown };
  const type = preview.type === 'url' ? 'url' : (preview.type === 'html' ? 'html' : undefined);
  if (!type) return undefined;

  if (type === 'url') {
    const url = clampText(preview.url, 2000);
    if (!url) return null;
    return {
      type,
      title: clampText(preview.title, 200),
      url,
    };
  }

  const html = clampText(preview.html, 50_000);
  if (!html) return null;
  return {
    type,
    title: clampText(preview.title, 200),
    html,
  };
}

function sanitizeCodingReport(value: unknown): CodingReport | null {
  if (!value || typeof value !== 'object') return null;
  const report = value as Record<string, unknown>;
  const normalized: CodingReport = {
    summary: clampText(report.summary, 2000),
    worklog: normalizeStringArray(report.worklog, 16, 1200),
    changed_files: normalizeChangedFiles(report.changed_files),
    how_to_run: normalizeStringArray(report.how_to_run, 12, 1200),
    notes: normalizeStringArray(report.notes, 12, 1200),
    preview: normalizePreview(report.preview) ?? null,
  };

  if (
    !normalized.summary
    && !normalized.worklog
    && !normalized.changed_files
    && !normalized.how_to_run
    && !normalized.notes
    && !normalized.preview
  ) {
    return null;
  }

  return normalized;
}

function extractFirstJsonObject(value: string): { json: string; endIndex: number } | null {
  const start = value.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return {
          json: value.slice(start, index + 1),
          endIndex: index + 1,
        };
      }
    }
  }

  return null;
}

function extractCodingReport(content: string): { cleanText: string; report: CodingReport | null } {
  const openMatch = content.match(/<dev-report>\s*/i);
  if (!openMatch || openMatch.index == null) {
    return { cleanText: content.trim(), report: null };
  }

  const startIndex = openMatch.index;
  const payloadStart = startIndex + openMatch[0].length;
  const tail = content.slice(payloadStart);
  const closeMatch = tail.match(/\s*<\/dev-report>/i);
  const payloadEnd = closeMatch?.index ?? tail.length;
  const closeEnd = closeMatch
    ? payloadStart + payloadEnd + closeMatch[0].length
    : payloadStart + payloadEnd;
  const payload = content.slice(payloadStart, payloadStart + payloadEnd);

  let report: CodingReport | null = null;
  let recoveredJsonEnd: number | null = null;
  try {
    report = sanitizeCodingReport(JSON.parse(payload));
  } catch {
    const rawJson = extractFirstJsonObject(payload);
    if (rawJson) {
      try {
        report = sanitizeCodingReport(JSON.parse(rawJson.json));
        recoveredJsonEnd = rawJson.endIndex;
      } catch {
        report = null;
      }
    }
  }

  const before = content.slice(0, startIndex).trim();
  const after = closeMatch
    ? content.slice(closeEnd).trim()
    : (
      recoveredJsonEnd !== null
        ? payload
          .slice(recoveredJsonEnd)
          .replace(/^(\s*<\/script>\s*)+/gi, '')
          .trim()
        : ''
    );
  const cleanText = [before, after].filter(Boolean).join('\n\n').trim();
  return { cleanText, report };
}

function normalizeAssistantChatPayload(
  content: string,
  usage: Record<string, unknown> | null,
): { content: string; usage: Record<string, unknown> | null; codingReport: CodingReport | null } {
  const parsed = extractCodingReport(content);
  const usageCodingReport = sanitizeCodingReport(usage?.coding_report);
  const codingReport = parsed.report ?? usageCodingReport;

  return {
    content: parsed.cleanText || codingReport?.summary || '',
    usage: codingReport
      ? {
        ...(usage ?? {}),
        coding_report: codingReport,
      }
      : usage,
    codingReport,
  };
}

function encodeCodingReport(report: CodingReport): string {
  return JSON.stringify(report, null, 2);
}

function applyCodingReportToContent(content: string, report: CodingReport): string {
  const encoded = encodeCodingReport(report);
  const cleanText = extractCodingReport(content).cleanText;
  return cleanText
    ? `<dev-report>\n${encoded}\n</dev-report>\n\n${cleanText}`
    : `<dev-report>\n${encoded}\n</dev-report>`;
}

function injectPreviewBridgeHtml(html: string, previewId?: string): string {
  const resolvedPreviewId = previewId ?? 'standalone-preview';
  const emojiAssetVersion = '20260401b';
  const bridge = `
<style id="llmstore-preview-emoji-bridge">
.llmstore-emoji-fallback {
  display: inline-block !important;
  width: 1em !important;
  height: 1em !important;
  vertical-align: -0.12em !important;
  object-fit: contain !important;
}
</style>
<script>
(() => {
  const previewId = ${JSON.stringify(resolvedPreviewId)};
  const emojiRegex = /\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?/gu;
  const previewOrigin = typeof window.__LLMSTORE_PREVIEW_ORIGIN__ === 'string' && window.__LLMSTORE_PREVIEW_ORIGIN__
    ? window.__LLMSTORE_PREVIEW_ORIGIN__
    : window.location.origin;
  const emojiAssetBase = new URL('/api/emoji/', previewOrigin).toString();

  const shouldSkipEmojiWrap = (node) => {
    const parent = node.parentElement;
    if (!parent) return true;
    return !!parent.closest('script, style, textarea, input, option');
  };

  const toEmojiCodePoint = (value) => Array.from(value)
    .map((symbol) => symbol.codePointAt(0)?.toString(16))
    .filter((code) => code && code !== 'fe0f')
    .join('-');

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
      const index = match.index ?? 0;
      if (index > lastIndex) {
        fragment.appendChild(document.createTextNode(node.nodeValue.slice(lastIndex, index)));
      }

      const img = document.createElement('img');
      img.className = 'llmstore-emoji-fallback';
      img.alt = value;
      img.src = emojiAssetBase + toEmojiCodePoint(value) + '.svg?v=${emojiAssetVersion}';
      img.decoding = 'async';
      img.loading = 'lazy';
      img.draggable = false;
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => {
        const span = document.createElement('span');
        span.textContent = value;
        img.replaceWith(span);
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

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${bridge}</body>`);
  }

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}${bridge}`);
  }

  return `${bridge}${html}`;
}

function sanitizeGalleryPreviewHtml(html: string): string {
  const placeholderSvg = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#e2e8f0" />
          <stop offset="100%" stop-color="#cbd5e1" />
        </linearGradient>
      </defs>
      <rect width="640" height="400" fill="url(#g)" />
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
        font-family="Segoe UI, Arial, sans-serif" font-size="28" fill="#334155">
        Preview
      </text>
    </svg>`,
  )}`;

  return html
    .replace(/https?:\/\/via\.placeholder\.com\/[^"')\s]+/gi, placeholderSvg)
    .replace(/https?:\/\/placehold\.co\/[^"')\s]+/gi, placeholderSvg);
}

function injectGalleryPreviewStyles(html: string): string {
  const galleryStyles = `
<style id="llmstore-gallery-preview-mode">
html, body {
  overflow: hidden !important;
}
body {
  pointer-events: none !important;
}
a, button, input, textarea, select {
  pointer-events: none !important;
}
</style>`;

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${galleryStyles}</head>`);
  }

  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body([^>]*)>/i, `<head>${galleryStyles}</head><body$1>`);
  }

  return `${galleryStyles}${html}`;
}

function preparePreviewHtml(html: string, options?: { previewId?: string; galleryMode?: boolean }): string {
  const nextHtml = options?.galleryMode
    ? injectGalleryPreviewStyles(sanitizeGalleryPreviewHtml(html))
    : html;
  return injectPreviewBridgeHtml(nextHtml, options?.previewId);
}

export async function prepareUploadedChatFiles(files: Express.Multer.File[]): Promise<ChatAttachmentMeta[]> {
  const result: ChatAttachmentMeta[] = [];
  for (const file of files) {
    const mime = file.mimetype || getAttachmentMimeType(file.filename);
    const kind: ChatAttachmentMeta['kind'] = isImageMime(mime)
      ? 'image'
      : ((isTextMime(mime) || isTextFilename(file.originalname || file.filename)) ? 'text' : 'file');
    let textPreview: string | undefined;
    if (kind === 'text') {
      try {
        const raw = await readFile(file.path, 'utf8');
        const compact = raw.replace(/\r\n/g, '\n').trim();
        if (compact.length > 0) textPreview = compact.slice(0, 400);
      } catch {
        textPreview = undefined;
      }
    }
    result.push({
      filename: file.filename,
      original_name: file.originalname || file.filename,
      mime_type: mime,
      size: file.size,
      kind,
      url: `/uploads/chat/${file.filename}`,
      text_preview: textPreview,
    });
  }
  return result;
}

// --- Core Runtime ---

export async function startRun(
  agentId: string,
  userId: string,
  input: StartRunInput,
  options: StartRunOptions = {},
): Promise<RunResult> {
  const startTime = Date.now();
  await ensureSufficientBalance(userId);
  const syncToChats = options.sync_to_chats ?? false;
  const emitEvent = options.on_event ?? (() => undefined);
  const latestUserMessage = [...input.messages]
    .reverse()
    .find((msg) => msg.role === 'user' && msg.content.trim().length > 0)
    ?.content
    .trim() ?? '';

  // 1. Load agent + version + tools
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agent) throw new NotFoundError('Р РµСЃСѓСЂСЃ РЅРµ РЅР°Р№РґРµРЅ');

  if (!agent.current_version_id) {
    throw new AppError(400, 'NO_VERSION', 'РЈ Р°РіРµРЅС‚Р° РЅРµС‚ Р°РєС‚РёРІРЅРѕР№ РІРµСЂСЃРёРё');
  }

  const [version] = await db.select().from(agentVersions).where(eq(agentVersions.id, agent.current_version_id)).limit(1);
  if (!version) throw new NotFoundError('Р РµСЃСѓСЂСЃ РЅРµ РЅР°Р№РґРµРЅ');

  const versionToolRows = await db
    .select({ tool: toolDefinitions })
    .from(agentVersionTools)
    .innerJoin(toolDefinitions, eq(agentVersionTools.tool_definition_id, toolDefinitions.id))
    .where(
      and(
        eq(agentVersionTools.agent_version_id, version.id),
        eq(toolDefinitions.is_active, true),
      ),
    )
    .orderBy(agentVersionTools.order_index);
  const tools = versionToolRows.map(r => r.tool);

  // 2. Parse runtime config
  const runtimeConfig = (version.runtime_config || {}) as {
    max_iterations?: number;
    temperature?: number;
    max_tokens?: number;
    model_external_id?: string;
    chat_intro?: string;
  };
  const strictPreviewEdit = options.strict_preview_edit ?? null;
  const modelId = normalizeOpenRouterModelId(
    input.model_external_id ?? runtimeConfig.model_external_id ?? DEFAULT_MODEL,
  );
  const maxIterations = runtimeConfig.max_iterations ?? DEFAULT_MAX_ITERATIONS;
  const effectiveTemperature = strictPreviewEdit
    ? Math.min(runtimeConfig.temperature ?? 0.3, 0.05)
    : (runtimeConfig.temperature ?? 0.3);
  let syncedConversationId: string | null = null;

  if (syncToChats) {
    const [existingConversation] = await db
      .select({ id: chatConversations.id })
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.user_id, userId),
          eq(chatConversations.mode, 'agent'),
          eq(chatConversations.agent_id, agentId),
        ),
      )
      .orderBy(desc(chatConversations.last_message_at))
      .limit(1);

    if (existingConversation) {
      syncedConversationId = existingConversation.id;
    } else {
      const [createdConversation] = await db.insert(chatConversations).values({
        user_id: userId,
        mode: 'agent',
        agent_id: agentId,
        title: (latestUserMessage || 'РќРѕРІС‹Р№ С‡Р°С‚').slice(0, 500),
        model_external_id: modelId,
        last_message_at: new Date(),
      }).returning({ id: chatConversations.id });
      syncedConversationId = createdConversation.id;
    }

    if (latestUserMessage) {
      await db.insert(chatConversationMessages).values({
        conversation_id: syncedConversationId,
        role: 'user',
        content_text: latestUserMessage,
      });
    }
  }

  // 4. Create run record
  const traceId = uuidv4();
  const [run] = await db.insert(agentRuns).values({
    agent_id: agentId,
    agent_version_id: version.id,
    user_id: userId,
    status: 'preparing',
    mode: 'chat',
    provider_name: 'openrouter',
    trace_id: traceId,
    input_summary: input.messages[input.messages.length - 1]?.content?.slice(0, 200) ?? '',
  }).returning();

  // 4b. Link run to chat session (find or create)
  const [existingSession] = await db
    .select().from(chatSessions)
    .where(and(eq(chatSessions.agent_id, agentId), eq(chatSessions.user_id, userId)))
    .limit(1);

  let sessionId: string;
  if (existingSession) {
    sessionId = existingSession.id;
  } else {
    const firstMsg = input.messages[input.messages.length - 1]?.content?.slice(0, 100) ?? null;
    const [newSession] = await db.insert(chatSessions).values({
      agent_id: agentId,
      user_id: userId,
      title: firstMsg,
    }).returning();
    sessionId = newSession.id;
  }
  await db.update(agentRuns).set({ session_key: sessionId }).where(eq(agentRuns.id, run.id));

  // 5. Build messages
  const messages: ChatMessage[] = [];
  const systemParts: string[] = [];
  if (typeof version.system_prompt === 'string' && version.system_prompt.trim().length > 0) {
    systemParts.push(version.system_prompt.trim());
  }
  if (typeof runtimeConfig.chat_intro === 'string' && runtimeConfig.chat_intro.trim().length > 0) {
    systemParts.push(`РћРїРёСЃР°РЅРёРµ Р°РіРµРЅС‚Р° РґР»СЏ С‡Р°С‚Р°:\n${runtimeConfig.chat_intro.trim()}`);
  }
  if (typeof agent.description === 'string' && agent.description.trim().length > 0) {
    systemParts.push(`РљСЂР°С‚РєРѕРµ РѕРїРёСЃР°РЅРёРµ Р°РіРµРЅС‚Р°:\n${agent.description.trim()}`);
  }
  if (strictPreviewEdit) {
    systemParts.push(buildStrictPreviewEditInstruction(strictPreviewEdit));
  }
  if (systemParts.length > 0) {
    messages.push({ role: 'system', content: systemParts.join('\n\n') });
  }
  for (const msg of input.messages) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // 6. Build tools array
  const toolParams: ToolDefinitionParam[] = tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.slug,
      description: t.description || t.name,
      parameters: t.input_schema,
    },
  }));

  logger.info({ runId: run.id, agentId, toolCount: toolParams.length, toolNames: tools.map(t => t.slug) }, 'Starting agent run');

  // 7. Update run to running
  await db.update(agentRuns).set({ status: 'running' }).where(eq(agentRuns.id, run.id));
  emitEvent('chat.run.started', {
    run_id: run.id,
    agent_id: agentId,
    model: modelId,
    max_iterations: maxIterations,
  });
  emitEvent('chat.run.status', {
    run_id: run.id,
    status: 'running',
    label: 'Агент начал выполнение задачи',
  });

  const toolTraces: ToolTrace[] = [];
  let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  let finalOutput = '';
  let codingReport: CodingReport | null = null;
  let runStatus: 'completed' | 'failed' = 'completed';
  let errorMessage: string | undefined;
  let gotTerminalAssistantMessage = false;

  try {
    // 8. Main loop
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      logger.info({ runId: run.id, iteration, messageCount: messages.length, hasTools: toolParams.length > 0 }, 'Runtime loop iteration');
      emitEvent('chat.run.status', {
        run_id: run.id,
        status: 'thinking',
        iteration: iteration + 1,
        label: `Итерация ${iteration + 1}: анализирую задачу`,
      });

      const response = await openRouterClient.chatCompletion({
        model: modelId,
        messages,
        tools: toolParams.length > 0 ? toolParams : undefined,
        tool_choice: toolParams.length > 0 ? 'auto' : undefined,
        temperature: effectiveTemperature,
        max_tokens: runtimeConfig.max_tokens ?? 4096,
      });

      // Accumulate usage
      if (response.usage) {
        totalUsage.prompt_tokens += response.usage.prompt_tokens;
        totalUsage.completion_tokens += response.usage.completion_tokens;
        totalUsage.total_tokens += response.usage.total_tokens;
      }

      const choice = response.choices[0];
      if (!choice) {
        throw new AppError(502, 'EMPTY_RESPONSE', 'LLM returned no choices');
      }

      const assistantMessage = choice.message;
      logger.info({
        runId: run.id,
        iteration,
        finishReason: choice.finish_reason,
        hasToolCalls: !!(assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0),
        toolCallCount: assistantMessage.tool_calls?.length ?? 0,
      }, 'LLM response received');

            // If tool calls are present, execute tools and continue
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        // Add assistant message with tool calls
        messages.push(assistantMessage);

        await db.update(agentRuns).set({ status: 'tool_executing' }).where(eq(agentRuns.id, run.id));
        emitEvent('chat.run.status', {
          run_id: run.id,
          status: 'tool_executing',
          iteration: iteration + 1,
          label: `Запускаю инструменты: ${assistantMessage.tool_calls.length}`,
        });

        for (const toolCall of assistantMessage.tool_calls) {
          const toolSlug = toolCall.function.name;
          let toolInput: Record<string, unknown>;
          try {
            toolInput = JSON.parse(toolCall.function.arguments);
          } catch {
            toolInput = {};
          }

          // Find tool definition
          const toolDef = tools.find(t => t.slug === toolSlug);

          // Create tool call record
          const [tcRecord] = await db.insert(agentRunToolCalls).values({
            run_id: run.id,
            tool_definition_id: toolDef?.id ?? null,
            tool_call_id: toolCall.id,
            tool_name: toolSlug,
            tool_input: toolInput,
            status: 'running',
          }).returning();
          emitEvent('chat.run.tool.started', {
            run_id: run.id,
            tool_call_id: toolCall.id,
            tool_name: toolSlug,
            input: toolInput,
            label: `Запущен инструмент ${toolSlug}`,
          });

          let trace: ToolTrace;
          try {
            const execResult = await executeTool(toolSlug, toolInput, toolDef?.config_json ?? undefined);

            // Update tool call record
            await db.update(agentRunToolCalls).set({
              tool_output: execResult.result,
              status: 'success',
              duration_ms: execResult.duration_ms,
            }).where(eq(agentRunToolCalls.id, tcRecord.id));

            // Add tool result message
            messages.push({
              role: 'tool',
              content: JSON.stringify(execResult.result),
              tool_call_id: toolCall.id,
            });

            trace = {
              tool_call_id: toolCall.id,
              tool_name: toolSlug,
              input: toolInput,
              output: execResult.result,
              status: 'success',
              duration_ms: execResult.duration_ms,
            };
            emitEvent('chat.run.tool.finished', {
              run_id: run.id,
              tool_call_id: toolCall.id,
              tool_name: toolSlug,
              status: 'success',
              duration_ms: execResult.duration_ms,
              label: `Инструмент ${toolSlug} завершён успешно`,
            });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'Unknown error';

            await db.update(agentRunToolCalls).set({
              status: 'error',
              error_message: errMsg,
              duration_ms: 0,
            }).where(eq(agentRunToolCalls.id, tcRecord.id));

            // Still add tool result so the LLM knows about the error
            messages.push({
              role: 'tool',
              content: JSON.stringify({ error: errMsg }),
              tool_call_id: toolCall.id,
            });

            trace = {
              tool_call_id: toolCall.id,
              tool_name: toolSlug,
              input: toolInput,
              output: null,
              status: 'error',
              duration_ms: 0,
              error: errMsg,
            };
            emitEvent('chat.run.tool.finished', {
              run_id: run.id,
              tool_call_id: toolCall.id,
              tool_name: toolSlug,
              status: 'error',
              duration_ms: 0,
              error: errMsg,
              label: `Инструмент ${toolSlug} завершился с ошибкой`,
            });
          }

          toolTraces.push(trace);
        }

        await db.update(agentRuns).set({ status: 'continuing' }).where(eq(agentRuns.id, run.id));
        emitEvent('chat.run.status', {
          run_id: run.id,
          status: 'continuing',
          iteration: iteration + 1,
          label: 'Обрабатываю результаты инструментов',
        });
                continue; // Next iteration: LLM processes tool results
      }

      // No tool calls: final answer
      gotTerminalAssistantMessage = true;
      finalOutput = extractAssistantTextFromMessage(assistantMessage);
      if (finalOutput) {
        const parsed = extractCodingReport(finalOutput);
        finalOutput = parsed.cleanText;
        codingReport = parsed.report;
        if (!finalOutput && codingReport?.summary) {
          finalOutput = codingReport.summary;
        }
      }
      if (!finalOutput) {
        logger.warn(
          {
            runId: run.id,
            iteration,
            finishReason: choice.finish_reason,
            modelId,
            assistantMessage,
          },
          'Assistant returned empty content without tool calls',
        );
      }
      break;
    }
  } catch (err) {
    runStatus = 'failed';
    errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ runId: run.id, err }, 'Runtime execution failed');
  }

  if (runStatus === 'completed' && !finalOutput.trim()) {
    runStatus = 'failed';
    errorMessage = gotTerminalAssistantMessage
      ? 'РњРѕРґРµР»СЊ РЅРµ РІРµСЂРЅСѓР»Р° С‚РµРєСЃС‚РѕРІС‹Р№ РѕС‚РІРµС‚.'
      : `РђРіРµРЅС‚ РЅРµ РІРµСЂРЅСѓР» РёС‚РѕРіРѕРІС‹Р№ РѕС‚РІРµС‚: РґРѕСЃС‚РёРіРЅСѓС‚ Р»РёРјРёС‚ РёС‚РµСЂР°С†РёР№ (${maxIterations}).`;
    logger.warn({ runId: run.id, modelId, maxIterations }, 'Agent run completed without final text output');
  }

  if (
    runStatus === 'completed'
    && strictPreviewEdit
    && codingReport?.preview?.type === 'html'
    && codingReport.preview.html
    && shouldRetryStrictPreviewEdit(strictPreviewEdit.user_request, strictPreviewEdit.original_html, codingReport.preview.html)
  ) {
    emitEvent('chat.run.status', {
      run_id: run.id,
      status: 'repairing',
      label: 'Модель изменила слишком много, делаю более точную повторную правку',
    });

    const repairMessages: ChatMessage[] = [
      ...messages.filter((message) => message.role === 'system' || message.role === 'user' || message.role === 'assistant'),
      {
        role: 'system',
        content: buildStrictPreviewEditInstruction(strictPreviewEdit, true),
      },
      {
        role: 'user',
        content: [
          'Начни заново от исходного HTML и внеси только минимально необходимую правку.',
          `Запрос пользователя: ${strictPreviewEdit.user_request}`,
          strictPreviewEdit.preview_title ? `Название preview: ${strictPreviewEdit.preview_title}` : undefined,
          'Исходный HTML:',
          '```html',
          strictPreviewEdit.original_html,
          '```',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ];

    const repairResponse = await openRouterClient.chatCompletion({
      model: modelId,
      messages: repairMessages,
      temperature: 0,
      max_tokens: runtimeConfig.max_tokens ?? 4096,
    });

    if (repairResponse.usage) {
      totalUsage.prompt_tokens += repairResponse.usage.prompt_tokens;
      totalUsage.completion_tokens += repairResponse.usage.completion_tokens;
      totalUsage.total_tokens += repairResponse.usage.total_tokens;
    }

    const repairChoice = repairResponse.choices[0];
    const repairMessage = repairChoice?.message;
    const repairText = repairMessage ? extractAssistantTextFromMessage(repairMessage) : '';
    if (repairText) {
      const parsed = extractCodingReport(repairText);
      if (parsed.report?.preview?.type === 'html' && parsed.report.preview.html) {
        finalOutput = parsed.cleanText || parsed.report.summary || finalOutput;
        codingReport = parsed.report;
      }
    }
  }

  const latencyMs = Date.now() - startTime;

  // 9. Persist messages
  const allMessages = messages.map(m => ({
    run_id: run.id,
    role: m.role,
    content_text: typeof m.content === 'string' ? m.content : (m.content ? JSON.stringify(m.content) : null),
  }));
  if (allMessages.length > 0) {
    await db.insert(agentRunMessages).values(allMessages);
  }

  // 10. Persist usage
  const estCost = estimateCost(modelId, totalUsage.prompt_tokens, totalUsage.completion_tokens);
  const usdToRubRate = await getUsdToRubRate();
  if (totalUsage.total_tokens > 0) {
    await db.insert(usageLedger).values({
      run_id: run.id,
      provider: 'openrouter',
      model_external_id: modelId,
      provider_name: 'openrouter',
      prompt_tokens: totalUsage.prompt_tokens,
      completion_tokens: totalUsage.completion_tokens,
      total_tokens: totalUsage.total_tokens,
      estimated_cost: estCost,
      raw_usage_json: totalUsage as unknown as Record<string, unknown>,
    });
  }

  // 11. Update run with final state
  await db.update(agentRuns).set({
    status: runStatus,
    completed_at: new Date(),
    latency_ms: latencyMs,
    final_output: finalOutput || null,
    final_output_json: codingReport as Record<string, unknown> | null,
    output_summary: finalOutput?.slice(0, 200) || null,
    error_message: errorMessage ?? null,
  }).where(eq(agentRuns.id, run.id));

  if (syncToChats && syncedConversationId) {
    const usagePayload = totalUsage.total_tokens > 0
      ? {
        ...totalUsage,
        estimated_cost: estCost,
        model: modelId,
        usd_to_rub_rate: usdToRubRate,
        tool_traces: toolTraces,
        coding_report: codingReport,
      }
      : (
        toolTraces.length > 0 || codingReport
          ? {
            tool_traces: toolTraces,
            coding_report: codingReport,
          }
          : null
      );

    if (runStatus === 'completed' && finalOutput.trim().length > 0) {
      await db.insert(chatConversationMessages).values({
        conversation_id: syncedConversationId,
        role: 'assistant',
        content_text: finalOutput,
        run_id: run.id,
        usage_json: usagePayload as Record<string, unknown> | null,
        latency_ms: latencyMs,
      });
    }

    await db.update(chatConversations).set({
      title: latestUserMessage ? compactTitle(latestUserMessage) : undefined,
      model_external_id: modelId,
      last_message_at: new Date(),
      updated_at: new Date(),
    }).where(eq(chatConversations.id, syncedConversationId));
  }

  if (totalUsage.total_tokens > 0) {
    await chargeUserBalanceForUsage({
      user_id: userId,
      amount_usd: Number(estCost),
      type: 'agent_run_usage',
      description: `Списание за запуск агента ${agent.name}`,
    });
  }

  if (runStatus === 'completed') {
    emitEvent('chat.run.completed', {
      run_id: run.id,
      latency_ms: latencyMs,
      tool_count: toolTraces.length,
      has_preview: Boolean(codingReport?.preview),
      label: 'Агент завершил выполнение задачи',
    });
  } else {
    emitEvent('chat.run.failed', {
      run_id: run.id,
      error: errorMessage ?? 'Unknown error',
      label: 'Выполнение завершилось с ошибкой',
    });
  }

  return {
    run_id: run.id,
    status: runStatus,
    output: finalOutput,
    tool_traces: toolTraces,
    usage: totalUsage.total_tokens > 0
      ? { ...totalUsage, estimated_cost: estCost, model: modelId, usd_to_rub_rate: usdToRubRate }
      : null,
    latency_ms: latencyMs,
    coding_report: codingReport,
    error_message: errorMessage,
  };
}

// --- Query ---

export async function getRun(runId: string, userId: string) {
  const [run] = await db.select().from(agentRuns).where(
    and(eq(agentRuns.id, runId), eq(agentRuns.user_id, userId)),
  ).limit(1);

  if (!run) throw new NotFoundError('Р РµСЃСѓСЂСЃ РЅРµ РЅР°Р№РґРµРЅ');

  const messages = await db.select().from(agentRunMessages).where(eq(agentRunMessages.run_id, runId)).orderBy(agentRunMessages.created_at);
  const toolCalls = await db.select().from(agentRunToolCalls).where(eq(agentRunToolCalls.run_id, runId)).orderBy(agentRunToolCalls.created_at);

  return { ...run, messages, tool_calls: toolCalls };
}

export async function listRuns(userId: string, agentId?: string) {
  let query = db
    .select({
      id: agentRuns.id,
      agent_id: agentRuns.agent_id,
      status: agentRuns.status,
      mode: agentRuns.mode,
      input_summary: agentRuns.input_summary,
      output_summary: agentRuns.output_summary,
      latency_ms: agentRuns.latency_ms,
      started_at: agentRuns.started_at,
      completed_at: agentRuns.completed_at,
      error_message: agentRuns.error_message,
    })
    .from(agentRuns)
    .where(
      agentId
        ? and(eq(agentRuns.user_id, userId), eq(agentRuns.agent_id, agentId))
        : eq(agentRuns.user_id, userId),
    )
    .orderBy(desc(agentRuns.started_at))
    .limit(100);

  return query;
}

// --- Chat History ---

interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  runId?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost: string;
    model: string;
    usd_to_rub_rate?: number;
  } | null;
  latencyMs?: number;
  toolTraces?: ToolTrace[];
  codingReport?: CodingReport | null;
}

export async function getChatHistory(agentId: string, userId: string) {
  const usdToRubRate = await getUsdToRubRate();
  const [conversation] = await db
    .select({
      id: chatConversations.id,
      share_token: chatConversations.share_token,
    })
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.user_id, userId),
        eq(chatConversations.mode, 'agent'),
        eq(chatConversations.agent_id, agentId),
      ),
    )
    .orderBy(desc(chatConversations.last_message_at))
    .limit(1);

  if (conversation) {
    const conversationMessages = await db
      .select({
        role: chatConversationMessages.role,
        content_text: chatConversationMessages.content_text,
        run_id: chatConversationMessages.run_id,
        usage_json: chatConversationMessages.usage_json,
        latency_ms: chatConversationMessages.latency_ms,
      })
      .from(chatConversationMessages)
      .where(eq(chatConversationMessages.conversation_id, conversation.id))
      .orderBy(asc(chatConversationMessages.created_at));

    const mappedConversationMessages: ChatHistoryMessage[] = conversationMessages
      .filter((row) => row.role === 'user' || row.role === 'assistant')
      .map((row) => {
        const rawUsage = (row.usage_json as Record<string, unknown> | null) ?? null;
        const normalized = row.role === 'assistant'
          ? normalizeAssistantChatPayload(row.content_text, rawUsage)
          : { content: row.content_text, usage: rawUsage, codingReport: null };
        const normalizedUsage = recalculateUsageCost(normalized.usage);
        const promptTokens = normalizedUsage ? toNumberOrNull(normalizedUsage.prompt_tokens) : null;
        const completionTokens = normalizedUsage ? toNumberOrNull(normalizedUsage.completion_tokens) : null;
        const totalTokens = normalizedUsage
          ? (toNumberOrNull(normalizedUsage.total_tokens)
            ?? ((promptTokens ?? 0) + (completionTokens ?? 0)))
          : null;
        const estimatedCostRaw = normalizedUsage
          ? (normalizedUsage.estimated_cost as string | number | undefined)
          : undefined;
        const modelRaw = normalizedUsage ? normalizedUsage.model : undefined;
        const rawToolTraces = normalizedUsage?.tool_traces;

        const usage = (
          promptTokens !== null
          && completionTokens !== null
          && totalTokens !== null
        )
          ? {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
            estimated_cost:
              typeof estimatedCostRaw === 'string'
                ? estimatedCostRaw
                : String(estimatedCostRaw ?? '0'),
            model: typeof modelRaw === 'string' ? modelRaw : 'unknown',
            usd_to_rub_rate: usdToRubRate,
          }
          : null;

        return {
          role: row.role as 'user' | 'assistant',
          content: normalized.content,
          runId: row.run_id ?? undefined,
          usage,
          latencyMs: row.latency_ms ?? undefined,
          toolTraces: Array.isArray(rawToolTraces) ? rawToolTraces as ToolTrace[] : undefined,
          codingReport: normalized.codingReport,
        };
      });

    if (mappedConversationMessages.length > 0) {
      return {
        session_id: null,
        share_token: conversation.share_token ?? null,
        messages: mappedConversationMessages,
      };
    }
  }

  const [session] = await db
    .select().from(chatSessions)
    .where(and(eq(chatSessions.agent_id, agentId), eq(chatSessions.user_id, userId)))
    .limit(1);

  if (!session) {
    return { session_id: null, share_token: null, messages: [] as ChatHistoryMessage[] };
  }

  // Load completed runs for this session
  const runs = await db
    .select({
      id: agentRuns.id,
      input_summary: agentRuns.input_summary,
      final_output: agentRuns.final_output,
      final_output_json: agentRuns.final_output_json,
      latency_ms: agentRuns.latency_ms,
      status: agentRuns.status,
      started_at: agentRuns.started_at,
    })
    .from(agentRuns)
    .where(and(eq(agentRuns.session_key, session.id), eq(agentRuns.status, 'completed')))
    .orderBy(agentRuns.started_at);

  if (runs.length === 0) {
    return { session_id: session.id, share_token: session.share_token, messages: [] as ChatHistoryMessage[] };
  }

  // Load tool calls for all runs in one query
  const runIds = runs.map(r => r.id);
  const allToolCalls = await db
    .select()
    .from(agentRunToolCalls)
    .where(sql`${agentRunToolCalls.run_id} = ANY(${runIds})`)
    .orderBy(agentRunToolCalls.created_at);

  // Load usage data for all runs
  const allUsage = await db
    .select()
    .from(usageLedger)
    .where(sql`${usageLedger.run_id} = ANY(${runIds})`);

  // Group tool calls and usage by run_id
  const toolCallsByRun = new Map<string, ToolTrace[]>();
  for (const tc of allToolCalls) {
    const traces = toolCallsByRun.get(tc.run_id) ?? [];
    traces.push({
      tool_call_id: tc.tool_call_id,
      tool_name: tc.tool_name,
      input: tc.tool_input,
      output: tc.tool_output ?? null,
      status: tc.status,
      duration_ms: tc.duration_ms,
      error: tc.error_message ?? undefined,
    });
    toolCallsByRun.set(tc.run_id, traces);
  }

  const usageByRun = new Map<string, typeof allUsage[0]>();
  for (const u of allUsage) {
    usageByRun.set(u.run_id, u);
  }

  // Build message pairs
  const messages: ChatHistoryMessage[] = [];
  for (const run of runs) {
    if (run.input_summary) {
      messages.push({ role: 'user', content: run.input_summary });
    }
    if (run.final_output) {
      const u = usageByRun.get(run.id);
      const usage = u ? {
        prompt_tokens: u.prompt_tokens,
        completion_tokens: u.completion_tokens,
        total_tokens: u.total_tokens ?? (u.prompt_tokens + u.completion_tokens),
        estimated_cost: estimateCost(
          u.model_external_id,
          u.prompt_tokens,
          u.completion_tokens,
        ),
        model: u.model_external_id,
        usd_to_rub_rate: usdToRubRate,
      } : null;

      messages.push({
        role: 'assistant',
        content: run.final_output,
        runId: run.id,
        usage,
        latencyMs: run.latency_ms ?? undefined,
        toolTraces: toolCallsByRun.get(run.id),
        codingReport: sanitizeCodingReport(run.final_output_json),
      });
    }
  }

  return { session_id: session.id, share_token: session.share_token, messages };
}

export async function shareChat(agentId: string, userId: string) {
  const [session] = await db
    .select().from(chatSessions)
    .where(and(eq(chatSessions.agent_id, agentId), eq(chatSessions.user_id, userId)))
    .limit(1);

  if (!session) throw new NotFoundError('Р РµСЃСѓСЂСЃ РЅРµ РЅР°Р№РґРµРЅ');

  if (session.share_token) {
    return { share_token: session.share_token };
  }

  const token = uuidv4().replace(/-/g, '').slice(0, 16);
  await db.update(chatSessions)
    .set({ share_token: token, updated_at: new Date() })
    .where(eq(chatSessions.id, session.id));

  return { share_token: token };
}

export async function getSharedChat(token: string) {
  const [session] = await db
    .select().from(chatSessions)
    .where(eq(chatSessions.share_token, token))
    .limit(1);

  if (!session) throw new NotFoundError('Р РµСЃСѓСЂСЃ РЅРµ РЅР°Р№РґРµРЅ');

  // Load agent name
  const [agent] = await db.select({ name: agents.name }).from(agents).where(eq(agents.id, session.agent_id)).limit(1);

  // Load completed runs
  const runs = await db
    .select({
      id: agentRuns.id,
      input_summary: agentRuns.input_summary,
      final_output: agentRuns.final_output,
      latency_ms: agentRuns.latency_ms,
      started_at: agentRuns.started_at,
    })
    .from(agentRuns)
    .where(and(eq(agentRuns.session_key, session.id), eq(agentRuns.status, 'completed')))
    .orderBy(agentRuns.started_at);

  const messages: ChatHistoryMessage[] = [];
  for (const run of runs) {
    if (run.input_summary) {
      messages.push({ role: 'user', content: run.input_summary });
    }
    if (run.final_output) {
      messages.push({ role: 'assistant', content: run.final_output });
    }
  }

  return { messages, agent_name: agent?.name ?? 'Agent' };
}

export async function clearChatHistory(agentId: string, userId: string) {
  const [session] = await db
    .select().from(chatSessions)
    .where(and(eq(chatSessions.agent_id, agentId), eq(chatSessions.user_id, userId)))
    .limit(1);

  if (!session) return;

  // Unlink runs from session (keep runs for analytics)
  await db.update(agentRuns)
    .set({ session_key: null })
    .where(eq(agentRuns.session_key, session.id));

  // Delete the session
  await db.delete(chatSessions).where(eq(chatSessions.id, session.id));
}

const DEFAULT_GENERAL_MODEL = 'openai/gpt-4o-mini';

type ChatMode = 'general' | 'agent';

interface ChatConversationRow {
  id: string;
  user_id: string;
  agent_id: string | null;
  mode: ChatMode;
  title: string;
  model_external_id: string | null;
  system_prompt: string | null;
  access: ChatAccess;
  access_identifiers: string[];
  share_token: string | null;
  settings_json: Record<string, unknown> | null;
  last_message_at: Date;
  created_at: Date;
  updated_at: Date;
}

interface ConversationListItem {
  id: string;
  title: string;
  mode: ChatMode;
  agent_id: string | null;
  model_external_id: string | null;
  access: ChatAccess;
  access_identifiers: string[];
  share_token: string | null;
  message_count: number;
  last_message_preview: string | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

interface ChatAgentOption {
  id: string;
  name: string;
  owner_user_id: string;
  is_owner: boolean;
  description: string | null;
  chat_description: string | null;
  starter_prompts: string[];
}

interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  run_id: string | null;
  usage: Record<string, unknown> | null;
  latency_ms: number | null;
  created_at: string;
}

interface ConversationDetails {
  chat: Omit<ConversationListItem, 'last_message_preview' | 'message_count'> & {
    message_count: number;
    agent_name: string | null;
    agent_chat_description: string | null;
    agent_starter_prompts: string[];
  };
  messages: ConversationMessage[];
}

interface GalleryPreviewItem {
  message_id: string;
  chat_id: string;
  chat_title: string;
  chat_url: string;
  preview_title: string | null;
  preview_type: 'html' | 'url';
  preview_url: string | null;
  preview_html: string | null;
  author_name: string;
  view_count: number;
  created_at: string;
  total_usd_cost: number;
  total_rub_cost: number;
  model: string | null;
}

interface ChatStatsModelBreakdown {
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  usd_cost: number;
  rub_cost: number;
  messages: number;
}

interface ChatStatsResponse {
  chat: {
    id: string;
    title: string;
    mode: ChatMode;
    agent_id: string | null;
    agent_name: string | null;
    model_external_id: string | null;
    created_at: string;
    updated_at: string;
    last_message_at: string;
    message_count: number;
    user_messages: number;
    assistant_messages: number;
  };
  totals: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    usd_cost: number;
    rub_cost: number;
    messages_with_usage: number;
    total_latency_ms: number;
  };
  by_model: ChatStatsModelBreakdown[];
  usd_to_rub_rate: number;
}

function toIso(value: Date): string {
  return value.toISOString();
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function compactTitle(content: string): string {
  const text = content.replace(/\s+/g, ' ').trim();
  return text.length > 80 ? `${text.slice(0, 80)}...` : text || 'РќРѕРІС‹Р№ С‡Р°С‚';
}

function extractStarterPrompts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v.length > 0)
    .slice(0, 12);
}

async function getConversationForUser(chatId: string, userId: string): Promise<ChatConversationRow> {
  const [chat] = await db
    .select()
    .from(chatConversations)
    .where(and(eq(chatConversations.id, chatId), eq(chatConversations.user_id, userId)))
    .limit(1);

  if (!chat) throw new NotFoundError('Р РµСЃСѓСЂСЃ РЅРµ РЅР°Р№РґРµРЅ');
  return chat as ChatConversationRow;
}

async function getConversationById(chatId: string): Promise<ChatConversationRow> {
  const [chat] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, chatId))
    .limit(1);

  if (!chat) throw new NotFoundError('Ресурс не найден');
  return chat as ChatConversationRow;
}

async function getConversationForSharedViewer(token: string, viewerUserId?: string | null): Promise<ChatConversationRow> {
  const [chat] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.share_token, token))
    .limit(1);

  if (!chat) throw new NotFoundError('Ресурс не найден');
  await ensureChatViewerAccess(chat as ChatConversationRow, viewerUserId);
  return chat as ChatConversationRow;
}

async function getConversationMessages(chatId: string): Promise<ConversationMessage[]> {
  const usdToRubRate = await getUsdToRubRate();
  const rows = await db
    .select()
    .from(chatConversationMessages)
    .where(eq(chatConversationMessages.conversation_id, chatId))
    .orderBy(asc(chatConversationMessages.created_at));

  return rows
    .filter((row) => row.role === 'user' || row.role === 'assistant')
    .map((row) => toConversationMessage(row, usdToRubRate));
}

function buildLatestHtmlPreviewContext(
  preview: { title?: string | null; html: string } | null,
): string {
  if (!preview) {
    return '';
  }

  const title = preview.title?.trim();
  const html = clampText(preview.html, 40_000);
  if (!html) {
    return '';
  }

  return [
    'Текущая версия последнего preview для возможной доработки:',
    title ? `Название: ${title}` : undefined,
    'Используй этот HTML как базу только если пользователь просит поправить, доработать или изменить уже созданный preview/лендинг/страницу.',
    'Если пользователь просит новую отдельную задачу, не считай этот HTML обязательной базой.',
    '```html',
    html,
    '```',
  ]
    .filter(Boolean)
    .join('\n');
}

async function getLatestHtmlPreviewSnapshot(chatId: string): Promise<{ title?: string | null; html: string } | null> {
  const rows = await db
    .select({
      content_text: chatConversationMessages.content_text,
      usage_json: chatConversationMessages.usage_json,
      created_at: chatConversationMessages.created_at,
    })
    .from(chatConversationMessages)
    .where(and(
      eq(chatConversationMessages.conversation_id, chatId),
      eq(chatConversationMessages.role, 'assistant'),
    ))
    .orderBy(desc(chatConversationMessages.created_at))
    .limit(12);

  for (const row of rows) {
    const rawUsage = (row.usage_json as Record<string, unknown> | null) ?? null;
    const normalized = normalizeAssistantChatPayload(row.content_text, rawUsage);
    const preview = normalized.codingReport?.preview;
    if (!preview || preview.type !== 'html' || !preview.html) {
      continue;
    }

    return {
      title: preview.title?.trim() || null,
      html: preview.html,
    };
  }

  return null;
}

function detectPreviewEditIntent(request: string): boolean {
  const text = request.trim().toLowerCase();
  if (!text) return false;

  if (/(исправ|поправ|подвин|сдвин|выровн|центр|по центру|замен|измени|измени только|не трогай|доработ|отредакт|перенес|увелич|уменьш|сделай .* по центру)/i.test(text)) {
    return true;
  }

  return /(preview|превью|лендинг|страниц|шапк|hero|html|блок|кнопк|заголов|надпись)/i.test(text)
    && /(исправ|поправ|подвин|сдвин|выровн|центр|замен|измени|доработ|отредакт)/i.test(text);
}

function isSmallScopedPreviewEdit(request: string): boolean {
  const text = request.trim().toLowerCase();
  if (!text) return false;
  if (/(с нуля|полностью|целиком|полностью передел|редизайн|новый лендинг|новую страницу|полностью перепиши|полностью измени)/i.test(text)) {
    return false;
  }

  return /(только|слегка|немного|точечно|по центру|центр|замени текст|поменяй текст|исправь текст|выровняй|сдвинь|подвинь|измени надпись|исправь надпись|измени заголовок|исправь заголовок)/i.test(text);
}

function normalizeHtmlForSimilarity(html: string): string {
  return html
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim()
    .toLowerCase();
}

function getDiceCoefficient(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const pairs = new Map<string, number>();
  for (let index = 0; index < a.length - 1; index += 1) {
    const pair = a.slice(index, index + 2);
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
  }

  let intersection = 0;
  for (let index = 0; index < b.length - 1; index += 1) {
    const pair = b.slice(index, index + 2);
    const count = pairs.get(pair) ?? 0;
    if (count > 0) {
      pairs.set(pair, count - 1);
      intersection += 1;
    }
  }

  return (2 * intersection) / ((a.length - 1) + (b.length - 1));
}

function shouldRetryStrictPreviewEdit(request: string, originalHtml: string, nextHtml: string): boolean {
  if (!isSmallScopedPreviewEdit(request)) {
    return false;
  }

  const original = normalizeHtmlForSimilarity(originalHtml);
  const next = normalizeHtmlForSimilarity(nextHtml);
  const similarity = getDiceCoefficient(original, next);
  const lengthDelta = Math.abs(original.length - next.length) / Math.max(original.length, 1);

  return similarity < 0.9 || lengthDelta > 0.12;
}

function buildStrictPreviewEditInstruction(options: StrictPreviewEditOptions, retry = false): string {
  return [
    'Режим точечной правки preview.',
    'Пользователь просит ИЗМЕНИТЬ уже существующий preview, а не сгенерировать новый дизайн с нуля.',
    'Используй последний HTML preview как базовую версию.',
    'Сохраняй без изменений все секции, структуру, классы, id, тексты, стили, анимации и layout, которые не относятся к запросу.',
    'Меняй только то, что явно попросил пользователь.',
    'Если задачу можно решить 1-2 правками CSS или маленькой заменой текста, делай только это.',
    'Не переписывай весь HTML, не делай редизайн и не улучшай посторонние части страницы.',
    'Если меняешь текст, меняй только нужный текст. Если меняешь позиционирование, старайся ограничиться точечными стилями.',
    retry
      ? 'Предыдущая попытка изменила слишком много. Начни заново от ИСХОДНОГО HTML и сделай минимально возможную правку.'
      : 'Нужна минимальная и точечная правка.',
    options.preview_title ? `Название текущего preview: ${options.preview_title}` : undefined,
    `Запрос пользователя: ${options.user_request}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function toConversationMessage(
  row: typeof chatConversationMessages.$inferSelect,
  usdToRubRate: number,
): ConversationMessage {
  const rawUsage = (row.usage_json as Record<string, unknown> | null) ?? null;
  const normalized = row.role === 'assistant'
    ? normalizeAssistantChatPayload(row.content_text, rawUsage)
    : { content: row.content_text, usage: rawUsage, codingReport: null };
  const normalizedUsage = recalculateUsageCost(normalized.usage);

  return {
    id: row.id,
    role: row.role as 'user' | 'assistant',
    content: normalized.content,
    run_id: row.run_id ?? null,
    usage: attachUsdToRubRate(normalizedUsage, usdToRubRate),
    latency_ms: row.latency_ms ?? null,
    created_at: toIso(row.created_at),
  };
}

function formatAuthorName(user: { name: string | null; username: string | null; email: string }): string {
  const displayName = user.name?.trim();
  if (displayName) return displayName;

  const username = user.username?.trim();
  if (username) return username.startsWith('@') ? username : `@${username}`;

  return user.email;
}

async function incrementPreviewViewCount(messageId: string) {
  await db.update(chatConversationMessages)
    .set({ preview_view_count: sql`${chatConversationMessages.preview_view_count} + 1` })
    .where(eq(chatConversationMessages.id, messageId));
}

async function getAgentChatMeta(agentId: string | null): Promise<{
  agent_name: string | null;
  agent_chat_description: string | null;
  agent_starter_prompts: string[];
}> {
  if (!agentId) {
    return { agent_name: null, agent_chat_description: null, agent_starter_prompts: [] };
  }

  const [row] = await db
    .select({
      slug: agents.slug,
      name: agents.name,
      description: agents.description,
      runtime_config: agentVersions.runtime_config,
    })
    .from(agents)
    .leftJoin(agentVersions, eq(agentVersions.id, agents.current_version_id))
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!row) {
    return { agent_name: null, agent_chat_description: null, agent_starter_prompts: [] };
  }

  const runtime = row.runtime_config as Record<string, unknown> | null;
  const chatIntro = typeof runtime?.chat_intro === 'string' ? runtime.chat_intro.trim() : '';
  const starterPrompts = resolveStarterPromptsForAgentSlug(
    row.slug,
    extractStarterPrompts(runtime?.starter_prompts),
    await getStarterPromptSettings(),
  );

  return {
    agent_name: row.name ?? null,
    agent_chat_description: chatIntro || row.description || null,
    agent_starter_prompts: starterPrompts,
  };
}

function estimateGeneralChatCost(model: string, usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }) {
  const estimated_cost = estimateCost(model, usage.prompt_tokens, usage.completion_tokens);
  return { ...usage, estimated_cost, model };
}

export async function listChats(userId: string): Promise<ConversationListItem[]> {
  const chats = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.user_id, userId))
    .orderBy(desc(chatConversations.last_message_at))
    .limit(200);

  const ids = chats.map((chat) => chat.id);
  if (ids.length === 0) return [];

  const counts = await db
    .select({
      conversation_id: chatConversationMessages.conversation_id,
      count: sql<number>`count(*)::int`,
    })
    .from(chatConversationMessages)
    .where(inArray(chatConversationMessages.conversation_id, ids))
    .groupBy(chatConversationMessages.conversation_id);

  const lastMessages = await db
    .select({
      conversation_id: chatConversationMessages.conversation_id,
      content_text: chatConversationMessages.content_text,
      created_at: chatConversationMessages.created_at,
      id: chatConversationMessages.id,
    })
    .from(chatConversationMessages)
    .where(inArray(chatConversationMessages.conversation_id, ids))
    .orderBy(desc(chatConversationMessages.created_at));

  const countMap = new Map<string, number>();
  for (const c of counts) countMap.set(c.conversation_id, c.count);

  const previewMap = new Map<string, string>();
  for (const m of lastMessages) {
    if (!previewMap.has(m.conversation_id)) {
      const previewContent = normalizeAssistantChatPayload(m.content_text, null).content;
      previewMap.set(m.conversation_id, compactTitle(previewContent || m.content_text));
    }
  }

  return chats.map((chat) => ({
    id: chat.id,
    title: chat.title,
    mode: chat.mode as ChatMode,
    agent_id: chat.agent_id ?? null,
    model_external_id: chat.model_external_id ?? null,
    access: normalizeChatAccess(chat.access),
    access_identifiers: normalizeAccessIdentifiers(chat.access_identifiers),
    share_token: chat.share_token ?? null,
    message_count: countMap.get(chat.id) ?? 0,
    last_message_preview: previewMap.get(chat.id) ?? null,
    last_message_at: toIso(chat.last_message_at),
    created_at: toIso(chat.created_at),
    updated_at: toIso(chat.updated_at),
  }));
}

export async function listChatAgents(userId: string, userRole?: string): Promise<ChatAgentOption[]> {
  const canSeeRestrictedAgents = isPrivilegedRole(userRole);
  const starterPromptSettings = await getStarterPromptSettings();
  const rows = await db
    .select({
      id: agents.id,
      slug: agents.slug,
      name: agents.name,
      owner_user_id: agents.owner_user_id,
      description: agents.description,
      runtime_config: agentVersions.runtime_config,
      created_at: agents.created_at,
    })
    .from(agents)
    .leftJoin(agentVersions, eq(agentVersions.id, agents.current_version_id))
    .where(
      and(
        eq(agents.status, 'active'),
        sql`${agents.current_version_id} is not null`,
        canSeeRestrictedAgents
          ? inArray(agents.visibility, ['public', 'private', 'unlisted'])
          : or(
            eq(agents.owner_user_id, userId),
            eq(agents.visibility, 'public'),
          ),
      ),
    )
    .orderBy(desc(agents.created_at));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    owner_user_id: row.owner_user_id,
    is_owner: row.owner_user_id === userId,
    description: row.description ?? null,
    chat_description:
      (typeof (row.runtime_config as Record<string, unknown> | null)?.chat_intro === 'string'
        ? ((row.runtime_config as Record<string, unknown>).chat_intro as string).trim()
        : '') || row.description || null,
    starter_prompts: resolveStarterPromptsForAgentSlug(
      row.slug,
      extractStarterPrompts((row.runtime_config as Record<string, unknown> | null)?.starter_prompts),
      starterPromptSettings,
    ),
  }));
}

export async function createChat(userId: string, input: {
  title?: string;
  mode?: ChatMode;
  agent_id?: string | null;
  model_external_id?: string | null;
  system_prompt?: string | null;
  access?: ChatAccess;
  access_identifiers?: string[];
}, userRole?: string) {
  const mode = input.mode ?? 'general';
  const access = normalizeChatAccess(input.access);
  const accessIdentifiers = normalizeAccessIdentifiers(input.access_identifiers);
  if (mode === 'agent' && !input.agent_id) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Р”Р»СЏ СЂРµР¶РёРјР° С‡Р°С‚Р° СЃ Р°РіРµРЅС‚РѕРј С‚СЂРµР±СѓРµС‚СЃСЏ agent_id');
  }
  
  if (mode === 'agent' && input.agent_id) {
    await ensureAgentIsVisibleForUser(input.agent_id, userId, userRole);
  }

  if (access === 'restricted' && accessIdentifiers.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Для ограниченного доступа укажите email или логины');
  }

  const shareToken = access === 'public'
    ? uuidv4().replace(/-/g, '').slice(0, 16)
    : null;

  const [chat] = await db.insert(chatConversations).values({
    user_id: userId,
    mode,
    agent_id: input.agent_id ?? null,
    title: (input.title?.trim() || 'РќРѕРІС‹Р№ С‡Р°С‚').slice(0, 500),
    model_external_id: input.model_external_id ?? null,
    system_prompt: input.system_prompt ?? null,
    access,
    access_identifiers: accessIdentifiers,
    share_token: shareToken,
    last_message_at: new Date(),
  }).returning();

  return {
    id: chat.id,
    title: chat.title,
    mode: chat.mode,
    agent_id: chat.agent_id,
    model_external_id: chat.model_external_id,
    access: normalizeChatAccess(chat.access),
    access_identifiers: normalizeAccessIdentifiers(chat.access_identifiers),
    share_token: chat.share_token ?? null,
    message_count: 0,
    last_message_preview: null,
    last_message_at: toIso(chat.last_message_at),
    created_at: toIso(chat.created_at),
    updated_at: toIso(chat.updated_at),
  };
}

export async function getChatById(chatId: string, userId: string): Promise<ConversationDetails> {
  const chat = await getConversationForUser(chatId, userId);
  const [messages, agentMeta] = await Promise.all([
    getConversationMessages(chatId),
    getAgentChatMeta(chat.agent_id ?? null),
  ]);

  return {
    chat: {
      id: chat.id,
      title: chat.title,
      mode: chat.mode,
      agent_id: chat.agent_id ?? null,
      model_external_id: chat.model_external_id ?? null,
      access: normalizeChatAccess(chat.access),
      access_identifiers: normalizeAccessIdentifiers(chat.access_identifiers),
      share_token: chat.share_token ?? null,
      message_count: messages.length,
      agent_name: agentMeta.agent_name,
      agent_chat_description: agentMeta.agent_chat_description,
      agent_starter_prompts: agentMeta.agent_starter_prompts,
      last_message_at: toIso(chat.last_message_at),
      created_at: toIso(chat.created_at),
      updated_at: toIso(chat.updated_at),
    },
    messages,
  };
}

export async function getChatMessagePreviewHtml(
  chatId: string,
  messageId: string,
  viewerUserId?: string | null,
  options?: { previewId?: string; galleryMode?: boolean },
): Promise<string> {
  const chat = await getConversationById(chatId);
  await ensureChatViewerAccess(chat, viewerUserId);

  const [message] = await db
    .select()
    .from(chatConversationMessages)
    .where(and(
      eq(chatConversationMessages.id, messageId),
      eq(chatConversationMessages.conversation_id, chatId),
    ))
    .limit(1);

  if (!message || message.role !== 'assistant') {
    throw new NotFoundError('Preview not found');
  }

  const rawUsage = (message.usage_json as Record<string, unknown> | null) ?? null;
  const normalized = normalizeAssistantChatPayload(message.content_text, rawUsage);
  const preview = normalized.codingReport?.preview;

  if (!preview || preview.type !== 'html' || !preview.html) {
    throw new NotFoundError('Preview not found');
  }

  if (chat.user_id !== viewerUserId) {
    await incrementPreviewViewCount(message.id);
  }

  return preparePreviewHtml(preview.html, options);
}

export async function getSharedChatMessagePreviewHtml(
  token: string,
  messageId: string,
  viewerUserId?: string | null,
  options?: { previewId?: string; galleryMode?: boolean },
): Promise<string> {
  const chat = await getConversationForSharedViewer(token, viewerUserId);

  const [message] = await db
    .select()
    .from(chatConversationMessages)
    .where(and(
      eq(chatConversationMessages.id, messageId),
      eq(chatConversationMessages.conversation_id, chat.id),
    ))
    .limit(1);

  if (!message || message.role !== 'assistant') {
    throw new NotFoundError('Preview not found');
  }

  const rawUsage = (message.usage_json as Record<string, unknown> | null) ?? null;
  const normalized = normalizeAssistantChatPayload(message.content_text, rawUsage);
  const preview = normalized.codingReport?.preview;

  if (!preview || preview.type !== 'html' || !preview.html) {
    throw new NotFoundError('Preview not found');
  }

  if (chat.user_id !== viewerUserId) {
    await incrementPreviewViewCount(message.id);
  }

  return preparePreviewHtml(preview.html, options);
}

async function updatePreviewForMessageRow(
  message: typeof chatConversationMessages.$inferSelect,
  input: { title?: string | null; html: string },
): Promise<typeof chatConversationMessages.$inferSelect> {
  if (message.role !== 'assistant') {
    throw new NotFoundError('Preview not found');
  }

  const rawUsage = (message.usage_json as Record<string, unknown> | null) ?? null;
  const normalized = normalizeAssistantChatPayload(message.content_text, rawUsage);
  const currentReport = normalized.codingReport;
  const currentPreview = currentReport?.preview;

  if (!currentReport || !currentPreview || currentPreview.type !== 'html' || !currentPreview.html) {
    throw new NotFoundError('Preview not found');
  }

  const nextReport = sanitizeCodingReport({
    ...currentReport,
    preview: {
      ...currentPreview,
      title: input.title ?? currentPreview.title,
      html: input.html,
      type: 'html',
    },
  });

  if (!nextReport || !nextReport.preview || nextReport.preview.type !== 'html' || !nextReport.preview.html) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Некорректный preview HTML');
  }

  const nextUsage = {
    ...(rawUsage ?? {}),
    coding_report: nextReport,
  };
  const nextContent = applyCodingReportToContent(message.content_text, nextReport);

  const [updated] = await db.update(chatConversationMessages)
    .set({
      content_text: nextContent,
      usage_json: nextUsage,
    })
    .where(eq(chatConversationMessages.id, message.id))
    .returning();

  return updated;
}

export async function updateChatMessagePreview(
  chatId: string,
  messageId: string,
  userId: string,
  input: { title?: string | null; html: string },
): Promise<ConversationMessage> {
  await getConversationForUser(chatId, userId);

  const [message] = await db
    .select()
    .from(chatConversationMessages)
    .where(and(
      eq(chatConversationMessages.id, messageId),
      eq(chatConversationMessages.conversation_id, chatId),
    ))
    .limit(1);

  if (!message) {
    throw new NotFoundError('Preview not found');
  }

  const updated = await updatePreviewForMessageRow(message, input);
  const usdToRubRate = await getUsdToRubRate();
  return toConversationMessage(updated, usdToRubRate);
}

export async function updateSharedChatMessagePreview(
  token: string,
  messageId: string,
  userId: string,
  input: { title?: string | null; html: string },
): Promise<ConversationMessage> {
  const [chat] = await db
    .select()
    .from(chatConversations)
    .where(and(
      eq(chatConversations.share_token, token),
      eq(chatConversations.user_id, userId),
    ))
    .limit(1);

  if (!chat) {
    throw new NotFoundError('Preview not found');
  }

  const [message] = await db
    .select()
    .from(chatConversationMessages)
    .where(and(
      eq(chatConversationMessages.id, messageId),
      eq(chatConversationMessages.conversation_id, chat.id),
    ))
    .limit(1);

  if (!message) {
    throw new NotFoundError('Preview not found');
  }

  const updated = await updatePreviewForMessageRow(message, input);
  const usdToRubRate = await getUsdToRubRate();
  return toConversationMessage(updated, usdToRubRate);
}

export async function streamChatEvents(chatId: string, userId: string, res: Response) {
  await openChatEventStream(chatId, userId, res);
}

export async function getChatStats(chatId: string, userId: string): Promise<ChatStatsResponse> {
  const chat = await getConversationForUser(chatId, userId);
  const usdToRubRate = await getUsdToRubRate();
  const messages = await db
    .select()
    .from(chatConversationMessages)
    .where(eq(chatConversationMessages.conversation_id, chatId))
    .orderBy(asc(chatConversationMessages.created_at));

  let userMessages = 0;
  let assistantMessages = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let usdCost = 0;
  let messagesWithUsage = 0;
  let totalLatencyMs = 0;

  const byModel = new Map<string, ChatStatsModelBreakdown>();

  for (const msg of messages) {
    if (msg.role === 'user') userMessages += 1;
    if (msg.role === 'assistant') {
      assistantMessages += 1;
      totalLatencyMs += msg.latency_ms ?? 0;
    }

    const usage = (msg.usage_json as Record<string, unknown> | null) ?? null;
    if (!usage) continue;

    const p = toNumberOrNull(usage.prompt_tokens) ?? 0;
    const c = toNumberOrNull(usage.completion_tokens) ?? 0;
    const t = toNumberOrNull(usage.total_tokens) ?? (p + c);
    const model = (typeof usage.model === 'string' && usage.model.trim().length > 0)
      ? usage.model
      : (chat.model_external_id || DEFAULT_GENERAL_MODEL);
    const usd = Number(estimateCost(model, p, c));

    promptTokens += p;
    completionTokens += c;
    totalTokens += t;
    usdCost += usd;
    messagesWithUsage += 1;

    const existing = byModel.get(model) ?? {
      model,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      usd_cost: 0,
      rub_cost: 0,
      messages: 0,
    };
    existing.prompt_tokens += p;
    existing.completion_tokens += c;
    existing.total_tokens += t;
    existing.usd_cost += usd;
    existing.messages += 1;
    byModel.set(model, existing);
  }

  const byModelArr = Array.from(byModel.values())
    .map((row) => ({
      ...row,
      rub_cost: row.usd_cost * usdToRubRate,
    }))
    .sort((a, b) => b.usd_cost - a.usd_cost);

  let agentName: string | null = null;
  if (chat.agent_id) {
    const [agent] = await db
      .select({ name: agents.name })
      .from(agents)
      .where(eq(agents.id, chat.agent_id))
      .limit(1);
    agentName = agent?.name ?? null;
  }

  return {
    chat: {
      id: chat.id,
      title: chat.title,
      mode: chat.mode,
      agent_id: chat.agent_id ?? null,
      agent_name: agentName,
      model_external_id: chat.model_external_id ?? null,
      created_at: toIso(chat.created_at),
      updated_at: toIso(chat.updated_at),
      last_message_at: toIso(chat.last_message_at),
      message_count: messages.length,
      user_messages: userMessages,
      assistant_messages: assistantMessages,
    },
    totals: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      usd_cost: usdCost,
      rub_cost: usdCost * usdToRubRate,
      messages_with_usage: messagesWithUsage,
      total_latency_ms: totalLatencyMs,
    },
    by_model: byModelArr,
    usd_to_rub_rate: usdToRubRate,
  };
}

export async function updateChat(chatId: string, userId: string, input: {
  title?: string;
  mode?: ChatMode;
  agent_id?: string | null;
  model_external_id?: string | null;
  system_prompt?: string | null;
  access?: ChatAccess;
  access_identifiers?: string[];
}, userRole?: string) {
  const existing = await getConversationForUser(chatId, userId);
  const nextMode = input.mode ?? existing.mode;
  const nextAgentId = input.agent_id === undefined ? existing.agent_id : input.agent_id;
  const nextAccess = input.access === undefined ? existing.access : normalizeChatAccess(input.access);
  const nextAccessIdentifiers = input.access_identifiers === undefined
    ? normalizeAccessIdentifiers(existing.access_identifiers)
    : normalizeAccessIdentifiers(input.access_identifiers);

  if (nextMode === 'agent' && !nextAgentId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Р”Р»СЏ СЂРµР¶РёРјР° С‡Р°С‚Р° СЃ Р°РіРµРЅС‚РѕРј С‚СЂРµР±СѓРµС‚СЃСЏ agent_id');
  }

  
  if (nextMode === 'agent' && nextAgentId) {
    await ensureAgentIsVisibleForUser(nextAgentId, userId, userRole);
  }

  if (nextAccess === 'restricted' && nextAccessIdentifiers.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Для ограниченного доступа укажите email или логины');
  }

  const ensuredShareToken = nextAccess === 'public'
    ? await ensureChatShareToken(existing.id, existing.share_token)
    : existing.share_token;

  const [chat] = await db.update(chatConversations)
    .set({
      title: input.title ? input.title.trim().slice(0, 500) : existing.title,
      mode: nextMode,
      agent_id: nextAgentId ?? null,
      model_external_id: input.model_external_id === undefined
        ? existing.model_external_id
        : (input.model_external_id ?? null),
      system_prompt: input.system_prompt === undefined ? existing.system_prompt : (input.system_prompt ?? null),
      access: nextAccess,
      access_identifiers: nextAccessIdentifiers,
      share_token: ensuredShareToken,
      updated_at: new Date(),
    })
    .where(eq(chatConversations.id, chatId))
    .returning();

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chatConversationMessages)
    .where(eq(chatConversationMessages.conversation_id, chatId));

  return {
    id: chat.id,
    title: chat.title,
    mode: chat.mode,
    agent_id: chat.agent_id ?? null,
    model_external_id: chat.model_external_id ?? null,
    access: normalizeChatAccess(chat.access),
    access_identifiers: normalizeAccessIdentifiers(chat.access_identifiers),
    share_token: chat.share_token ?? null,
    message_count: countRow?.count ?? 0,
    last_message_preview: null,
    last_message_at: toIso(chat.last_message_at),
    created_at: toIso(chat.created_at),
    updated_at: toIso(chat.updated_at),
  };
}

export async function deleteChat(chatId: string, userId: string) {
  await getConversationForUser(chatId, userId);
  await db.delete(chatConversations).where(and(eq(chatConversations.id, chatId), eq(chatConversations.user_id, userId)));
}

export async function shareChatById(chatId: string, userId: string) {
  const chat = await getConversationForUser(chatId, userId);
  return { share_token: await ensureChatShareToken(chat.id, chat.share_token) };
}

export async function sendChatMessage(
  chatId: string,
  userId: string,
  content: string,
  attachmentsInput?: ChatAttachmentInput[],
  userRole?: string,
) {
  const chat = await getConversationForUser(chatId, userId);
  await ensureSufficientBalance(userId);
  const usdToRubRate = await getUsdToRubRate();
  const emitChatEvent = (event: string, payload: Record<string, unknown>) => {
    publishChatEvent(chatId, userId, event, payload);
  };
  const trimmedContent = content.trim();
  if (!trimmedContent && (attachmentsInput ?? []).length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Message cannot be empty');
  }

  const attachments = (attachmentsInput ?? []).slice(0, 8);
  const attachmentMetas: ChatAttachmentMeta[] = [];
  const attachmentContextChunks: string[] = [];
  const imageDataUrls: string[] = [];

  for (const item of attachments) {
    const filename = path.basename(item.filename || '');
    if (!filename) continue;
    const filePath = safeAttachmentPath(filename);
    let fileStats;
    try {
      fileStats = await stat(filePath);
    } catch {
      continue;
    }
    if (!fileStats.isFile()) continue;

    const mime = getAttachmentMimeType(filename);
    const kind: ChatAttachmentMeta['kind'] = isImageMime(mime)
      ? 'image'
      : ((isTextMime(mime) || isTextFilename(item.original_name ?? filename)) ? 'text' : 'file');
    const meta: ChatAttachmentMeta = {
      filename,
      original_name: (item.original_name ?? '').trim() || filename,
      mime_type: mime,
      size: fileStats.size,
      kind,
      url: `/uploads/chat/${filename}`,
    };

    if (kind === 'text') {
      try {
        const raw = await readFile(filePath, 'utf8');
        const compact = raw.replace(/\r\n/g, '\n').trim().slice(0, 12000);
        if (compact.length > 0) {
          meta.text_preview = compact.slice(0, 400);
          attachmentContextChunks.push(`Файл \"${meta.original_name}\":\n${compact}`);
        }
      } catch {
      }
    } else if (kind === 'image') {
      attachmentContextChunks.push(`Изображение \"${meta.original_name}\" приложено.`);
      try {
        const buffer = await readFile(filePath);
        imageDataUrls.push(`data:${mime};base64,${buffer.toString('base64')}`);
      } catch {
      }
    } else {
      attachmentContextChunks.push(`Файл \"${meta.original_name}\" приложен.`);
    }

    attachmentMetas.push(meta);
  }

  const attachmentContext = attachmentContextChunks.length > 0
    ? `\n\nВложения пользователя:\n${attachmentContextChunks.join('\n\n')}`
    : '';
  const latestPreviewSnapshot = await getLatestHtmlPreviewSnapshot(chatId);
  const strictPreviewEdit = Boolean(latestPreviewSnapshot && detectPreviewEditIntent(trimmedContent));
  const latestPreviewContext = strictPreviewEdit
    ? buildLatestHtmlPreviewContext(latestPreviewSnapshot)
    : '';
  const previewContext = latestPreviewContext
    ? `\n\nКонтекст текущего preview:\n${latestPreviewContext}`
    : '';
  const userModelText = `${trimmedContent}${attachmentContext}${previewContext}`.trim();

  const previousMessages = await getConversationMessages(chatId);
  const userMessage: ConversationMessage = {
    id: '',
    role: 'user',
    content: trimmedContent,
    run_id: null,
    usage: attachmentMetas.length > 0 ? ({ attachments: attachmentMetas } as Record<string, unknown>) : null,
    latency_ms: null,
    created_at: new Date().toISOString(),
  };

  await db.insert(chatConversationMessages).values({
    conversation_id: chatId,
    role: 'user',
    content_text: trimmedContent,
    usage_json: attachmentMetas.length > 0 ? ({ attachments: attachmentMetas } as Record<string, unknown>) : null,
  });
  emitChatEvent('chat.message.accepted', {
    mode: chat.mode,
    has_attachments: attachmentMetas.length > 0,
    label: attachmentMetas.length > 0
      ? 'Сообщение принято, подготавливаю вложения'
      : 'Сообщение принято, запускаю обработку',
  });

  const historyForModel = [
    ...(chat.system_prompt ? [{ role: 'system' as const, content: chat.system_prompt }] : []),
    ...previousMessages.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: userModelText },
  ];

  let assistantText = '';
  let runId: string | null = null;
  let usagePayload: Record<string, unknown> | null = null;
  let latencyMs: number | null = null;

  if (chat.mode === 'agent') {
    if (!chat.agent_id) {
      throw new AppError(400, 'CHAT_CONFIG_ERROR', 'Р­С‚РѕС‚ С‡Р°С‚ РЅРµ РЅР°СЃС‚СЂРѕРµРЅ РєР°Рє Р°РіРµРЅС‚');
    }
    await ensureAgentIsVisibleForUser(chat.agent_id, userId, userRole);

    const result = await startRun(chat.agent_id, userId, {
      messages: historyForModel
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      model_external_id: chat.model_external_id ?? null,
    }, {
      sync_to_chats: false,
      on_event: emitChatEvent,
      strict_preview_edit: strictPreviewEdit && latestPreviewSnapshot
        ? {
          user_request: trimmedContent,
          original_html: latestPreviewSnapshot.html,
          preview_title: latestPreviewSnapshot.title ?? null,
        }
        : null,
    });

    if (result.status !== 'completed') {
      throw new AppError(
        502,
        'AGENT_RUNTIME_FAILED',
        result.error_message ?? 'РђРіРµРЅС‚ РЅРµ СЃРјРѕРі СЃС„РѕСЂРјРёСЂРѕРІР°С‚СЊ РѕС‚РІРµС‚. РџРѕРїСЂРѕР±СѓР№С‚Рµ РёР·РјРµРЅРёС‚СЊ Р·Р°РїСЂРѕСЃ.',
      );
    }

    const toolNames = Array.from(
      new Set(
        (result.tool_traces ?? [])
          .map((trace) => (typeof trace.tool_name === 'string' ? trace.tool_name.trim() : ''))
          .filter((name) => name.length > 0),
      ),
    );

    assistantText = result.output || '(РїСѓСЃС‚РѕР№ РѕС‚РІРµС‚)';
    runId = result.run_id;
    latencyMs = result.latency_ms;
    if (result.usage) {
      usagePayload = {
        ...(result.usage as unknown as Record<string, unknown>),
        tool_names: toolNames,
        tool_traces: result.tool_traces,
        coding_report: result.coding_report ?? null,
      };
    } else {
      usagePayload = (
        toolNames.length > 0
        || (result.tool_traces?.length ?? 0) > 0
        || result.coding_report
      )
        ? {
          tool_names: toolNames,
          tool_traces: result.tool_traces,
          coding_report: result.coding_report ?? null,
        }
        : null;
    }
  } else {
    const model = normalizeOpenRouterModelId(chat.model_external_id || DEFAULT_GENERAL_MODEL);
    const startedAt = Date.now();
    emitChatEvent('chat.run.started', {
      mode: 'general',
      model,
      label: 'Отправляю запрос в OpenRouter',
    });
    try {
      const userContentForGeneral = imageDataUrls.length > 0
        ? ([{ type: 'text' as const, text: userModelText }, ...imageDataUrls.map((url) => ({ type: 'image_url' as const, image_url: { url } }))])
        : userModelText;
      const response = await openRouterClient.chatCompletion({
        model,
        messages: [
          ...historyForModel.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
          { role: 'user', content: userContentForGeneral },
        ],
        temperature: 0.5,
        max_tokens: 2048,
      });
      latencyMs = Date.now() - startedAt;
      const rawAssistant = response.choices?.[0]?.message?.content;
      assistantText = typeof rawAssistant === 'string' ? rawAssistant : '(пустой ответ)';
      if (response.usage) {
        usagePayload = attachUsdToRubRate(
          estimateGeneralChatCost(model, response.usage) as unknown as Record<string, unknown>,
          usdToRubRate,
        );
      }
      emitChatEvent('chat.run.completed', {
        mode: 'general',
        model,
        latency_ms: latencyMs,
        label: 'OpenRouter вернул ответ',
      });
    } catch (err) {
      emitChatEvent('chat.run.failed', {
        mode: 'general',
        model,
        error: err instanceof Error ? err.message : 'Unknown error',
        label: 'OpenRouter вернул ошибку',
      });
      throw err;
    }
  }

  const normalizedAssistant = normalizeAssistantChatPayload(assistantText, usagePayload);
  assistantText = normalizedAssistant.content || assistantText;
  usagePayload = attachUsdToRubRate(normalizedAssistant.usage, usdToRubRate);

  const [assistantRow] = await db.insert(chatConversationMessages).values({
    conversation_id: chatId,
    role: 'assistant',
    content_text: assistantText,
    run_id: runId,
    usage_json: usagePayload ?? null,
    latency_ms: latencyMs ?? null,
  }).returning();
  const isDefaultTitle = chat.title === 'Новый чат';
  const nextTitle = isDefaultTitle ? compactTitle(trimmedContent || 'Вложение') : chat.title;
  await db.update(chatConversations).set({
    title: nextTitle,
    last_message_at: new Date(),
    updated_at: new Date(),
  }).where(eq(chatConversations.id, chatId));
  emitChatEvent('chat.message.completed', {
    run_id: runId,
    mode: chat.mode,
    label: 'Ответ сохранён в чате',
  });

  const chargedCost = Number(
    typeof usagePayload?.estimated_cost === 'string'
      ? usagePayload.estimated_cost
      : (typeof usagePayload?.estimated_cost === 'number' ? usagePayload.estimated_cost : 0),
  );
  if (chat.mode === 'general' && chargedCost > 0) {
    await chargeUserBalanceForUsage({
      user_id: userId,
      amount_usd: chargedCost,
      type: 'chat_usage',
      description: `Списание за чат ${nextTitle}`,
    });
  }

  return {
    user_message: userMessage,
    assistant_message: {
      id: assistantRow.id,
      role: 'assistant' as const,
      content: assistantRow.content_text,
      run_id: assistantRow.run_id ?? null,
      usage: (assistantRow.usage_json as Record<string, unknown> | null) ?? null,
      latency_ms: assistantRow.latency_ms ?? null,
      created_at: toIso(assistantRow.created_at),
    },
    chat: {
      id: chat.id,
      title: nextTitle,
      mode: chat.mode,
      agent_id: chat.agent_id ?? null,
      model_external_id: chat.model_external_id ?? null,
      share_token: chat.share_token ?? null,
    },
  };
}

export async function getSharedChatById(token: string, viewerUserId?: string | null) {
  const chat = await getConversationForSharedViewer(token, viewerUserId);

  const messages = await getConversationMessages(chat.id);
  let agentName: string | null = null;

  if (chat.agent_id) {
    const [agent] = await db.select({ name: agents.name }).from(agents).where(eq(agents.id, chat.agent_id)).limit(1);
    agentName = agent?.name ?? null;
  }

  return {
    chat: {
      id: chat.id,
      title: chat.title,
      mode: chat.mode,
      agent_name: agentName,
    },
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      usage: m.usage,
      created_at: m.created_at,
    })),
  };
}

export async function listGalleryPreviews(limit = 24): Promise<GalleryPreviewItem[]> {
  const usdToRubRate = await getUsdToRubRate();
  const rows = await db
    .select({
      message_id: chatConversationMessages.id,
      chat_id: chatConversations.id,
      chat_title: chatConversations.title,
      share_token: chatConversations.share_token,
      chat_model_external_id: chatConversations.model_external_id,
      author_email: users.email,
      author_username: users.username,
      author_name_raw: users.name,
      content_text: chatConversationMessages.content_text,
      usage_json: chatConversationMessages.usage_json,
      preview_view_count: chatConversationMessages.preview_view_count,
      created_at: chatConversationMessages.created_at,
    })
    .from(chatConversationMessages)
    .innerJoin(chatConversations, eq(chatConversations.id, chatConversationMessages.conversation_id))
    .innerJoin(users, eq(users.id, chatConversations.user_id))
    .where(and(
      eq(chatConversationMessages.role, 'assistant'),
      eq(chatConversations.access, 'public'),
    ))
    .orderBy(desc(chatConversationMessages.created_at))
    .limit(Math.max(1, Math.min(limit, 120)));

  const chatIds = [...new Set(rows.map((row) => row.chat_id))];
  const chatModelFallback = new Map(rows.map((row) => [row.chat_id, row.chat_model_external_id ?? null]));
  const chatTotals = new Map<string, {
    usd_cost: number;
    model_costs: Map<string, number>;
  }>();

  if (chatIds.length > 0) {
    const usageRows = await db
      .select({
        conversation_id: chatConversationMessages.conversation_id,
        usage_json: chatConversationMessages.usage_json,
      })
      .from(chatConversationMessages)
      .where(and(
        inArray(chatConversationMessages.conversation_id, chatIds),
        eq(chatConversationMessages.role, 'assistant'),
      ));

    for (const row of usageRows) {
      const rawUsage = (row.usage_json as Record<string, unknown> | null) ?? null;
      const usage = recalculateUsageCost(rawUsage);
      if (!usage) continue;

      const promptTokens = toNumberOrNull(usage.prompt_tokens) ?? 0;
      const completionTokens = toNumberOrNull(usage.completion_tokens) ?? 0;
      const model = (typeof usage.model === 'string' && usage.model.trim().length > 0)
        ? usage.model.trim()
        : (chatModelFallback.get(row.conversation_id) || DEFAULT_GENERAL_MODEL);
      const usdCost = Number(estimateCost(model, promptTokens, completionTokens));

      const existing = chatTotals.get(row.conversation_id) ?? {
        usd_cost: 0,
        model_costs: new Map<string, number>(),
      };
      existing.usd_cost += usdCost;
      existing.model_costs.set(model, (existing.model_costs.get(model) ?? 0) + usdCost);
      chatTotals.set(row.conversation_id, existing);
    }
  }

  const items: GalleryPreviewItem[] = [];

  for (const row of rows) {
    const shareToken = await ensureChatShareToken(row.chat_id, row.share_token);
    const rawUsage = (row.usage_json as Record<string, unknown> | null) ?? null;
    const normalized = normalizeAssistantChatPayload(row.content_text, rawUsage);
    const preview = normalized.codingReport?.preview;
    const totals = chatTotals.get(row.chat_id);
    const dominantModel = totals
      ? [...totals.model_costs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      : (row.chat_model_external_id ?? null);

    if (!preview || ((preview.type !== 'html' && preview.type !== 'url'))) {
      continue;
    }

    items.push({
      message_id: row.message_id,
      chat_id: row.chat_id,
      chat_title: row.chat_title,
      chat_url: `/shared/chats/${shareToken}`,
      preview_title: preview.title?.trim() || null,
      preview_type: preview.type,
      preview_url: preview.type === 'html'
        ? `/api/shared/chats/${shareToken}/messages/${row.message_id}/preview`
        : (preview.url ?? null),
      preview_html: preview.type === 'html' ? (preview.html ?? null) : null,
      author_name: formatAuthorName({
        email: row.author_email,
        username: row.author_username,
        name: row.author_name_raw,
      }),
      view_count: row.preview_view_count ?? 0,
      created_at: toIso(row.created_at),
      total_usd_cost: totals?.usd_cost ?? 0,
      total_rub_cost: (totals?.usd_cost ?? 0) * usdToRubRate,
      model: dominantModel,
    });
  }

  return items;
}
