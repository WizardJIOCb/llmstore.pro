import { db } from '../../config/database.js';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import path from 'path';
import type { Response } from 'express';
import { spawn } from 'child_process';
import net from 'net';
import { tmpdir } from 'os';
import { agents, agentVersions, agentVersionTools, toolDefinitions } from '../../db/schema/agents.js';
import {
  agentRuns,
  agentRunMessages,
  agentRunToolCalls,
  chatSessions,
  chatConversations,
  chatConversationMessages,
  chatMessageFiles,
  chatConversationViewers,
  chatConversationDailyViews,
  chatConversationReactions,
  chatProjectDeployments,
  publishedLandings,
} from '../../db/schema/runtime.js';
import { usageLedger } from '../../db/schema/analytics.js';
import { users } from '../../db/schema/auth.js';
import { aiModels } from '../../db/schema/models.js';
import { eq, desc, and, or, sql, asc, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { openRouterClient } from '../openrouter/index.js';
import { executeTool } from '../tool-execution/index.js';
import { executeHttpRequest } from '../tool-execution/executors/http-request.executor.js';
import { NotFoundError, AppError, ConflictError } from '../../middleware/error-handler.js';
import { logger } from '../../lib/logger.js';
import type { ChatCompletionChoice, ChatCompletionParams, ChatMessage, ToolDefinitionParam } from '../openrouter/types.js';
import { CHAT_GENERATED_FILES_DIR, UPLOADS_DIR } from '../../config/upload.js';
import { openChatEventStream, openSharedChatEventStream, publishChatEvent, publishSharedChatEvent } from './chat-events.service.js';
import {
  getOpenRouterRequestsEnabled,
  getOpenRouterDisabledMessage,
  getStarterPromptSettings,
  getUsdToRubRate,
  resolveStarterPromptsForAgentSlug,
} from '../../lib/app-settings.js';
import { chargeUserBalanceForUsage } from '../../lib/billing.js';
import { calculateCustomerChargeForUsage, type ProfitabilityQuote } from '../../lib/profitability.js';
import { env } from '../../config/env.js';
import {
  estimateCost,
  getModelDisplayLabel,
  getModelPricingInfo,
  isCodingModel,
  isVisionModel,
  normalizeModelLookupKey,
  normalizeOpenRouterModelId,
} from '../../lib/model-pricing.js';

const DEFAULT_MODEL = 'google/gemini-2.0-flash-001';
const DEFAULT_VISION_CHAT_MODEL = 'google/gemini-2.5-flash';
const DEFAULT_IMAGE_GENERATION_MODEL = 'google/gemini-2.5-flash-image';
const DEFAULT_MAX_ITERATIONS = 4;
const CHAT_UPLOADS_DIR = path.join(UPLOADS_DIR, 'chat');
const PROJECT_RUN_TIMEOUT_MS = 20_000;
const PROJECT_HTTP_READY_TIMEOUT_MS = 8_000;
const PROJECT_HTTP_PROBE_INTERVAL_MS = 500;
const PROJECT_MAX_OUTPUT_CHARS = 24_000;
const STALE_PENDING_RUN_MS = 8 * 60_000;
const RESERVED_LANDING_SUBDOMAINS = new Set(['www', 'api', 'admin', 'app', 'static', 'uploads']);
const DEFAULT_MODEL_CONTEXT_TIMEZONE = 'Europe/Moscow';
const DEFAULT_MODEL_CONTEXT_LOCALE = 'ru-RU';

function isLikelyCorruptedDisplayText(value: string): boolean {
  const compact = value.replace(/\s+/g, '');
  if (!compact) return false;

  if (value.includes('\uFFFD')) return true;

  const questionMarkCount = (value.match(/\?/g) ?? []).length;
  const hasLongQuestionRun = /\?{4,}/.test(value);
  return hasLongQuestionRun && questionMarkCount >= 8 && questionMarkCount / compact.length > 0.2;
}

function cleanDisplayText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || isLikelyCorruptedDisplayText(trimmed)) return '';
  return trimmed;
}

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

interface GeneratedChatFileArtifact {
  storage_filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  kind: 'image' | 'text' | 'file';
  sha256?: string;
  text_preview?: string;
  tool_call_id?: string | null;
}

interface ChatGeneratedFileMeta extends GeneratedChatFileArtifact {
  id: string;
  url: string;
  created_at: string;
}

type ChatAccess = 'public' | 'private' | 'restricted';
export type ChatReactionType = 'heart' | 'thumbs_up' | 'thumbs_down' | 'laugh' | 'smile' | 'meh';
const CHAT_REACTION_TYPES: ChatReactionType[] = ['heart', 'thumbs_up', 'thumbs_down', 'laugh', 'smile', 'meh'];

interface CodingReportChangedFile {
  path: string;
  summary?: string;
}

interface CodingReportProjectFile {
  path: string;
  content: string;
  summary?: string;
  language?: string;
  entrypoint?: boolean;
}

export interface CodingReportProjectStackService {
  kind: 'postgres' | 'mysql' | 'redis' | 'sqlite' | 'queue';
  label?: string;
  mode?: 'managed' | 'workspace' | 'external';
  engine?: string;
  env_prefix?: string;
  config?: Record<string, unknown>;
}

export interface CodingReportProjectStackTarget {
  runtime?: 'node' | 'python' | 'static' | 'generic';
  entrypoint?: string;
  root_dir?: string;
  framework?: string;
}

export interface CodingReportProjectStack {
  frontend?: CodingReportProjectStackTarget;
  backend?: CodingReportProjectStackTarget;
  services?: CodingReportProjectStackService[];
}

export interface CodingReportProject {
  title?: string;
  runtime: 'node' | 'python' | 'static' | 'generic';
  root_dir?: string;
  entrypoint?: string;
  install?: string[];
  run?: string[];
  test?: string[];
  notes?: string[];
  stack?: CodingReportProjectStack;
  files: CodingReportProjectFile[];
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
  project?: CodingReportProject | null;
  preview?: CodingReportPreview | null;
  landing_artifact?: LandingArtifactState | null;
}

interface LandingSectionPlanSection {
  id: string;
  label: string;
  goal: string;
  must_include?: string[];
}

interface LandingSectionPlan {
  title?: string;
  summary?: string;
  style_direction?: string;
  sections: LandingSectionPlanSection[];
}

interface LandingThemeBundle {
  title?: string;
  font_links_html?: string;
  body_class?: string;
  style_css?: string;
  script_js?: string;
}

interface LandingArtifactSectionSnapshot {
  id: string;
  label: string;
  goal: string;
  must_include?: string[];
  status: 'planned' | 'rendering' | 'completed' | 'failed';
  html?: string;
}

interface LandingArtifactState {
  mode: 'sectional';
  status: 'planning' | 'theming' | 'rendering_sections' | 'assembling' | 'completed' | 'failed';
  title?: string;
  summary?: string;
  style_direction?: string;
  section_count: number;
  completed_section_count: number;
  last_completed_section_id?: string;
  sections: LandingArtifactSectionSnapshot[];
  assembled_html?: string | null;
}

export interface ProjectRunVerification {
  kind: 'http' | 'process_exit' | 'none';
  ok: boolean;
  message: string;
  url?: string;
  http_status?: number | null;
}

export interface ProjectRunResult {
  runtime: 'node' | 'python' | 'static' | 'generic';
  status: 'passed' | 'failed' | 'timeout' | 'unsupported';
  project_run_count: number | null;
  command: string[];
  entrypoint: string | null;
  duration_ms: number;
  exit_code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  verification: ProjectRunVerification;
}

function getRuntimeConfigModelExternalId(runtimeConfig?: Record<string, unknown> | null): string | null {
  const value = runtimeConfig?.model_external_id;
  return typeof value === 'string' ? (normalizeOpenRouterModelId(value) ?? null) : null;
}

function resolveAgentModelExternalId(
  runtimeConfig?: Record<string, unknown> | null,
  versionModelExternalId?: string | null,
): string | null {
  return getRuntimeConfigModelExternalId(runtimeConfig)
    ?? (normalizeOpenRouterModelId(versionModelExternalId) ?? null)
    ?? DEFAULT_MODEL;
}

function accumulateUsageBreakdown(
  breakdown: Map<string, {
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost_num: number;
    sources: Set<string>;
  }>,
  input: {
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens?: number;
    source: string;
  },
) {
  const model = input.model.trim();
  if (!model) return;

  const promptTokens = Math.max(0, Math.round(input.prompt_tokens));
  const completionTokens = Math.max(0, Math.round(input.completion_tokens));
  const totalTokens = input.total_tokens == null
    ? (promptTokens + completionTokens)
    : Math.max(0, Math.round(input.total_tokens));
  const estimatedCost = Number(estimateCost(model, promptTokens, completionTokens));

  const existing = breakdown.get(model) ?? {
    model,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    estimated_cost_num: 0,
    sources: new Set<string>(),
  };

  existing.prompt_tokens += promptTokens;
  existing.completion_tokens += completionTokens;
  existing.total_tokens += totalTokens;
  existing.estimated_cost_num += estimatedCost;
  existing.sources.add(input.source);
  breakdown.set(model, existing);
}

function serializeUsageBreakdown(
  breakdown: Map<string, {
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost_num: number;
    sources: Set<string>;
  }>,
): UsageBreakdownEntry[] {
  return [...breakdown.values()].map((entry) => ({
    model: entry.model,
    prompt_tokens: entry.prompt_tokens,
    completion_tokens: entry.completion_tokens,
    total_tokens: entry.total_tokens,
    estimated_cost: entry.estimated_cost_num.toFixed(6),
    sources: [...entry.sources],
  }));
}

function sumUsageBreakdownCost(
  breakdown: Map<string, {
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost_num: number;
    sources: Set<string>;
  }>,
): string {
  const total = [...breakdown.values()].reduce((sum, entry) => sum + entry.estimated_cost_num, 0);
  return total.toFixed(6);
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

  if (!user) throw new NotFoundError('Ресурс не найден');

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

function normalizeLandingSubdomain(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 63);

  if (!normalized || normalized.length < 3) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Поддомен должен содержать минимум 3 латинских символа или цифры');
  }

  if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(normalized)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Поддомен может содержать только латинские буквы, цифры и дефисы');
  }

  if (RESERVED_LANDING_SUBDOMAINS.has(normalized)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Этот поддомен зарезервирован');
  }

  return normalized;
}

function buildLandingSlugSource(title?: string | null, fallback?: string): string {
  const base = (title ?? fallback ?? 'landing')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return base || 'landing';
}

async function ensureAvailableLandingSubdomain(baseTitle?: string | null, suffixSeed?: string): Promise<string> {
  const base = normalizeLandingSubdomain(
    buildLandingSlugSource(baseTitle, suffixSeed).slice(0, 40) || 'landing',
  );

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0
      ? base
      : normalizeLandingSubdomain(`${base}-${(suffixSeed ?? uuidv4().replace(/-/g, '')).slice(0, Math.min(6 + attempt, 12))}`.slice(0, 63));
    const [existing] = await db
      .select({ id: publishedLandings.id })
      .from(publishedLandings)
      .where(eq(publishedLandings.subdomain, candidate))
      .limit(1);
    if (!existing) {
      return candidate;
    }
  }

  throw new AppError(500, 'LANDING_SUBDOMAIN_EXHAUSTED', 'Не удалось подобрать свободный поддомен');
}

function getPublishedLandingBaseUrl(): URL {
  const fallback = env.FRONTEND_URL || 'https://llmstore.pro';
  try {
    return new URL(fallback);
  } catch {
    return new URL('https://llmstore.pro');
  }
}

function buildPublishedLandingUrls(subdomain: string, shareToken: string, messageId: string): {
  url: string;
  site_url: string | null;
  preview_url: string | null;
} {
  const frontendUrl = getPublishedLandingBaseUrl();
  const host = frontendUrl.host;
  const isLocalHost = frontendUrl.hostname === 'localhost' || frontendUrl.hostname === '127.0.0.1';
  const previewPath = `/api/shared/chats/${shareToken}/messages/${messageId}/preview`;
  const previewUrl = new URL(previewPath, frontendUrl).toString();

  if (isLocalHost) {
    return {
      url: previewUrl,
      site_url: previewUrl,
      preview_url: previewUrl,
    };
  }

  const siteUrl = `${frontendUrl.protocol}//${subdomain}.${host}/`;
  return {
    url: siteUrl,
    site_url: siteUrl,
    preview_url: previewUrl,
  };
}

function resolveLandingSubdomainFromHost(hostname?: string | null): string | null {
  if (!hostname) return null;
  const normalizedHost = hostname.trim().toLowerCase().replace(/:\d+$/, '');
  if (!normalizedHost) return null;

  const frontendUrl = getPublishedLandingBaseUrl();
  const baseHost = frontendUrl.hostname.trim().toLowerCase();
  if (!baseHost || normalizedHost === baseHost) return null;
  if (!normalizedHost.endsWith(`.${baseHost}`)) return null;

  const subdomain = normalizedHost.slice(0, -(baseHost.length + 1)).trim();
  return subdomain ? normalizeLandingSubdomain(subdomain) : null;
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
    throw new NotFoundError('Ресурс не найден');
  }

  if (agent.status !== 'active' || !agent.current_version_id) {
    throw new AppError(400, 'AGENT_UNAVAILABLE', 'Выбранный агент недоступен');
  }

  if (
    agent.visibility === 'public'
    || agent.owner_user_id === userId
    || isPrivilegedRole(userRole)
  ) {
    return;
  }

  throw new AppError(403, 'FORBIDDEN', 'Этот агент недоступен для выбранного пользователя');
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
  disable_landing_detection?: boolean;
  charge_usage?: boolean;
  deployment_id?: string | null;
  sync_conversation_id?: string | null;
  skip_sync_user_message?: boolean;
  sync_chat_title?: string | null;
  user_role?: string | null;
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
    by_model?: UsageBreakdownEntry[];
  } | null;
  latency_ms: number;
  coding_report?: CodingReport | null;
  error_message?: string;
}

interface SharedPendingRunState {
  run_id: string;
  status: string;
  started_at: string;
  completed_at?: string | null;
  result_status?: 'success' | 'partial' | 'failed_no_result' | 'failed_partial';
  label: string;
  detail: string;
  tool_name?: string | null;
  error?: string | null;
  is_terminal?: boolean;
  is_partial?: boolean;
  events?: PendingRunProgressEvent[];
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

function isEmptyCreateChatFilesTrace(trace: ToolTrace): boolean {
  return (
    trace.tool_name === CREATE_CHAT_FILES_TOOL_SLUG
    && trace.status === 'error'
    && trace.error === 'At least one file is required'
    && Object.keys(trace.input ?? {}).length === 0
  );
}

function getUserVisibleToolTraces(traces: ToolTrace[]): ToolTrace[] {
  return traces.filter((trace) => !isEmptyCreateChatFilesTrace(trace));
}

interface PendingRunProgressEvent {
  event: string;
  run_id: string;
  label: string;
  detail?: string;
  status?: string;
  tool_name?: string | null;
  tool_call_id?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  duration_ms?: number | null;
  error?: string | null;
  ts: string;
}

interface UsageBreakdownEntry {
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost: string;
  sources?: string[];
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

function requireFirstChoice(
  response: { choices?: ChatCompletionChoice[] | null },
  errorMessage: string,
): ChatCompletionChoice {
  const choice = Array.isArray(response.choices) ? response.choices[0] : null;
  if (!choice) {
    throw new AppError(502, 'EMPTY_RESPONSE', errorMessage);
  }

  return choice;
}

function resolveOpenRouterReasoningConfig(modelId?: string | null): ChatCompletionParams['reasoning'] | undefined {
  const normalized = normalizeModelLookupKey(modelId);
  if (!normalized) return undefined;

  if (normalized === 'moonshotai/kimi-k2.6' || normalized === 'kimi-k2.6') {
    return { effort: 'none', exclude: true, enabled: false };
  }

  return undefined;
}

function extractJsonObjectFromAssistantContent(content: string): Record<string, unknown> | null {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (!normalized) return null;

  const fencedMatch = normalized.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() || normalized;
  const extracted = extractFirstJsonObject(candidate);
  if (!extracted) return null;

  try {
    const parsed = JSON.parse(extracted.json);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function normalizeLandingSectionId(value: unknown): string | null {
  const source = clampText(value, 80)?.toLowerCase().trim();
  if (!source) return null;

  const normalized = source
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return normalized || null;
}

function sanitizeLandingSectionPlan(value: unknown): LandingSectionPlan | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const rawSections = Array.isArray(raw.sections) ? raw.sections : [];
  const seen = new Set<string>();
  const sections: LandingSectionPlanSection[] = [];

  for (const item of rawSections) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const id = normalizeLandingSectionId(record.id ?? record.label ?? record.goal);
    const label = clampText(record.label ?? record.id, 120);
    const goal = clampText(record.goal, 400);
    if (!id || !label || !goal || seen.has(id)) continue;

    seen.add(id);
    sections.push({
      id,
      label,
      goal,
      must_include: normalizeStringArray(record.must_include, 8, 240),
    });

    if (sections.length >= 8) break;
  }

  if (sections.length === 0) return null;

  return {
    title: clampText(raw.title, 200) ?? undefined,
    summary: clampText(raw.summary, 1200) ?? undefined,
    style_direction: clampText(raw.style_direction, 600) ?? undefined,
    sections,
  };
}

function sanitizeLandingThemeBundle(value: unknown): LandingThemeBundle | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;

  const fontLinksHtml = clampText(raw.font_links_html, 4000)
    ?.replace(/<\/?(?:html|head|body)[^>]*>/gi, '')
    ?.replace(/<script[\s\S]*?<\/script>/gi, '')
    ?.trim();
  const styleCss = clampText(raw.style_css, 40_000)?.trim();
  const scriptJs = clampText(raw.script_js, 24_000)?.trim();
  const title = clampText(raw.title, 200) ?? undefined;
  const bodyClass = clampText(raw.body_class, 120)
    ?.replace(/[^a-zA-Z0-9 _-]+/g, ' ')
    ?.replace(/\s+/g, ' ')
    ?.trim();

  if (!title && !fontLinksHtml && !styleCss && !scriptJs && !bodyClass) {
    return null;
  }

  return {
    title,
    font_links_html: fontLinksHtml || undefined,
    body_class: bodyClass || undefined,
    style_css: styleCss || undefined,
    script_js: scriptJs || undefined,
  };
}

function normalizeLandingArtifactState(value: unknown): LandingArtifactState | null | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const rawSections = Array.isArray(raw.sections) ? raw.sections : [];
  const sections: LandingArtifactSectionSnapshot[] = [];

  for (const item of rawSections) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const id = normalizeLandingSectionId(record.id);
    const label = clampText(record.label, 120);
    const goal = clampText(record.goal, 400);
    const status = record.status === 'rendering'
      || record.status === 'completed'
      || record.status === 'failed'
      ? record.status
      : 'planned';
    if (!id || !label || !goal) continue;

    sections.push({
      id,
      label,
      goal,
      must_include: normalizeStringArray(record.must_include, 8, 240),
      status,
      html: clampText(stripContinuationNarration(String(record.html ?? '')), 30_000),
    });

    if (sections.length >= 8) break;
  }

  if (sections.length === 0) return null;

  const status = raw.status === 'theming'
    || raw.status === 'rendering_sections'
    || raw.status === 'assembling'
    || raw.status === 'completed'
    || raw.status === 'failed'
    ? raw.status
    : 'planning';
  const sectionCount = Math.max(
    sections.length,
    toNumberOrNull(raw.section_count) ?? sections.length,
  );
  const completedSectionCount = Math.min(
    sectionCount,
    Math.max(
      0,
      toNumberOrNull(raw.completed_section_count)
        ?? sections.filter((section) => section.status === 'completed').length,
    ),
  );

  return {
    mode: 'sectional',
    status,
    title: clampText(raw.title, 200),
    summary: clampText(raw.summary, 1200),
    style_direction: clampText(raw.style_direction, 600),
    section_count: sectionCount,
    completed_section_count: completedSectionCount,
    last_completed_section_id: normalizeLandingSectionId(raw.last_completed_section_id) ?? undefined,
    sections,
    assembled_html: clampText(stripContinuationNarration(String(raw.assembled_html ?? '')), 120_000) ?? null,
  };
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replace(/"/g, '&quot;');
}

function normalizeLandingSectionFragment(content: string, sectionId: string): string {
  const parsedContentReport = extractCodingReport(content).report;
  const extractedJsonObject = extractJsonObjectFromAssistantContent(content);
  const parsedJsonReport = sanitizeCodingReport(extractedJsonObject);
  const wrappedJsonReport = sanitizeCodingReport(
    extractedJsonObject
      && typeof extractedJsonObject.coding_report === 'object'
      ? extractedJsonObject.coding_report
      : null,
  );
  const directPreviewHtml = (
    extractedJsonObject
    && typeof extractedJsonObject.preview === 'object'
    && extractedJsonObject.preview
    && typeof (extractedJsonObject.preview as Record<string, unknown>).html === 'string'
  )
    ? String((extractedJsonObject.preview as Record<string, unknown>).html)
    : null;
  const recoveredPreviewHtml = (
    (parsedContentReport?.preview?.type === 'html' ? parsedContentReport.preview.html : null)
    || (parsedJsonReport?.preview?.type === 'html' ? parsedJsonReport.preview.html : null)
    || (wrappedJsonReport?.preview?.type === 'html' ? wrappedJsonReport.preview.html : null)
    || directPreviewHtml
  );

  let html = (recoveredPreviewHtml ?? stripContinuationNarration(content))
    .replace(/```(?:html)?/gi, '')
    .replace(/```/g, '')
    .replace(/<dev-report>[\s\S]*?<\/dev-report>/gi, '')
    .replace(/<\/?dev-report>\s*/gi, '')
    .trim();

  const escapedTokenCount = (html.match(/\\[nrt"'\\/]/g) ?? []).length;
  if (escapedTokenCount >= 3) {
    html = html
      .replace(/\\r/g, '')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, '\'')
      .replace(/\\\\/g, '\\')
      .trim();
  }

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch?.[1]) {
    html = bodyMatch[1].trim();
  }

  if (!bodyMatch?.[1]) {
    html = html
      .replace(/<head[\s\S]*?<\/head>/i, '')
      .replace(/^<body[^>]*>/i, '')
      .replace(/<\/body>\s*$/i, '')
      .trim();
  }

  html = html
    .replace(/<!doctype[\s\S]*?<html[^>]*>/i, '')
    .replace(/<\/html>\s*$/i, '')
    .trim();

  if (!/<section[\s>]|<main[\s>]|<header[\s>]|<footer[\s>]|<div[\s>]/i.test(html)) {
    html = `<section id="${escapeHtmlAttribute(sectionId)}">\n${html}\n</section>`;
  }

  return html.trim();
}

function detectLandingSectionFragmentIssue(html: string): string | null {
  const trimmed = html.trim();
  if (!trimmed) {
    return 'Пустой HTML-фрагмент секции.';
  }

  if (/<style\b[^>]*>/i.test(trimmed)) {
    return 'Секция не должна содержать <style>; вынеси стили в глобальный theme-step.';
  }

  if (/<script\b[^>]*>/i.test(trimmed)) {
    return 'Секция не должна содержать <script>; вынеси скрипты в глобальный theme-step.';
  }

  const styleOpenCount = (trimmed.match(/<style\b[^>]*>/gi) ?? []).length;
  const styleCloseCount = (trimmed.match(/<\/style>/gi) ?? []).length;
  if (styleOpenCount !== styleCloseCount) {
    return 'Во фрагменте незакрытый или оборванный <style>.';
  }

  const scriptOpenCount = (trimmed.match(/<script\b[^>]*>/gi) ?? []).length;
  const scriptCloseCount = (trimmed.match(/<\/script>/gi) ?? []).length;
  if (scriptOpenCount !== scriptCloseCount) {
    return 'Во фрагменте незакрытый или оборванный <script>.';
  }

  const rootMatch = trimmed.match(/^<(section|main|header|footer|article|div)\b/i);
  if (rootMatch?.[1]) {
    const rootTag = rootMatch[1];
    if (!new RegExp(`</${rootTag}>\\s*$`, 'i').test(trimmed)) {
      return `Фрагмент оборван и не закрывает корневой <${rootTag}>.`;
    }
  }

  if (/<[^>]*$/.test(trimmed)) {
    return 'Фрагмент заканчивается незавершённым HTML-тегом.';
  }

  const contentOnly = trimmed
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .trim();
  if (!/<(?:div|article|header|footer|nav|figure|figcaption|blockquote|p|h[1-6]|ul|ol|li|a|button|img|picture|svg|video|canvas|form|input|textarea|label|span)\b/i.test(contentOnly)) {
    return 'Во фрагменте нет видимой контентной разметки, кроме служебных тегов.';
  }

  return null;
}

function buildBrokenLandingSectionFallback(sectionId: string, reason?: string | null): string {
  const safeSectionId = escapeHtmlAttribute(sectionId);
  const safeReason = escapeHtmlText(reason ?? 'Секция была повреждена и скрыта.');
  return [
    `<section id="${safeSectionId}" class="llmstore-section-fallback">`,
    '  <style>',
    '    .llmstore-section-fallback { padding: 72px 0; background: linear-gradient(180deg, rgba(15,23,42,.84), rgba(15,23,42,.62)); }',
    '    .llmstore-section-fallback__inner { width: min(920px, calc(100% - 32px)); margin: 0 auto; padding: 28px; border-radius: 24px; border: 1px solid rgba(148,163,184,.22); background: rgba(15,23,42,.72); box-shadow: 0 24px 80px rgba(2,6,23,.24); }',
    '    .llmstore-section-fallback__eyebrow { display: inline-flex; margin-bottom: 12px; padding: 8px 12px; border-radius: 999px; background: rgba(56,189,248,.12); color: #38bdf8; font: 600 12px/1.2 "Segoe UI", system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; }',
    '    .llmstore-section-fallback__title { margin: 0 0 10px; color: #f8fafc; font: 700 clamp(24px, 4vw, 34px)/1.1 "Segoe UI", system-ui, sans-serif; }',
    '    .llmstore-section-fallback__text { margin: 0; color: #94a3b8; font: 400 15px/1.7 "Segoe UI", system-ui, sans-serif; }',
    '  </style>',
    '  <div class="llmstore-section-fallback__inner">',
    `    <div class="llmstore-section-fallback__eyebrow">${safeSectionId}</div>`,
    '    <h2 class="llmstore-section-fallback__title">Секция временно скрыта</h2>',
    `    <p class="llmstore-section-fallback__text">${safeReason}</p>`,
    '  </div>',
    '</section>',
  ].join('\n');
}

function buildSafeLandingSectionFallback(section: LandingSectionPlanSection, index: number, reason?: string | null): string {
  const safeSectionId = escapeHtmlAttribute(section.id);
  const safeLabel = escapeHtmlText(section.label);
  const safeGoal = escapeHtmlText(section.goal);
  const safeReason = escapeHtmlText(reason ?? 'Секция была автоматически восстановлена в безопасном формате.');
  const items = (section.must_include ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 6);

  const listHtml = items.length > 0
    ? [
      '<ul class="llmstore-safe-fallback__list">',
      ...items.map((item) => `  <li>${escapeHtmlText(item)}</li>`),
      '</ul>',
    ].join('\n')
    : `<p class="llmstore-safe-fallback__text">${safeGoal}</p>`;

  return [
    `<section id="${safeSectionId}" class="llmstore-safe-fallback llmstore-safe-fallback--${index + 1}">`,
    '  <div class="container">',
    '    <div class="card llmstore-safe-fallback__card">',
    `      <span class="eyebrow">Раздел ${index + 1}</span>`,
    `      <h2>${safeLabel}</h2>`,
    `      <p class="llmstore-safe-fallback__text">${safeGoal}</p>`,
    `      <p class="llmstore-safe-fallback__reason">${safeReason}</p>`,
    `      ${listHtml}`,
    '    </div>',
    '  </div>',
    '</section>',
  ].join('\n');
}

function repairSectionalPreviewHtml(html: string): string {
  if (!/<!--\s*llmstore-section:/i.test(html)) {
    return html;
  }

  return html.replace(
    /<!--\s*llmstore-section:([a-z0-9-]+)\s*-->\s*([\s\S]*?)(?=(?:<!--\s*llmstore-section:|<\/main>))/gi,
    (_match, sectionId: string, fragment: string) => {
      const normalizedFragment = normalizeLandingSectionFragment(fragment, sectionId).trim();
      const fragmentIssue = detectLandingSectionFragmentIssue(normalizedFragment);
      const repairedFragment = fragmentIssue
        ? buildBrokenLandingSectionFallback(sectionId, fragmentIssue)
        : normalizedFragment;
      return `<!-- llmstore-section:${sectionId} -->\n${repairedFragment}\n\n`;
    },
  );
}

function buildFallbackLandingTheme(plan: LandingSectionPlan): LandingThemeBundle {
  return {
    title: plan.title ?? 'Generated landing',
    body_class: 'llmstore-landing-root',
    style_css: [
      ':root{color-scheme:dark;--bg:#07111f;--bg-soft:#0f1f34;--surface:rgba(15,23,42,.82);--text:#f8fafc;--muted:#94a3b8;--accent:#38bdf8;--accent-2:#f97316;--border:rgba(148,163,184,.2);}',
      '*{box-sizing:border-box;}',
      'html,body{margin:0;padding:0;min-height:100%;background:radial-gradient(circle at top,#11233d 0%,#07111f 55%,#030712 100%);color:var(--text);font-family:"Segoe UI",system-ui,sans-serif;}',
      'body{overflow-x:hidden;}',
      'main{display:flex;flex-direction:column;gap:0;}',
      'section{padding:72px 0;position:relative;}',
      '.container{width:min(1120px,calc(100% - 48px));margin:0 auto;}',
      'h1,h2,h3{margin:0 0 16px;line-height:1.1;}',
      'p{margin:0 0 16px;line-height:1.7;color:var(--muted);}',
      '.eyebrow{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:rgba(56,189,248,.12);color:var(--accent);font-size:13px;letter-spacing:.14em;text-transform:uppercase;}',
      '.card{background:var(--surface);border:1px solid var(--border);border-radius:28px;box-shadow:0 24px 80px rgba(2,6,23,.28);backdrop-filter:blur(18px);}',
      '.grid{display:grid;gap:24px;}',
      '.llmstore-safe-fallback__card{padding:32px;}',
      '.llmstore-safe-fallback__text{margin:0 0 14px;color:var(--muted);}',
      '.llmstore-safe-fallback__reason{margin:0 0 18px;color:var(--accent);font-size:14px;}',
      '.llmstore-safe-fallback__list{margin:0;padding-left:20px;color:var(--text);display:grid;gap:10px;}',
      '@media (max-width: 768px){section{padding:56px 0;}.container{width:min(100% - 28px,1120px);}}',
    ].join('\n'),
  };
}

function buildSectionalLandingHtml(
  plan: LandingSectionPlan,
  theme: LandingThemeBundle,
  sectionFragments: Array<{ id: string; html: string }>,
): string {
  const safeTitle = escapeHtmlText(theme.title ?? plan.title ?? 'Generated landing');
  const bodyClass = theme.body_class ? ` class="${escapeHtmlAttribute(theme.body_class)}"` : '';
  const headExtras = theme.font_links_html ? `\n${theme.font_links_html.trim()}\n` : '\n';
  const styleBlock = theme.style_css
    ? `<style>\n${theme.style_css.trim()}\n</style>\n`
    : '';
  const scriptBlock = theme.script_js
    ? `\n<script>\n${theme.script_js.trim()}\n</script>\n`
    : '\n';
  const sectionsHtml = sectionFragments
    .map((section) => `<!-- llmstore-section:${section.id} -->\n${section.html.trim()}`)
    .join('\n\n');

  return [
    '<!doctype html>',
    '<html lang="ru">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<title>${safeTitle}</title>${headExtras}${styleBlock}</head>`,
    `<body${bodyClass}>`,
    '<main>',
    sectionsHtml,
    '</main>',
    scriptBlock,
    '</body>',
    '</html>',
  ].join('\n');
}

function buildLandingArtifactReport(
  artifact: LandingArtifactState,
  options?: {
    title?: string | null;
    summary?: string | null;
    extraNotes?: string[];
  },
): CodingReport {
  const assembledHtml = artifact.assembled_html?.trim() || null;
  const preview = assembledHtml
    ? {
      type: 'html' as const,
      title: options?.title?.trim() || artifact.title?.trim() || 'Generated landing',
      html: assembledHtml,
    }
    : null;

  const notes = [
    preview
      ? 'Preview собран и обновляется по ходу секционной генерации.'
      : 'Секции лендинга сохраняются по мере генерации. Preview появится после первых готовых секций.',
    ...(
      options?.extraNotes?.filter((note) => Boolean(note?.trim()))
        .map((note) => note.trim())
        ?? []
    ),
  ].slice(0, 12);

  return {
    summary: options?.summary?.trim()
      || artifact.summary?.trim()
      || 'Собираю лендинг секционно, чтобы не потерять результат на длинном ответе.',
    worklog: artifact.sections.map((section, index) => {
      const prefix = section.status === 'completed'
        ? 'Секция готова'
        : section.status === 'rendering'
          ? 'Рендерю секцию'
          : section.status === 'failed'
            ? 'Секция завершилась с ошибкой'
            : 'Запланирована секция';
      return `${index + 1}. ${prefix}: ${section.label}`;
    }).slice(0, 16),
    notes,
    preview,
    landing_artifact: artifact,
  };
}

function looksLikeLandingBuildRequest(request: string): boolean {
  const text = request.trim().toLowerCase();
  if (!text) return false;

  return /(landing|landing page|лендинг|preview|превью|html|site|website|страниц|сайт|hero|page)/i.test(text);
}

function looksLikeLandingPreviewOnlyRequest(request: string): boolean {
  const text = request.trim().toLowerCase();
  if (!text) return false;

  const wantsLanding = looksLikeLandingBuildRequest(text);
  const excludesBackend = /(не делай backend|без backend|не нужен backend|frontend-only|only frontend|только frontend|только landing preview|только preview)/i.test(text);
  const excludesDatabase = /(не делай базу|без базы|не делай postgresql|без postgresql|не делай project bundle|не нужен project bundle)/i.test(text);
  return wantsLanding && (excludesBackend || excludesDatabase);
}

function extractHttpUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"')]+/gi) ?? [];
  const unique = new Set<string>();

  for (const raw of matches) {
    const normalized = raw.trim().replace(/[),.;:!?]+$/u, '');
    if (!normalized) continue;
    unique.add(normalized);
    if (unique.size >= 3) break;
  }

  return [...unique];
}

async function buildLandingReferenceContextFromUrls(request: string): Promise<string | null> {
  const urls = extractHttpUrls(request);
  if (urls.length === 0) return null;

  const parts: string[] = [];

  for (const url of urls) {
    try {
      const response = await executeHttpRequest(
        { url, method: 'GET' },
        { timeout_ms: 12_000, max_response_size: 24_000 },
      );

      const title = typeof response.title === 'string' ? response.title.trim() : '';
      const body = typeof response.body === 'string' ? response.body.trim() : '';
      const links = Array.isArray(response.links)
        ? response.links
          .slice(0, 5)
          .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const titleValue = typeof (item as { title?: unknown }).title === 'string'
              ? String((item as { title?: unknown }).title).trim()
              : '';
            const urlValue = typeof (item as { url?: unknown }).url === 'string'
              ? String((item as { url?: unknown }).url).trim()
              : '';
            if (!urlValue) return null;
            return titleValue ? `- ${titleValue}: ${urlValue}` : `- ${urlValue}`;
          })
          .filter((value): value is string => Boolean(value))
        : [];

      parts.push([
        `Источник: ${url}`,
        title ? `Заголовок: ${title}` : null,
        body ? `Краткое содержимое:\n${clampText(body, 8_000)}` : null,
        links.length > 0 ? `Полезные ссылки со страницы:\n${links.join('\n')}` : null,
      ].filter(Boolean).join('\n\n'));
    } catch (error) {
      logger.warn({ url, error }, 'Failed to fetch landing reference URL');
    }
  }

  if (parts.length === 0) return null;
  return parts.join('\n\n---\n\n');
}

function looksLikeCodeLine(line: string): boolean {
  const value = line.trim();
  if (!value) return false;
  return /^(<!doctype|<html\b|<head\b|<body\b|<style\b|<script\b|<\/|<div\b|<section\b|<main\b|<header\b|<footer\b|<svg\b|<!--|[.#@]?[\w-]+\s*\{|const\s|let\s|var\s|function\s|\}|<\/?[a-z])/i.test(value);
}

function stripContinuationNarration(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n');

  let cleaned = normalized
    .replace(/```(?:html)?\s*/gi, '')
    .replace(/^\s*(?:Продолжаю с места остановки|Продолжаю строго с места остановки|Продолжаю строго с места обрыва|Продолжаю с места обрыва|Выдаю полный HTML(?:-файл)? целиком|Ниже\s+[—-]\s+полный.*HTML.*|Вот\s+полный.*HTML.*|Ниже\s+полный.*HTML.*)(?:\s*[—:-]\s*.*)?$/gimu, '')
    .replace(/\n{3,}/g, '\n\n');

  cleaned = cleaned
    .split('\n')
    .filter((line) => {
      const value = line.trim();
      if (!value) return true;
      if (
        /^(?:Продолжаю с места остановки|Продолжаю строго с места остановки|Продолжаю строго с места обрыва|Продолжаю с места обрыва)(?:\s*[—:-]\s*.*)?$/iu.test(value)
      ) {
        return false;
      }
      if (/^после строки:\s*$/iu.test(value)) {
        return false;
      }
      return true;
    })
    .join('\n');

  const lines = cleaned.split('\n');
  while (lines.length > 0) {
    const first = lines[0]?.trim() ?? '';
    if (!first) {
      lines.shift();
      continue;
    }
    if (
      /^(?:Продолжаю|Выдаю|Ниже|Вот)\b/iu.test(first)
      && !looksLikeCodeLine(first)
    ) {
      lines.shift();
      continue;
    }
    break;
  }

  cleaned = lines.join('\n').trim();
  return cleaned.replace(/\n*\[Ответ[^\]]+\]\s*$/u, '').trim();
}

function sanitizeRecoveredHtmlPreview(html: string): string {
  return stripContinuationNarration(html)
    .replace(/<dev-report>[\s\S]*?<\/dev-report>/gi, '')
    .replace(/<\/?dev-report>\s*/gi, '')
    .replace(/^\s*(?:js|html)\s*$/gimu, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function mergeAssistantOutputChunks(base: string, next: string): string {
  const htmlLike = looksLikeHtmlPreviewPayload(base) || looksLikeHtmlPreviewPayload(next);
  const left = (htmlLike ? stripContinuationNarration(base) : base).trimEnd();
  const right = (htmlLike ? stripContinuationNarration(next) : next).trimStart();
  if (!left) return right;
  if (!right) return left;
  if (left.endsWith(right)) return left;

  const maxOverlap = Math.min(8000, left.length, right.length);
  for (let overlap = maxOverlap; overlap >= 80; overlap -= 8) {
    if (left.slice(-overlap) === right.slice(0, overlap)) {
      return `${left}${right.slice(overlap)}`;
    }
  }

  const leftLines = left.split('\n');
  const rightLines = right.split('\n');
  const maxLineOverlap = Math.min(80, leftLines.length, rightLines.length);
  for (let overlap = maxLineOverlap; overlap >= 2; overlap -= 1) {
    const leftChunk = leftLines.slice(-overlap).join('\n').trim();
    const rightChunk = rightLines.slice(0, overlap).join('\n').trim();
    if (leftChunk && leftChunk === rightChunk) {
      return `${left}\n${rightLines.slice(overlap).join('\n')}`.trim();
    }
  }

  return `${left}\n${right}`;
}

function extractPartialCodingSummary(content: string): string | null {
  const pseudoSummary = extractPseudoAssignment(content, 'coding_report.summary');
  if (pseudoSummary?.trim()) {
    return pseudoSummary.trim();
  }

  const summaryMatch = content.match(/"summary"\s*:\s*"((?:\\.|[^"\\])*)"/i);
  if (!summaryMatch) return null;

  const raw = summaryMatch[1];
  try {
    const decoded = JSON.parse(`"${raw}"`);
    return typeof decoded === 'string' ? decoded.trim() || null : null;
  } catch {
    return raw.replace(/\\"/g, '"').replace(/\\n/g, '\n').trim() || null;
  }
}

function formatIsoUtcWithoutMs(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function formatDatePartsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function formatTimeZoneOffset(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const rawOffset = parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
    const normalized = rawOffset
      .replace(/^GMT/i, '')
      .replace(/^UTC/i, '')
      .trim();

    if (!normalized) return 'Z';
    if (/^[+-]\d{1,2}$/.test(normalized)) {
      const sign = normalized[0];
      const hours = normalized.slice(1).padStart(2, '0');
      return `${sign}${hours}:00`;
    }
    if (/^[+-]\d{1,2}:\d{2}$/.test(normalized)) {
      const sign = normalized[0];
      const [hours, minutes] = normalized.slice(1).split(':');
      return `${sign}${hours.padStart(2, '0')}:${minutes}`;
    }
  } catch {
  }

  if (timeZone === 'Europe/Moscow') {
    return '+03:00';
  }

  return 'Z';
}

function buildModelEnvironmentContext(options?: {
  timeZone?: string;
  locale?: string;
}): string {
  const now = new Date();
  const timeZone = options?.timeZone?.trim() || DEFAULT_MODEL_CONTEXT_TIMEZONE;
  const locale = options?.locale?.trim() || DEFAULT_MODEL_CONTEXT_LOCALE;
  const parts = formatDatePartsInTimeZone(now, timeZone);
  const currentDateLocal = `${parts.year}-${parts.month}-${parts.day}`;
  const currentDateTimeLocal = `${currentDateLocal}T${parts.hour}:${parts.minute}:${parts.second}${formatTimeZoneOffset(now, timeZone)}`;

  return [
    '<environment_context>',
    `current_datetime_utc: ${formatIsoUtcWithoutMs(now)}`,
    `current_datetime_local: ${currentDateTimeLocal}`,
    `current_date_local: ${currentDateLocal}`,
    `timezone: ${timeZone}`,
    `locale: ${locale}`,
    '</environment_context>',
  ].join('\n');
}

function buildLandingResponseDisciplineInstruction(userRequest: string): string {
  return [
    'Режим жёсткого ответа для landing/preview-задачи.',
    'Нужен только валидный структурированный результат, без длинного narrative output.',
    'Сначала верни <dev-report> с валидным JSON.',
    'Если задача про landing или preview, не пиши ничего после </dev-report>.',
    'Не пиши фразы вроде "готово", "ниже файлы", "могу продолжить", если вместе с этим не вернул валидный preview.html.',
    'Если не помещается всё, приоритет номер один: preview.type="html" и полный preview.html.',
    'Если пользователь просит runnable проект, после preview можно вернуть project, но только внутри dev-report JSON.',
    'Не возвращай markdown-списки файлов вне project.files.',
    `Запрос пользователя: ${userRequest}`,
  ].join('\n');
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

function safeGeneratedFilePath(filename: string): string {
  return path.join(CHAT_GENERATED_FILES_DIR, path.basename(filename));
}

function detectImageGenerationIntent(value: string): boolean {
  const text = value.trim().toLowerCase();
  if (!text) return false;

  return [
    /сгенерир(?:уй|овать|овать\s+мне)?\s+(?:картинк|изображен|фото|рисунок|арт|иллюстрац)/i,
    /созда(?:й|ть)\s+(?:картинк|изображен|фото|рисунок|арт|иллюстрац)/i,
    /нарису(?:й|й\s+мне|йте)\s+/i,
    /сдела(?:й|ть)\s+(?:картинк|изображен|фото|рисунок|арт|иллюстрац)/i,
    /generate\s+(?:an?\s+)?(?:image|picture|photo|illustration|art)/i,
    /create\s+(?:an?\s+)?(?:image|picture|photo|illustration|art)/i,
    /draw\s+(?:an?\s+)?/i,
  ].some((pattern) => pattern.test(text));
}

function resolveImageGenerationAspectRatio(value: string): string | undefined {
  const text = value.toLowerCase();
  if (/\b(16\s*[:xх]\s*9|wide|widescreen|горизонтал|широк)/i.test(text)) return '16:9';
  if (/\b(9\s*[:xх]\s*16|vertical|story|stories|reels|вертикал)/i.test(text)) return '9:16';
  if (/\b(4\s*[:xх]\s*3)\b/i.test(text)) return '4:3';
  if (/\b(3\s*[:xх]\s*4)\b/i.test(text)) return '3:4';
  if (/\b(3\s*[:xх]\s*2)\b/i.test(text)) return '3:2';
  if (/\b(2\s*[:xх]\s*3)\b/i.test(text)) return '2:3';
  if (/\b(1\s*[:xх]\s*1|square|квадрат)/i.test(text)) return '1:1';
  return undefined;
}

function isGeneratedImageDataUrl(value: unknown): value is string {
  return typeof value === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);
}

function extractOpenRouterGeneratedImageUrls(message: ChatMessage | undefined): string[] {
  if (!message) return [];

  const urls: string[] = [];
  const pushUrl = (value: unknown) => {
    if (isGeneratedImageDataUrl(value) && !urls.includes(value)) {
      urls.push(value);
    }
  };

  if (Array.isArray(message.images)) {
    for (const image of message.images) {
      pushUrl(image.image_url?.url);
      pushUrl(image.imageUrl?.url);
    }
  }

  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part?.type === 'image_url') {
        pushUrl(part.image_url?.url);
      }
    }
  } else if (typeof message.content === 'string') {
    for (const match of message.content.matchAll(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\r\n]+/gi)) {
      pushUrl(match[0]);
    }
  }

  return urls;
}

function extractOpenRouterMessageText(message: ChatMessage | undefined): string {
  if (!message) return '';
  if (typeof message.content === 'string') return message.content.trim();
  if (!Array.isArray(message.content)) return '';

  return message.content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.type === 'text' ? part.text.trim() : '')
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function decodeGeneratedImageDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer; extension: string } | null {
  const match = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i);
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  const base64 = match[2].replace(/\s+/g, '');
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0) return null;

  const extension = mimeType.includes('jpeg') || mimeType.includes('jpg')
    ? '.jpg'
    : mimeType.includes('webp')
      ? '.webp'
      : mimeType.includes('gif')
        ? '.gif'
        : '.png';

  return { mimeType, buffer, extension };
}

async function materializeGeneratedImagesFromDataUrls(dataUrls: string[]): Promise<GeneratedChatFileArtifact[]> {
  const files: GeneratedChatFileArtifact[] = [];

  for (const [index, dataUrl] of dataUrls.entries()) {
    const decoded = decodeGeneratedImageDataUrl(dataUrl);
    if (!decoded) continue;

    const storageFilename = `${uuidv4()}${decoded.extension}`;
    await writeFile(safeGeneratedFilePath(storageFilename), decoded.buffer);
    files.push({
      storage_filename: storageFilename,
      original_name: `generated-image-${index + 1}${decoded.extension}`,
      mime_type: decoded.mimeType,
      size: decoded.buffer.length,
      kind: 'image',
      tool_call_id: null,
    });
  }

  return files;
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

function clampFileContent(value: unknown, max = 80_000): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/\r\n/g, '\n');
  if (!normalized.trim()) return undefined;
  return normalized.slice(0, max);
}

function normalizeProjectFiles(value: unknown): CodingReportProjectFile[] | undefined {
  if (!Array.isArray(value)) return undefined;

  let totalContentLength = 0;
  const normalized: CodingReportProjectFile[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;

    const row = item as {
      path?: unknown;
      content?: unknown;
      summary?: unknown;
      language?: unknown;
      entrypoint?: unknown;
    };
    const filePath = clampText(row.path, 500);
    const content = clampFileContent(row.content, 100_000);
    if (!filePath || !content) continue;

    if (totalContentLength + content.length > 400_000) {
      break;
    }

    totalContentLength += content.length;
    normalized.push({
      path: filePath,
      content,
      summary: clampText(row.summary, 500),
      language: clampText(row.language, 80),
      entrypoint: row.entrypoint === true,
    });

    if (normalized.length >= 40) {
      break;
    }
  }

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeProjectStackTarget(value: unknown): CodingReportProjectStackTarget | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const target = value as {
    runtime?: unknown;
    entrypoint?: unknown;
    root_dir?: unknown;
    framework?: unknown;
  };

  const runtime = target.runtime === 'node'
    || target.runtime === 'python'
    || target.runtime === 'static'
    || target.runtime === 'generic'
    ? target.runtime
    : undefined;

  const normalized: CodingReportProjectStackTarget = {
    runtime,
    entrypoint: clampText(target.entrypoint, 500),
    root_dir: clampText(target.root_dir, 300),
    framework: clampText(target.framework, 80),
  };

  return Object.values(normalized).some(Boolean) ? normalized : undefined;
}

function normalizeProjectStackServices(value: unknown): CodingReportProjectStackService[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const normalized: CodingReportProjectStackService[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as {
      kind?: unknown;
      label?: unknown;
      mode?: unknown;
      engine?: unknown;
      env_prefix?: unknown;
      config?: unknown;
    };

    const kind = row.kind === 'postgres'
      || row.kind === 'mysql'
      || row.kind === 'redis'
      || row.kind === 'sqlite'
      || row.kind === 'queue'
      ? row.kind
      : null;

    if (!kind) continue;

    const envPrefix = clampText(row.env_prefix, 48);
    const dedupeKey = `${kind}:${envPrefix ?? ''}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    normalized.push({
      kind,
      label: clampText(row.label, 160),
      mode: row.mode === 'managed' || row.mode === 'workspace' || row.mode === 'external'
        ? row.mode
        : undefined,
      engine: clampText(row.engine, 64),
      env_prefix: envPrefix,
      config: row.config && typeof row.config === 'object' && !Array.isArray(row.config)
        ? row.config as Record<string, unknown>
        : undefined,
    });
  }

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeProjectStack(value: unknown): CodingReportProjectStack | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const stack = value as {
    frontend?: unknown;
    backend?: unknown;
    services?: unknown;
  };

  const normalized: CodingReportProjectStack = {
    frontend: normalizeProjectStackTarget(stack.frontend),
    backend: normalizeProjectStackTarget(stack.backend),
    services: normalizeProjectStackServices(stack.services),
  };

  return normalized.frontend || normalized.backend || normalized.services?.length ? normalized : undefined;
}

function normalizeProject(value: unknown): CodingReportProject | null | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const project = value as {
    title?: unknown;
    runtime?: unknown;
    root_dir?: unknown;
    entrypoint?: unknown;
    install?: unknown;
    run?: unknown;
    test?: unknown;
    notes?: unknown;
    stack?: unknown;
    files?: unknown;
  };

  const files = normalizeProjectFiles(project.files);
  if (!files) return null;

  const runtime = project.runtime === 'node'
    || project.runtime === 'python'
    || project.runtime === 'static'
    || project.runtime === 'generic'
    ? project.runtime
    : 'generic';

  return {
    title: clampText(project.title, 200),
    runtime,
    root_dir: clampText(project.root_dir, 300),
    entrypoint: clampText(project.entrypoint, 500),
    install: normalizeStringArray(project.install, 12, 500),
    run: normalizeStringArray(project.run, 12, 500),
    test: normalizeStringArray(project.test, 12, 500),
    notes: normalizeStringArray(project.notes, 12, 1000),
    stack: normalizeProjectStack(project.stack),
    files,
  };
}

function inferProjectRuntimeFromFiles(
  files: CodingReportProjectFile[],
  howToRun?: string[] | null,
): CodingReportProject['runtime'] {
  const paths = files.map((file) => file.path.toLowerCase());
  const runText = (howToRun ?? []).join('\n').toLowerCase();

  if (paths.includes('package.json') || /\.(c|m)?js$/.test(paths.join('\n')) || /\.(ts|tsx)$/.test(paths.join('\n')) || /\b(node|npm|pnpm|yarn|bun)\b/.test(runText)) {
    return 'node';
  }

  if (paths.some((filePath) => filePath.endsWith('.py')) || /\bpython(?:3(?:\.\d+)?)?\b/.test(runText)) {
    return 'python';
  }

  if (paths.some((filePath) => filePath.endsWith('.html'))) {
    return 'static';
  }

  return 'generic';
}

function inferProjectEntrypointFromRunCommands(
  runCommands: string[] | undefined,
  runtime: CodingReportProject['runtime'],
): string | undefined {
  if (!runCommands || runCommands.length === 0) return undefined;

  for (const command of runCommands) {
    if (runtime === 'python') {
      const match = command.match(/\bpython(?:3(?:\.\d+)?)?\s+([^\s]+\.py)\b/i);
      if (match?.[1]) return clampText(match[1], 500) ?? undefined;
    }

    if (runtime === 'node') {
      const match = command.match(/\bnode\s+([^\s]+\.(?:cjs|mjs|js|ts))\b/i);
      if (match?.[1]) return clampText(match[1], 500) ?? undefined;
    }
  }

  return undefined;
}

function inferProjectEntrypointFromFiles(
  files: CodingReportProjectFile[],
  runtime: CodingReportProject['runtime'],
): string | undefined {
  const candidates = runtime === 'python'
    ? ['main.py', 'app.py', 'server.py', 'run.py']
    : runtime === 'node'
      ? ['server.js', 'app.js', 'index.js', 'main.js', 'server.mjs', 'app.mjs', 'index.mjs']
      : runtime === 'static'
        ? ['index.html']
        : [];

  for (const candidate of candidates) {
    if (files.some((file) => file.path.toLowerCase() === candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function extractMarkdownProjectFiles(
  content: string,
  changedFiles?: CodingReportChangedFile[] | null,
): CodingReportProjectFile[] | null {
  const summaryByPath = new Map(
    (changedFiles ?? [])
      .map((file) => [file.path.trim().toLowerCase(), file.summary] as const)
      .filter(([filePath]) => filePath.length > 0),
  );
  const results: CodingReportProjectFile[] = [];
  const seen = new Set<string>();
  const fileBlockPattern = /(?:^|\n)#{1,6}\s+(?:`([^`\r\n]+)`|([./\w-]+\.[\w.+-]+))\s*\n(?:\s*\n)?```([^\n`]*)\n([\s\S]*?)\n```/g;

  for (const match of content.matchAll(fileBlockPattern)) {
    const rawPath = (match[1] ?? match[2] ?? '').trim();
    if (!rawPath) continue;

    let normalizedPath: string;
    try {
      normalizedPath = sanitizeProjectFilePath(rawPath);
    } catch {
      continue;
    }

    if (seen.has(normalizedPath)) continue;
    seen.add(normalizedPath);

    const fence = (match[3] ?? '').trim();
    const language = clampText(fence.split(/\s+/)[0] || undefined, 40);
    const contentBlock = match[4] ?? '';
    results.push({
      path: normalizedPath,
      content: contentBlock.replace(/\r\n/g, '\n'),
      summary: summaryByPath.get(normalizedPath.toLowerCase()),
      language,
    });
  }

  if (results.length === 0) {
    const normalizedChangedFiles = (changedFiles ?? [])
      .map((file) => ({
        path: file.path.trim(),
        summary: file.summary,
      }))
      .filter((file) => file.path.length > 0);

    const singleChangedFile = normalizedChangedFiles.length === 1 ? normalizedChangedFiles[0] : null;
    const bareFenceMatch = content.match(/```([^\n`]*)\n([\s\S]*?)\n```/);

    if (singleChangedFile && bareFenceMatch) {
      try {
        const normalizedPath = sanitizeProjectFilePath(singleChangedFile.path);
        const fence = (bareFenceMatch[1] ?? '').trim();
        const language = clampText(fence.split(/\s+/)[0] || undefined, 40);
        const contentBlock = bareFenceMatch[2] ?? '';
        results.push({
          path: normalizedPath,
          content: contentBlock.replace(/\r\n/g, '\n'),
          summary: singleChangedFile.summary,
          language,
        });
      } catch {
        // Ignore fallback recovery if the inferred path is unsafe.
      }
    }
  }

  return results.length > 0 ? results : null;
}

function recoverProjectBundleFromMarkdown(content: string, report?: CodingReport | null): CodingReportProject | null {
  const files = extractMarkdownProjectFiles(content, report?.changed_files);
  if (!files) return null;

  const runCommands = normalizeStringArray(report?.how_to_run, 12, 500);
  const runtime = inferProjectRuntimeFromFiles(files, runCommands);
  const entrypoint = inferProjectEntrypointFromRunCommands(runCommands, runtime)
    ?? inferProjectEntrypointFromFiles(files, runtime);

  const nextFiles = files.map((file) => ({
    ...file,
    entrypoint: entrypoint ? file.path === entrypoint : undefined,
  }));

  return {
    title: clampText(report?.summary, 200) ?? 'Recovered project bundle',
    runtime,
    entrypoint,
    run: runCommands,
    notes: [
      ...(report?.notes ?? []),
      'Project bundle автоматически восстановлен из markdown-файлов в ответе агента.',
    ].slice(0, 12),
    files: nextFiles,
  };
}

function extractHtmlTitleFromDocument(html: string): string | null {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch) return null;
  return clampText(titleMatch[1].replace(/\s+/g, ' ').trim(), 200) ?? null;
}

function recoverHtmlPreviewFromMarkdown(
  content: string,
  report?: CodingReport | null,
): { preview: CodingReportPreview; cleanText: string; incomplete: boolean } | null {
  const blockPattern = /```([^\n`]*)\n([\s\S]*?)(\n```|$)/g;
  let bestMatch: {
    html: string;
    cleanText: string;
    score: number;
    incomplete: boolean;
  } | null = null;

  for (const match of content.matchAll(blockPattern)) {
    const rawFence = (match[1] ?? '').trim().toLowerCase();
    const rawBlock = (match[2] ?? '').replace(/\r\n/g, '\n');
    const closingToken = match[3] ?? '';
    const fullMatch = match[0] ?? '';
    const startIndex = match.index ?? 0;
    const endIndex = startIndex + fullMatch.length;

    let score = 0;
    if (rawFence.startsWith('html')) score += 3;
    if (/<\!doctype\s+html/i.test(rawBlock)) score += 5;
    if (/<html[\s>]/i.test(rawBlock)) score += 4;
    if (/<body[\s>]|<head[\s>]|<style[\s>]|<script[\s>]/i.test(rawBlock)) score += 2;
    if (/<\/html>\s*$/i.test(rawBlock.trim())) score += 2;

    const headingContext = content.slice(Math.max(0, startIndex - 160), startIndex);
    if (/index\.html/i.test(headingContext)) score += 2;
    if (score < 5) continue;

    const html = sanitizeRecoveredHtmlPreview(rawBlock);
    if (!html) continue;

    const cleanText = [
      content.slice(0, startIndex).trim(),
      content.slice(endIndex).trim(),
    ].filter(Boolean).join('\n\n').trim();
    const incomplete = closingToken !== '\n```' || !/<\/html>\s*$/i.test(html);

    if (!bestMatch || score > bestMatch.score || (score === bestMatch.score && html.length > bestMatch.html.length)) {
      bestMatch = {
        html,
        cleanText,
        score,
        incomplete,
      };
    }
  }

  if (!bestMatch) return null;

  return {
    preview: {
      type: 'html',
      title: extractHtmlTitleFromDocument(bestMatch.html)
        ?? clampText(report?.summary, 200)
        ?? 'Recovered preview',
      html: bestMatch.html,
    },
    cleanText: bestMatch.cleanText,
    incomplete: bestMatch.incomplete,
  };
}

function recoverHtmlPreviewFromLooseContent(
  content: string,
  report?: CodingReport | null,
): { preview: CodingReportPreview; cleanText: string; incomplete: boolean } | null {
  const normalized = content.replace(/\r\n/g, '\n');
  const starts = [...normalized.matchAll(/<!doctype\s+html|<html[\s>]/gi)]
    .map((match) => match.index)
    .filter((index): index is number => typeof index === 'number');
  if (starts.length === 0) return null;

  let bestMatch: { html: string; cleanText: string; incomplete: boolean; score: number } | null = null;

  for (let i = 0; i < starts.length; i += 1) {
    const startIndex = starts[i];
    const nextStartIndex = starts[i + 1] ?? normalized.length;
    const candidateTail = sanitizeRecoveredHtmlPreview(normalized.slice(startIndex, nextStartIndex));
    if (!looksLikeHtmlPreviewPayload(candidateTail)) continue;

    const closeMatch = [...candidateTail.matchAll(/<\/html>/gi)].pop();
    const htmlEnd = closeMatch && closeMatch.index != null
      ? closeMatch.index + closeMatch[0].length
      : candidateTail.length;
    const html = candidateTail.slice(0, htmlEnd).trim();
    if (!html) continue;

    const before = normalized.slice(0, startIndex).trim();
    const after = stripContinuationNarration(
      normalized.slice(startIndex + htmlEnd),
    ).trim();
    const cleanText = [before, after].filter(Boolean).join('\n\n').trim();
    const incomplete = !/<\/html>\s*$/i.test(html);
    const score = (incomplete ? 0 : 10) + html.length;

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { html, cleanText, incomplete, score };
    }
  }

  if (!bestMatch) return null;

  return {
    preview: {
      type: 'html',
      title: extractHtmlTitleFromDocument(bestMatch.html)
        ?? clampText(report?.summary, 200)
        ?? 'Recovered preview',
      html: bestMatch.html,
    },
    cleanText: bestMatch.cleanText,
    incomplete: bestMatch.incomplete,
  };
}

function looksLikeHtmlPreviewPayload(content: string): boolean {
  return /```html|<!doctype html|<html[\s>]|<body[\s>]|<head[\s>]/i.test(content);
}

function extractBestHtmlDocument(content: string): string {
  const normalized = sanitizeRecoveredHtmlPreview(content).replace(/\r\n/g, '\n').trim();
  const starts = [...normalized.matchAll(/<!doctype\s+html|<html[\s>]/gi)]
    .map((match) => match.index)
    .filter((index): index is number => typeof index === 'number');
  if (starts.length === 0) return normalized;

  let bestHtml = normalized;
  let bestScore = -1;

  for (let i = 0; i < starts.length; i += 1) {
    const startIndex = starts[i];
    const nextStartIndex = starts[i + 1] ?? normalized.length;
    const candidateTail = normalized.slice(startIndex, nextStartIndex).trim();
    if (!candidateTail) continue;

    const closeMatch = [...candidateTail.matchAll(/<\/html>/gi)].pop();
    const html = (
      closeMatch && closeMatch.index != null
        ? candidateTail.slice(0, closeMatch.index + closeMatch[0].length)
        : candidateTail
    ).trim();
    if (!html) continue;

    const score = (/<\/html>\s*$/i.test(html) ? 10 : 0) + html.length;
    if (score > bestScore) {
      bestScore = score;
      bestHtml = html;
    }
  }

  return bestHtml;
}

function isRecoveredPreviewIncomplete(content: string, report?: CodingReport | null): boolean {
  if (report?.preview?.type === 'html' && report.preview.html) {
    const html = report.preview.html.trim();
    return !/<\/html>\s*$/i.test(html);
  }

  const recovered = recoverHtmlPreviewFromMarkdown(content, report);
  return recovered?.incomplete ?? false;
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

  const html = clampText(sanitizeRecoveredHtmlPreview(String(preview.html ?? '')), 50_000);
  const normalizedHtml = html ? clampText(extractBestHtmlDocument(html), 50_000) : undefined;
  if (!normalizedHtml) return null;
  return {
    type,
    title: clampText(preview.title, 200),
    html: normalizedHtml,
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
    project: normalizeProject(report.project) ?? null,
    preview: normalizePreview(report.preview) ?? null,
    landing_artifact: normalizeLandingArtifactState(report.landing_artifact) ?? null,
  };

  if (
    !normalized.summary
    && !normalized.worklog
    && !normalized.changed_files
    && !normalized.how_to_run
    && !normalized.notes
    && !normalized.project
    && !normalized.preview
    && !normalized.landing_artifact
  ) {
    return null;
  }

  return normalized;
}

function sanitizeProjectFilePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').trim();
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0')) {
    throw new AppError(400, 'PROJECT_FILE_INVALID', 'Некорректный путь файла проекта');
  }

  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === '.' || part === '..')) {
    throw new AppError(400, 'PROJECT_FILE_INVALID', 'Некорректный путь файла проекта');
  }

  return parts.join('/');
}

function pickProjectEntrypoint(project: CodingReportProject): string | null {
  const fromProject = project.entrypoint?.trim();
  if (fromProject) return sanitizeProjectFilePath(fromProject);

  const explicit = project.files.find((file) => file.entrypoint)?.path;
  if (explicit) return sanitizeProjectFilePath(explicit);

  const candidates = project.runtime === 'python'
    ? ['main.py', 'app.py', 'server.py']
    : ['server.js', 'app.js', 'index.js', 'main.js'];

  for (const candidate of candidates) {
    const match = project.files.find((file) => sanitizeProjectFilePath(file.path) === candidate);
    if (match) return candidate;
  }

  return null;
}

function detectProjectCommand(project: CodingReportProject): { command: string; args: string[]; entrypoint: string | null } {
  if (project.runtime === 'static' || project.runtime === 'generic') {
    throw new AppError(400, 'PROJECT_RUNTIME_UNSUPPORTED', 'Server-side запуск пока поддерживает только Node.js и Python');
  }

  const entrypoint = pickProjectEntrypoint(project);
  if (!entrypoint) {
    throw new AppError(400, 'PROJECT_ENTRYPOINT_REQUIRED', 'Для server-side запуска нужен entrypoint проекта');
  }

  if (project.runtime === 'python') {
    return { command: 'python3', args: [entrypoint], entrypoint };
  }

  return { command: 'node', args: [entrypoint], entrypoint };
}

function trimProcessOutput(value: string): string {
  if (value.length <= PROJECT_MAX_OUTPUT_CHARS) {
    return value;
  }

  return `${value.slice(0, PROJECT_MAX_OUTPUT_CHARS)}\n...[truncated]`;
}

async function reserveTcpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        if (!port) {
          reject(new Error('Failed to reserve TCP port'));
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForHttpVerification(port: number, timeoutMs: number): Promise<ProjectRunVerification | null> {
  const deadline = Date.now() + timeoutMs;
  const candidates = ['/api/health', '/health', '/'];

  while (Date.now() < deadline) {
    for (const pathname of candidates) {
      const url = `http://127.0.0.1:${port}${pathname}`;
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(800),
          redirect: 'manual',
        });
        if (response.status >= 200 && response.status < 500) {
          return {
            kind: 'http',
            ok: response.ok || response.status < 400,
            message: `HTTP endpoint responded with ${response.status}`,
            url,
            http_status: response.status,
          };
        }
      } catch {
        // Continue polling until timeout.
      }
    }

    await new Promise((resolve) => setTimeout(resolve, PROJECT_HTTP_PROBE_INTERVAL_MS));
  }

  return null;
}

async function stopChildProcess(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.killed || child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (child.exitCode === null) {
    child.kill('SIGKILL');
  }
}

async function materializeProjectFiles(project: CodingReportProject, workspaceDir: string): Promise<void> {
  for (const file of project.files) {
    const relativePath = sanitizeProjectFilePath(file.path);
    const targetPath = path.join(workspaceDir, relativePath);
    const relativeFromRoot = path.relative(workspaceDir, targetPath);
    if (relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)) {
      throw new AppError(400, 'PROJECT_FILE_INVALID', 'Некорректный путь файла проекта');
    }

    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, file.content, 'utf8');
  }
}

interface ProjectRunOptions {
  env?: Record<string, string>;
}

function sanitizeProjectRunEnvValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\r\n/g, '\n');
  return normalized.length <= 4000 ? normalized : normalized.slice(0, 4000);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeProjectRunEnv(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const normalized: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const envKey = key.trim().toUpperCase();
    if (!/^[A-Z_][A-Z0-9_]{0,63}$/.test(envKey)) continue;
    const envValue = sanitizeProjectRunEnvValue(rawValue);
    if (envValue == null) continue;
    normalized[envKey] = envValue;
    if (Object.keys(normalized).length >= 32) break;
  }

  return normalized;
}

function buildProjectRunWebhookUrl(publicToken: string): string {
  return new URL(`/api/project-deployments/${publicToken}/webhook`, env.BACKEND_URL).toString();
}

function buildProjectRunAgentRunUrl(publicToken: string): string {
  return new URL(`/api/project-deployments/${publicToken}/agent-run`, env.BACKEND_URL).toString();
}

async function getChatProjectDeploymentRunEnv(
  chatId: string,
  messageId: string,
  userId: string,
): Promise<Record<string, string>> {
  const [deployment] = await db
    .select({
      id: chatProjectDeployments.id,
      public_token: chatProjectDeployments.public_token,
      deployment_secret: chatProjectDeployments.deployment_secret,
      linked_agent_id: chatProjectDeployments.linked_agent_id,
      env_json: chatProjectDeployments.env_json,
    })
    .from(chatProjectDeployments)
    .where(and(
      eq(chatProjectDeployments.conversation_id, chatId),
      eq(chatProjectDeployments.message_id, messageId),
      eq(chatProjectDeployments.user_id, userId),
    ))
    .orderBy(desc(chatProjectDeployments.updated_at))
    .limit(1);

  if (!deployment) {
    return {};
  }

  return {
    PUBLIC_WEBHOOK_URL: buildProjectRunWebhookUrl(deployment.public_token),
    LLMSTORE_BACKEND_URL: env.BACKEND_URL,
    LLMSTORE_DEPLOYMENT_ID: deployment.id,
    LLMSTORE_DEPLOYMENT_TOKEN: deployment.public_token,
    LLMSTORE_DEPLOYMENT_SECRET: deployment.deployment_secret,
    LLMSTORE_LINKED_AGENT_ID: deployment.linked_agent_id ?? '',
    LLMSTORE_AGENT_RUN_URL: deployment.linked_agent_id ? buildProjectRunAgentRunUrl(deployment.public_token) : '',
    ...normalizeProjectRunEnv(deployment.env_json),
  };
}

async function runProjectBundle(project: CodingReportProject, options: ProjectRunOptions = {}): Promise<ProjectRunResult> {
  const workspaceDir = await mkdtemp(path.join(tmpdir(), 'llmstore-run-'));
  const startedAt = Date.now();

  try {
    await materializeProjectFiles(project, workspaceDir);
    const { command, args, entrypoint } = detectProjectCommand(project);
    const port = await reserveTcpPort();

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn(command, args, {
      cwd: workspaceDir,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH ?? '',
        HOME: workspaceDir,
        TMPDIR: workspaceDir,
        TEMP: workspaceDir,
        TMP: workspaceDir,
        PORT: String(port),
        HOST: '127.0.0.1',
        NODE_ENV: 'production',
        PYTHONUNBUFFERED: '1',
        ...options.env,
      },
    });

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout = trimProcessOutput(`${stdout}${chunk}`);
    });
    child.stderr?.on('data', (chunk: string) => {
      stderr = trimProcessOutput(`${stderr}${chunk}`);
    });

    const exitPromise = new Promise<{ exitCode: number | null; signal: string | null }>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (exitCode, signal) => resolve({ exitCode, signal }));
    });

    const timeoutPromise = new Promise<{ kind: 'timeout' }>((resolve) => {
      setTimeout(() => resolve({ kind: 'timeout' }), PROJECT_RUN_TIMEOUT_MS);
    });

    const httpPromise: Promise<{ kind: 'http'; verification: ProjectRunVerification }> = waitForHttpVerification(
      port,
      PROJECT_HTTP_READY_TIMEOUT_MS,
    ).then((verification) => {
      if (verification) {
        return { kind: 'http' as const, verification };
      }

      return new Promise<never>(() => undefined);
    });

    const first = await Promise.race([
      exitPromise.then((result) => ({ kind: 'exit' as const, ...result })),
      timeoutPromise,
      httpPromise,
    ]);

    let verification: ProjectRunVerification = {
      kind: 'none',
      ok: false,
      message: 'Запуск не был подтверждён',
    };
    let status: ProjectRunResult['status'] = 'failed';
    let exitCode: number | null = null;
    let signal: string | null = null;

    if (first && first.kind === 'http') {
      verification = first.verification;
      status = verification.ok ? 'passed' : 'failed';
      await stopChildProcess(child);
      const exitResult = await exitPromise.catch(() => ({ exitCode: null, signal: 'SIGTERM' }));
      exitCode = exitResult.exitCode;
      signal = exitResult.signal;
    } else if (first && first.kind === 'exit') {
      exitCode = first.exitCode;
      signal = first.signal;
      verification = {
        kind: 'process_exit',
        ok: first.exitCode === 0,
        message: first.exitCode === 0 ? 'Процесс завершился с кодом 0' : `Процесс завершился с кодом ${first.exitCode ?? 'null'}`,
      };
      status = first.exitCode === 0 ? 'passed' : 'failed';
    } else {
      timedOut = true;
      verification = {
        kind: 'none',
        ok: false,
        message: 'Превышен таймаут выполнения',
      };
      status = 'timeout';
      await stopChildProcess(child);
      const exitResult = await exitPromise.catch(() => ({ exitCode: null, signal: 'SIGKILL' }));
      exitCode = exitResult.exitCode;
      signal = exitResult.signal;
    }

    if (!timedOut && status === 'passed' && verification.kind === 'process_exit' && project.runtime === 'node') {
      verification.message = 'Node.js проект успешно выполнился';
    }

    return {
      runtime: project.runtime,
      status,
      project_run_count: null,
      command: [command, ...args],
      entrypoint,
      duration_ms: Date.now() - startedAt,
      exit_code: exitCode,
      signal,
      stdout,
      stderr,
      verification,
    };
  } finally {
    await rm(workspaceDir, { recursive: true, force: true }).catch(() => undefined);
  }
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

function decodePseudoAssignmentValue(raw: string, quote: '"' | '\'' | '`'): string {
  if (quote === '`') {
    return raw;
  }

  const normalized = raw
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t');

  try {
    if (quote === '"') {
      return JSON.parse(`"${raw}"`);
    }

    const jsonCompatible = normalized
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
    return JSON.parse(`"${jsonCompatible}"`);
  } catch {
    return normalized
      .replace(/\\"/g, '"')
      .replace(/\\'/g, '\'')
      .replace(/\\\\/g, '\\');
  }
}

function extractPseudoAssignment(content: string, path: string): string | null {
  const marker = `${path} =`;
  const markerIndex = content.indexOf(marker);
  if (markerIndex === -1) return null;

  let index = markerIndex + marker.length;
  while (index < content.length && /\s/.test(content[index] ?? '')) {
    index += 1;
  }

  const quote = content[index];
  if (quote !== '"' && quote !== '\'' && quote !== '`') return null;
  index += 1;

  let value = '';
  let escaped = false;
  for (; index < content.length; index += 1) {
    const char = content[index]!;

    if (quote !== '`' && escaped) {
      value += char;
      escaped = false;
      continue;
    }

    if (quote !== '`' && char === '\\') {
      value += char;
      escaped = true;
      continue;
    }

    if (char === quote) {
      return decodePseudoAssignmentValue(value, quote);
    }

    value += char;
  }

  return null;
}

function extractPseudoCodingReport(content: string): CodingReport | null {
  const summary = extractPseudoAssignment(content, 'coding_report.summary');
  const previewTitle = extractPseudoAssignment(content, 'coding_report.preview.title');
  const previewHtml = extractPseudoAssignment(content, 'coding_report.preview.html');

  if (!summary && !previewTitle && !previewHtml) {
    return null;
  }

  return sanitizeCodingReport({
    summary: summary ?? undefined,
    preview: previewHtml
      ? {
        type: 'html',
        title: previewTitle ?? 'Generated landing',
        html: previewHtml,
      }
      : undefined,
  });
}

function extractCodingReport(content: string): { cleanText: string; report: CodingReport | null } {
  const openMatch = content.match(/<dev-report>\s*/i);
  if (!openMatch || openMatch.index == null) {
    return {
      cleanText: content.trim(),
      report: extractPseudoCodingReport(content),
    };
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
  let cleanText = [before, after].filter(Boolean).join('\n\n').trim();

  // If a dev-report block was truncated and we failed to recover valid JSON,
  // do not discard the whole assistant response. Preserve the raw content so
  // the user still receives the partial result instead of an empty message.
  if (!cleanText && !report) {
    cleanText = extractPartialCodingSummary(content)
      ?? content
      .replace(/<dev-report>\s*/i, '')
      .replace(/\s*<\/dev-report>/i, '')
      .trim();
  }

  return { cleanText, report };
}

function normalizeAssistantChatPayload(
  content: string,
  usage: Record<string, unknown> | null,
): { content: string; usage: Record<string, unknown> | null; codingReport: CodingReport | null } {
  const parsed = extractCodingReport(content);
  const usageCodingReport = sanitizeCodingReport(usage?.coding_report);
  let codingReport = parsed.report ?? usageCodingReport;
  let normalizedContent = parsed.cleanText || codingReport?.summary || '';
  const currentPreviewHtml = codingReport?.preview?.type === 'html'
    ? (codingReport.preview.html ?? '').trim()
    : '';
  const hasUsablePreview = Boolean(
    currentPreviewHtml
    && /<(?:!doctype\s+html|html|body|section|div|main|style|script)\b/i.test(currentPreviewHtml)
    && currentPreviewHtml.toLowerCase() !== 'see full html below',
  );
  const recoveredProject = codingReport?.project
    ? null
    : recoverProjectBundleFromMarkdown(parsed.cleanText || content, codingReport);
  const recoveredPreview = hasUsablePreview
    ? null
    : (
      recoverHtmlPreviewFromMarkdown(parsed.cleanText || content, codingReport)
      ?? recoverHtmlPreviewFromLooseContent(parsed.cleanText || content, codingReport)
    );

  if (recoveredProject) {
    codingReport = {
      ...(codingReport ?? {}),
      project: recoveredProject,
      notes: [
        ...(codingReport?.notes ?? []),
        'Runnable bundle распознан из markdown-ответа и доступен для экспорта/запуска.',
      ].slice(0, 12),
    };
  }

  if (recoveredPreview) {
    codingReport = {
      ...(codingReport ?? {}),
      preview: recoveredPreview.preview,
      notes: [
        ...(codingReport?.notes ?? []),
        recoveredPreview.incomplete
          ? 'HTML preview автоматически восстановлен из markdown-ответа, но выглядит незавершённым: возможно, ответ был обрезан по длине.'
          : 'HTML preview автоматически восстановлен из markdown-ответа агента.',
      ].slice(0, 12),
    };

    if (recoveredPreview.cleanText && !isDiscardablePreviewWrapperText(recoveredPreview.cleanText)) {
      normalizedContent = recoveredPreview.cleanText;
    } else if (codingReport.summary?.trim()) {
      normalizedContent = codingReport.summary.trim();
    } else if (recoveredPreview.preview.title?.trim()) {
      normalizedContent = `Preview подготовлен: ${recoveredPreview.preview.title.trim()}.`;
    } else {
      normalizedContent = recoveredPreview.incomplete
        ? 'Лендинг частично восстановлен из markdown-ответа. Preview доступен, но HTML выглядит незавершённым.'
        : 'Preview автоматически восстановлен из markdown-ответа агента.';
    }
  }

  return {
    content: normalizedContent,
    usage: codingReport
      ? {
        ...(usage ?? {}),
        coding_report: codingReport,
      }
      : usage,
    codingReport,
  };
}

function isUsableHtmlPreviewText(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const html = value.trim();
  return html.length >= 80 && /<(?:html|body|section|main|style|script|div)\b/i.test(html);
}

function isDiscardablePreviewWrapperText(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || !trimmed.startsWith('{')) return false;

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const keys = Object.keys(parsed);
    if (keys.length === 0) return true;
    if (keys.some((key) => !['preview', 'coding_report'].includes(key))) return false;

    const preview = parsed.preview && typeof parsed.preview === 'object'
      ? parsed.preview as Record<string, unknown>
      : (
        parsed.coding_report && typeof parsed.coding_report === 'object'
          ? (parsed.coding_report as Record<string, unknown>).preview
          : null
      );
    if (!preview || typeof preview !== 'object') return false;

    const previewRecord = preview as Record<string, unknown>;
    return !isUsableHtmlPreviewText(previewRecord.html);
  } catch {
    return false;
  }
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

function ensurePreviewFavicon(html: string): string {
  const hasCustomFavicon = /<link\b[^>]*\brel\s*=\s*["'][^"']*\b(?:shortcut\s+icon|icon|apple-touch-icon|apple-touch-icon-precomposed|mask-icon)\b[^"']*["'][^>]*>/i.test(html);
  if (hasCustomFavicon) {
    return html;
  }

  const faviconMarkup = `
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="shortcut icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">`;

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${faviconMarkup}\n</head>`);
  }

  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${faviconMarkup}</head>`);
  }

  return `<head>${faviconMarkup}</head>${html}`;
}

function injectPreviewBridgeHtml(html: string, previewId?: string): string {
  const htmlWithFavicon = ensurePreviewFavicon(html);
  const resolvedPreviewId = previewId ?? 'standalone-preview';
  const emojiAssetVersion = '20260401b';
  const imageFallbackSrc = buildPreviewImagePlaceholderDataUrl('Image unavailable');
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
  const previewId = ${JSON.stringify(resolvedPreviewId)};
  const emojiRegex = /\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?/gu;
  const previewOrigin = typeof window.__LLMSTORE_PREVIEW_ORIGIN__ === 'string' && window.__LLMSTORE_PREVIEW_ORIGIN__
    ? window.__LLMSTORE_PREVIEW_ORIGIN__
    : window.location.origin;
  const imageFallbackSrc = ${JSON.stringify(imageFallbackSrc)};
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

  const bindImageFallbacks = (root = document) => {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const images = root.querySelectorAll('img');
    for (const img of images) {
      if (!(img instanceof HTMLImageElement)) continue;
      if (img.dataset.llmstoreImgFallbackBound === '1') continue;
      img.dataset.llmstoreImgFallbackBound = '1';
      const applyFallback = () => {
        if (!img.src || img.src === imageFallbackSrc) return;
        img.src = imageFallbackSrc;
        if (!img.alt) {
          img.alt = 'Image unavailable';
        }
      };
      img.addEventListener('error', applyFallback, { once: true });
      if (img.complete && img.naturalWidth === 0 && img.src) {
        applyFallback();
      }
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
    bindImageFallbacks();
    sendState();
  });
  window.addEventListener('DOMContentLoaded', () => {
    applyEmojiFallback();
    bindImageFallbacks();
  });
  window.addEventListener('hashchange', sendState);
  window.addEventListener('popstate', sendState);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) applyEmojiFallback(node);
        if (node instanceof HTMLElement) bindImageFallbacks(node);
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
  bindImageFallbacks();
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

function buildPreviewImagePlaceholderDataUrl(label = 'Preview'): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
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
        ${escapeHtmlText(label)}
      </text>
    </svg>`,
  )}`;
}

function sanitizePreviewAssetUrls(html: string): string {
  const placeholderSvg = buildPreviewImagePlaceholderDataUrl('Preview');
  const suspiciousAbsoluteAssetPattern = /https?:\/\/(?:(?:via\.placeholder\.com|placehold\.co)\/[^"')\s]+|example\.com\/[^"')\s]+)/gi;
  const suspiciousRelativeImagePattern = /^(\.\/|\.\.\/)?[^:/?#][^"')]*\.(?:png|jpe?g|gif|svg|webp|avif)(?:[?#][^"')]*)?$/i;
  const allowedImageSrcPattern = /^(?:https?:|data:|blob:|\/)/i;

  const replaceSrcsetValue = (value: string) => value
    .split(',')
    .map((entry) => {
      const trimmed = entry.trim();
      if (!trimmed) return trimmed;
      const [candidate, descriptor] = trimmed.split(/\s+/, 2);
      if (
        suspiciousAbsoluteAssetPattern.test(candidate)
        || suspiciousRelativeImagePattern.test(candidate)
      ) {
        suspiciousAbsoluteAssetPattern.lastIndex = 0;
        return descriptor ? `${placeholderSvg} ${descriptor}` : placeholderSvg;
      }
      suspiciousAbsoluteAssetPattern.lastIndex = 0;
      return trimmed;
    })
    .join(', ');

  let nextHtml = html.replace(suspiciousAbsoluteAssetPattern, placeholderSvg);

  nextHtml = nextHtml.replace(
    /(<(?:img|source)\b[^>]*\b(?:src|poster)\s*=\s*["'])([^"']+)(["'])/gi,
    (match, prefix: string, rawValue: string, suffix: string) => {
      const value = rawValue.trim();
      if (!value) return match;
      if (allowedImageSrcPattern.test(value)) return match;
      if (!suspiciousRelativeImagePattern.test(value)) return match;
      return `${prefix}${placeholderSvg}${suffix}`;
    },
  );

  nextHtml = nextHtml.replace(
    /(<source\b[^>]*\bsrcset\s*=\s*["'])([^"']+)(["'])/gi,
    (_match, prefix: string, rawValue: string, suffix: string) => `${prefix}${replaceSrcsetValue(rawValue)}${suffix}`,
  );

  nextHtml = nextHtml.replace(
    /url\(\s*(["']?)([^)"']+)\1\s*\)/gi,
    (match, _quote: string, rawValue: string) => {
      const value = rawValue.trim();
      if (!value) return match;
      if (/^(?:data:|blob:|\/)/i.test(value)) return match;
      if (/^https?:/i.test(value)) {
        return suspiciousAbsoluteAssetPattern.test(value)
          ? `url("${placeholderSvg}")`
          : match;
      }
      suspiciousAbsoluteAssetPattern.lastIndex = 0;
      return suspiciousRelativeImagePattern.test(value)
        ? `url("${placeholderSvg}")`
        : match;
    },
  );

  return nextHtml;
}

function sanitizeGalleryPreviewHtml(html: string): string {
  return sanitizePreviewAssetUrls(html);
}

function injectGalleryPreviewStyles(html: string): string {
  const galleryStyles = `
<style id="llmstore-gallery-preview-mode">
html, body {
  overflow-x: hidden !important;
  overflow-y: auto !important;
}
body {
  pointer-events: auto !important;
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
  const repairedHtml = sanitizePreviewAssetUrls(repairSectionalPreviewHtml(html));
  const nextHtml = options?.galleryMode
    ? injectGalleryPreviewStyles(sanitizeGalleryPreviewHtml(repairedHtml))
    : repairedHtml;
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
  const chargeUsage = options.charge_usage ?? true;
  const billingUserRole = options.user_role ?? 'user';
  const emitEvent = options.on_event ?? (() => undefined);
  const latestUserMessage = [...input.messages]
    .reverse()
    .find((msg) => msg.role === 'user' && msg.content.trim().length > 0)
    ?.content
    .trim() ?? '';
  const landingDetectionEnabled = options.disable_landing_detection !== true;

  // 1. Load agent + version + tools
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agent) throw new NotFoundError('Ресурс не найден');

  if (!agent.current_version_id) {
    throw new AppError(400, 'NO_VERSION', 'У агента нет активной версии');
  }

  const [version] = await db.select().from(agentVersions).where(eq(agentVersions.id, agent.current_version_id)).limit(1);
  if (!version) throw new NotFoundError('Ресурс не найден');

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
  let tools = versionToolRows.map(r => r.tool);

  // 2. Parse runtime config
  const runtimeConfig = (version.runtime_config || {}) as {
    max_iterations?: number;
    temperature?: number;
    max_tokens?: number;
    model_external_id?: string;
    chat_intro?: string;
  };
  const strictPreviewEdit = options.strict_preview_edit ?? null;
  let modelId = normalizeOpenRouterModelId(
    input.model_external_id ?? runtimeConfig.model_external_id ?? DEFAULT_MODEL,
  );
  const maxIterations = runtimeConfig.max_iterations ?? DEFAULT_MAX_ITERATIONS;
  const effectiveTemperature = strictPreviewEdit
    ? Math.min(runtimeConfig.temperature ?? 0.3, 0.05)
    : (runtimeConfig.temperature ?? 0.3);
  let syncedConversationId: string | null = null;

  if (syncToChats) {
    if (options.sync_conversation_id) {
      const existingConversation = await getConversationForUser(options.sync_conversation_id, userId);
      syncedConversationId = existingConversation.id;
    } else {
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
          title: (options.sync_chat_title?.trim() || latestUserMessage || 'Новый чат').slice(0, 500),
          model_external_id: modelId,
          last_message_at: new Date(),
        }).returning({ id: chatConversations.id });
        syncedConversationId = createdConversation.id;
      }
    }

    if (latestUserMessage && !options.skip_sync_user_message) {
      await db.insert(chatConversationMessages).values({
        conversation_id: syncedConversationId,
        role: 'user',
        content_text: latestUserMessage,
      });
    }

    const autoRunTools = await getActiveToolDefinitionRowsBySlugs(AUTO_RUN_CHAT_TOOL_SLUGS);
    if (autoRunTools.length > 0) {
      const toolsById = new Map(tools.map((tool) => [tool.id, tool]));
      for (const tool of autoRunTools) {
        if (!toolsById.has(tool.id)) {
          toolsById.set(tool.id, tool);
        }
      }
      tools = [...toolsById.values()];
    }
  }

  // 4. Create run record
  const traceId = uuidv4();
  const [run] = await db.insert(agentRuns).values({
    agent_id: agentId,
    agent_version_id: version.id,
    user_id: userId,
    deployment_id: options.deployment_id ?? null,
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
  const previewOnlyLandingRequest = landingDetectionEnabled && looksLikeLandingPreviewOnlyRequest(latestUserMessage) && !strictPreviewEdit;
  const landingReferenceContext = previewOnlyLandingRequest
    ? await buildLandingReferenceContextFromUrls(latestUserMessage)
    : null;
  if (typeof version.system_prompt === 'string' && version.system_prompt.trim().length > 0) {
    systemParts.push(version.system_prompt.trim());
  }
  if (typeof runtimeConfig.chat_intro === 'string' && runtimeConfig.chat_intro.trim().length > 0) {
    systemParts.push(`Описание агента для чата:
${runtimeConfig.chat_intro.trim()}`);
  }
  if (typeof agent.description === 'string' && agent.description.trim().length > 0) {
    systemParts.push(`Краткое описание агента:
${agent.description.trim()}`);
  }
  if (landingDetectionEnabled && looksLikeLandingBuildRequest(latestUserMessage) && !strictPreviewEdit) {
    systemParts.push(buildLandingResponseDisciplineInstruction(latestUserMessage));
  }
  if (landingReferenceContext) {
    systemParts.push(`Контекст по ссылкам из запроса пользователя:\n${landingReferenceContext}`);
  }
  if (strictPreviewEdit) {
    systemParts.push(buildStrictPreviewEditInstruction(strictPreviewEdit));
  }
  if (tools.some((tool) => tool.slug === CREATE_CHAT_FILES_TOOL_SLUG)) {
    systemParts.push([
      'File artifact instruction.',
      `When the user asks you to prepare a downloadable file, call ${CREATE_CHAT_FILES_TOOL_SLUG}.`,
      'Use the tool for reports, spreadsheets, XLSX, XLS, markdown, CSV, JSON, HTML, code files, exports, datasets, and similar artifacts.',
      'For .xlsx/.xls files, pass table data in content as CSV, an HTML table, a markdown table, a JSON array of objects, or JSON rows; the tool will convert it to an Excel workbook.',
      `Never call ${CREATE_CHAT_FILES_TOOL_SLUG} with empty arguments. The files array is required, and every generated file must include content or content_base64.`,
      'If the user asks for a file but omits details, choose a sensible default format and fields instead of asking follow-up questions.',
      'After the tool succeeds, mention the created files briefly; the chat UI will show download cards automatically.',
    ].join('\n'));
  }
  systemParts.push(buildModelEnvironmentContext());
  if (systemParts.length > 0) {
    messages.push({ role: 'system', content: systemParts.join('\n\n') });
  }
  for (const msg of input.messages) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // 6. Build tools array
  const toolsDisabledForFocusedPreviewEdit = previewOnlyLandingRequest || Boolean(strictPreviewEdit);
  const effectiveTools = toolsDisabledForFocusedPreviewEdit ? [] : tools;
  const toolParams: ToolDefinitionParam[] = effectiveTools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.slug,
      description: t.description || t.name,
      parameters: t.input_schema,
    },
  }));
  let llmTimeoutMs = resolveAgentOpenRouterTimeoutMs(modelId, toolParams.length);
  let providerPreferences = resolveOpenRouterProviderPreferences(
    modelId,
    toolParams.length,
    previewOnlyLandingRequest,
  );
  let reasoningConfig = resolveOpenRouterReasoningConfig(modelId);
  const landingBuildRequest = landingDetectionEnabled && looksLikeLandingBuildRequest(latestUserMessage) && !strictPreviewEdit;
  let responseMaxTokens = resolveAgentResponseMaxTokens(
    runtimeConfig.max_tokens,
    modelId,
    toolParams.length,
    landingBuildRequest,
  );
  const attemptedRuntimeModelIds = new Set<string>([modelId]);

  logger.info({
    runId: run.id,
    agentId,
    toolCount: toolParams.length,
    toolNames: effectiveTools.map(t => t.slug),
    previewOnlyLandingRequest,
    landingBuildRequest,
    hasLandingReferenceContext: Boolean(landingReferenceContext),
    toolsDisabledForFocusedPreviewEdit,
  }, 'Starting agent run');

  // 7. Update run to running
  await db.update(agentRuns).set({ status: 'running' }).where(eq(agentRuns.id, run.id));
  let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const usageBreakdown = new Map<string, {
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost_num: number;
    sources: Set<string>;
  }>();
  let usageEventRateCache: number | null = null;
  let chargedCostUsd = 0;
  let pricedProviderCostUsd = 0;
  let balanceAfterChargeUsd: string | null = null;
  let latestPricingQuote: ProfitabilityQuote | null = null;
  const chargeTransactionIds: string[] = [];
  const recordUsage = (
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number },
    usageModel: string,
    source: string,
  ) => {
    totalUsage.prompt_tokens += usage.prompt_tokens;
    totalUsage.completion_tokens += usage.completion_tokens;
    totalUsage.total_tokens += usage.total_tokens;
    accumulateUsageBreakdown(usageBreakdown, {
      model: usageModel,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      source,
    });
  };
  const getEstimatedCostTotal = () => (
    usageBreakdown.size > 0
      ? sumUsageBreakdownCost(usageBreakdown)
      : estimateCost(modelId, totalUsage.prompt_tokens, totalUsage.completion_tokens)
  );
  const getUsageBreakdownPayload = () => serializeUsageBreakdown(usageBreakdown);
  const getActualBillingPayload = () => ({
    charged_cost: chargedCostUsd > 0 ? chargedCostUsd.toFixed(4) : undefined,
    provider_cost: pricedProviderCostUsd > 0 ? pricedProviderCostUsd.toFixed(6) : undefined,
    pricing_margin_usd: chargedCostUsd > 0
      ? (chargedCostUsd - pricedProviderCostUsd).toFixed(6)
      : undefined,
    pricing_markup_multiplier: latestPricingQuote?.effective_markup_multiplier,
    pricing_policy_snapshot: latestPricingQuote?.policy_snapshot,
    balance_after_usd: balanceAfterChargeUsd ?? undefined,
    charge_transaction_ids: chargeTransactionIds.length > 0 ? [...chargeTransactionIds] : undefined,
  });
  const normalizeToolUsageEntries = (value: unknown) => {
    const rawItems = Array.isArray(value) ? value : (value ? [value] : []);
    return rawItems
      .filter((item) => item && typeof item === 'object')
      .map((item) => item as {
        model_external_id?: unknown;
        prompt_tokens?: unknown;
        completion_tokens?: unknown;
        total_tokens?: unknown;
      })
      .map((item) => ({
        model_external_id: typeof item.model_external_id === 'string' ? item.model_external_id.trim() : '',
        prompt_tokens: Number(item.prompt_tokens ?? 0),
        completion_tokens: Number(item.completion_tokens ?? 0),
        total_tokens: Number(item.total_tokens ?? 0),
      }))
      .filter((item) => item.model_external_id && Number.isFinite(item.prompt_tokens) && Number.isFinite(item.completion_tokens));
  };
  const getUsageEventPayload = async () => {
    const usdToRubRate = usageEventRateCache ?? await getUsdToRubRate();
    usageEventRateCache = usdToRubRate;
    return {
      prompt_tokens: totalUsage.prompt_tokens,
      completion_tokens: totalUsage.completion_tokens,
      total_tokens: totalUsage.total_tokens,
      estimated_cost: getEstimatedCostTotal(),
      ...getActualBillingPayload(),
      usd_to_rub_rate: usdToRubRate,
      by_model: getUsageBreakdownPayload(),
    };
  };
  const emitRunEvent = async (
    eventName: string,
    payload: Record<string, unknown>,
  ) => {
    emitEvent(eventName, {
      ...payload,
      ...(await getUsageEventPayload()),
    });
  };
  const refreshModelRuntimeSettings = () => {
    llmTimeoutMs = resolveAgentOpenRouterTimeoutMs(modelId, toolParams.length);
    providerPreferences = resolveOpenRouterProviderPreferences(
      modelId,
      toolParams.length,
      previewOnlyLandingRequest,
    );
    reasoningConfig = resolveOpenRouterReasoningConfig(modelId);
    responseMaxTokens = resolveAgentResponseMaxTokens(
      runtimeConfig.max_tokens,
      modelId,
      toolParams.length,
      landingBuildRequest,
    );
  };
  const requestRuntimeCompletion = async (
    params: Omit<ChatCompletionParams, 'model'>,
    source: string,
  ) => {
    const buildParams = (): ChatCompletionParams => ({
      ...params,
      model: modelId,
      max_tokens: params.max_tokens ?? responseMaxTokens,
      reasoning: params.reasoning ?? reasoningConfig,
      provider: params.provider ?? providerPreferences,
    });

    try {
      return await openRouterClient.chatCompletion(buildParams(), {
        timeoutMs: llmTimeoutMs,
      });
    } catch (error) {
      if (!shouldTryOpenRouterRuntimeFallback(error, modelId)) {
        throw error;
      }

      const fallbackModel = resolveOpenRouterRuntimeFallbackModel(modelId, attemptedRuntimeModelIds);
      if (!fallbackModel) {
        throw error;
      }

      const previousModelId = modelId;
      attemptedRuntimeModelIds.add(fallbackModel);
      modelId = fallbackModel;
      refreshModelRuntimeSettings();
      logger.warn({
        runId: run.id,
        source,
        previousModelId,
        fallbackModel,
        err: error,
      }, 'Retrying OpenRouter runtime request with fallback model');
      await emitRunEvent('chat.run.status', {
        run_id: run.id,
        status: 'model_fallback',
        label: 'Переключаю модель',
        detail: `Модель ${previousModelId} не ответила через OpenRouter, повторяю запрос через ${fallbackModel}.`,
        previous_model: previousModelId,
        model: fallbackModel,
      });

      return openRouterClient.chatCompletion(buildParams(), {
        timeoutMs: llmTimeoutMs,
      });
    }
  };
  const chargeAccumulatedUsage = async (force = false) => {
    if (!chargeUsage) return;

    const targetProviderCost = Number(getEstimatedCostTotal());
    if (!Number.isFinite(targetProviderCost) || targetProviderCost <= 0) return;

    const providerDeltaUsd = targetProviderCost - pricedProviderCostUsd;
    if (!force && providerDeltaUsd < 0.0001) return;

    const pricingQuote = await calculateCustomerChargeForUsage({
      provider_cost_usd: targetProviderCost,
      model_external_id: modelId,
      user_role: billingUserRole,
      user_id: userId,
    });
    latestPricingQuote = pricingQuote;
    pricedProviderCostUsd = targetProviderCost;

    const deltaUsd = pricingQuote.customer_charge_usd - chargedCostUsd;
    if (!Number.isFinite(deltaUsd) || deltaUsd <= 0) return;
    if (!force && deltaUsd < 0.0001) return;

    const chargeResult = await chargeUserBalanceForUsage({
      user_id: userId,
      amount_usd: deltaUsd,
      type: 'agent_run_usage',
      description: `Списание за запуск агента ${agent.name}`,
    });

    if (!chargeResult) return;

    const chargedDelta = Number(chargeResult.charged_amount_usd ?? 0);
    if (Number.isFinite(chargedDelta) && chargedDelta > 0) {
      chargedCostUsd += chargedDelta;
    }
    balanceAfterChargeUsd = chargeResult.balance_usd ?? balanceAfterChargeUsd;
    if (typeof chargeResult.transaction_id === 'string' && chargeResult.transaction_id) {
      chargeTransactionIds.push(chargeResult.transaction_id);
    }
  };

  await emitRunEvent('chat.run.started', {
    run_id: run.id,
    agent_id: agentId,
    model: modelId,
    max_iterations: maxIterations,
    detail: toolParams.length > 0
      ? `Подготовил задачу и подключил ${toolParams.length} инструмент(а/ов).`
      : 'Подготовил задачу и отправил её модели.',
  });
  await emitRunEvent('chat.run.status', {
    run_id: run.id,
    status: 'running',
    label: 'Агент начал выполнение задачи',
    detail: 'Сейчас сформирую план, затем при необходимости запущу инструменты.',
  });

  const toolTraces: ToolTrace[] = [];
  const pendingGeneratedFiles: GeneratedChatFileArtifact[] = [];
  let finalOutput = '';
  let codingReport: CodingReport | null = null;
  let runStatus: 'completed' | 'failed' = 'completed';
  let errorMessage: string | undefined;
  let gotTerminalAssistantMessage = false;
  let finalOutputWasTruncated = false;
  let partialAssistantMessageId: string | null = null;
  let rawTerminalAssistantOutput = '';

  const persistPartialAssistantOutput = async (
    rawOutput: string,
    options?: {
      markTruncated?: boolean;
      overrideContent?: string;
      overrideReport?: CodingReport | null;
    },
  ) => {
    if (!syncToChats || !syncedConversationId) return;
    if (!rawOutput.trim() && !options?.overrideContent?.trim()) return;

    let nextContent = rawOutput;
    let nextCodingReport: CodingReport | null = null;

    const parsed = extractCodingReport(rawOutput);
    nextContent = parsed.cleanText;
    nextCodingReport = parsed.report;

    if (options?.overrideReport) {
      nextCodingReport = sanitizeCodingReport({
        ...(nextCodingReport ?? {}),
        ...(options.overrideReport ?? {}),
      });
    }

    if (!nextContent && nextCodingReport?.summary) {
      nextContent = nextCodingReport.summary;
    }

    if (!nextContent) {
      nextContent = extractPartialCodingSummary(rawOutput) ?? rawOutput;
    }

    if (options?.overrideContent?.trim()) {
      nextContent = options.overrideContent.trim();
    }

    if (!nextContent.trim()) return;

    if (options?.markTruncated) {
      nextContent = `${nextContent.trim()}\n\n[Ответ всё ещё был обрезан по лимиту длины. Можно попросить продолжить или сузить задачу.]`;
    }

    const visibleToolTraces = getUserVisibleToolTraces(toolTraces);
    const usagePayload = totalUsage.total_tokens > 0
      ? {
        ...totalUsage,
        estimated_cost: getEstimatedCostTotal(),
        ...getActualBillingPayload(),
        model: modelId,
        usd_to_rub_rate: await getUsdToRubRate(),
        by_model: getUsageBreakdownPayload(),
        tool_traces: visibleToolTraces,
        coding_report: nextCodingReport,
      }
      : (
        visibleToolTraces.length > 0 || nextCodingReport
          ? {
            tool_traces: visibleToolTraces,
            coding_report: nextCodingReport,
          }
          : null
      );

    const nextLatencyMs = Date.now() - startTime;

    await db.update(agentRuns).set({
      final_output: nextContent,
      final_output_json: nextCodingReport as Record<string, unknown> | null,
      output_summary: nextContent.slice(0, 200) || null,
    }).where(eq(agentRuns.id, run.id));

    if (!partialAssistantMessageId) {
      const [inserted] = await db.insert(chatConversationMessages).values({
        conversation_id: syncedConversationId,
        role: 'assistant',
        content_text: nextContent,
        run_id: run.id,
        usage_json: usagePayload as Record<string, unknown> | null,
        latency_ms: nextLatencyMs,
      }).returning({ id: chatConversationMessages.id });

      partialAssistantMessageId = inserted?.id ?? null;
      return;
    }

    await db.update(chatConversationMessages).set({
      content_text: nextContent,
      usage_json: usagePayload as Record<string, unknown> | null,
      latency_ms: nextLatencyMs,
    }).where(eq(chatConversationMessages.id, partialAssistantMessageId));
  };

  const continueFinalAssistantOutput = async (
    currentOutput: string,
    continuationIndex: number,
  ): Promise<{ chunk: string; finishReason: ChatCompletionChoice['finish_reason'] }> => {
    await emitRunEvent('chat.run.status', {
      run_id: run.id,
      status: 'continuing_output',
      continuation_index: continuationIndex,
      continuation_max: MAX_FINAL_OUTPUT_CONTINUATIONS,
      label: `Ответ длинный, запрашиваю продолжение (${continuationIndex}/${MAX_FINAL_OUTPUT_CONTINUATIONS})`,
      detail: 'Пытаюсь аккуратно достроить длинный ответ вместо обрезанного результата.',
    });

    const continuationPrompt = currentOutput.includes('<dev-report>')
      ? 'Продолжай строго с места остановки. Не повторяй уже выведенный текст. Если <dev-report> ещё не закончен, сначала заверши JSON и закрой </dev-report>, затем продолжи оставшийся ответ.'
      : /```html|<!doctype html|<html[\s>]/i.test(currentOutput)
        ? 'Продолжай строго с места остановки внутри текущего HTML-файла. Не повторяй уже выведенный текст. Не пиши вступлений, пояснений, фраз вроде "продолжаю" и вообще никакого текста вне HTML. Верни только недостающий хвост HTML/CSS/JS. Сначала допиши HTML до закрывающих тегов </body> и </html>, затем закрой markdown fence ```.'
        : 'Продолжай строго с места остановки. Не повторяй уже выведенный текст и выведи только недостающую часть ответа.';

    const continuationResponse = await requestRuntimeCompletion({
      messages: [
        ...messages,
        { role: 'assistant', content: currentOutput },
        { role: 'user', content: continuationPrompt },
      ],
      temperature: effectiveTemperature,
    }, 'final_continuation');

    if (continuationResponse.usage) {
      recordUsage(continuationResponse.usage, continuationResponse.model || modelId, 'final_continuation');
      await chargeAccumulatedUsage();
    }

    const continuationChoice = requireFirstChoice(
      continuationResponse,
      'LLM returned no continuation choices',
    );

    const chunk = extractAssistantTextFromMessage(continuationChoice.message);
    logger.info({
      runId: run.id,
      continuationIndex,
      finishReason: continuationChoice.finish_reason,
      chunkLength: chunk.trim().length,
      responseMaxTokens,
    }, 'LLM continuation response received');
    await emitRunEvent('chat.run.status', {
      run_id: run.id,
      status: 'continuing_output',
      continuation_index: continuationIndex,
      continuation_max: MAX_FINAL_OUTPUT_CONTINUATIONS,
      label: continuationChoice.finish_reason === 'length'
        ? 'Продолжение получено, но ответ всё ещё упирается в лимит'
        : 'Продолжение получено, собираю финальный результат',
      detail: chunk.trim()
        ? `Получил дополнительный фрагмент ответа длиной ${chunk.trim().length} символов.`
        : 'Модель не вернула новый текст в продолжении.',
    });

    return {
      chunk,
      finishReason: continuationChoice.finish_reason,
    };
  };

  const attemptLandingPreviewRepair = async (
    currentOutput: string,
  ): Promise<{ content: string; codingReport: CodingReport } | null> => {
    if (!landingDetectionEnabled || !looksLikeLandingBuildRequest(latestUserMessage) || strictPreviewEdit) {
      return null;
    }

    const snippet = clampText(stripContinuationNarration(currentOutput), 18_000) ?? '';
    await emitRunEvent('chat.run.status', {
      run_id: run.id,
      status: 'preview_repair',
      label: 'Пытаюсь восстановить preview',
      detail: 'Модель не вернула валидный preview. Пробую переформатировать результат в корректный dev-report.',
    });

    const repairPrompt = [
      'Предыдущий ответ не дал валидный preview в ожидаемом формате.',
      'Нужно исправить формат и вернуть только корректный <dev-report>...</dev-report>.',
      'Не пиши markdown, пояснения и обычный текст после </dev-report>.',
      'Верни минимум такие поля:',
      '{',
      '  "summary": "..." ,',
      '  "preview": {',
      '    "type": "html",',
      '    "title": "Landing preview",',
      '    "html": "<!doctype html>..."',
      '  }',
      '}',
      'Если в предыдущем ответе был готовый HTML, используй его. Если готового HTML не было, собери полный standalone preview заново по исходному запросу.',
      'HTML должен быть завершённым документом с <!doctype html>, <html>, <head> и <body>.',
      `Исходный запрос пользователя: ${latestUserMessage}`,
      snippet ? `Предыдущий ответ модели:\n${snippet}` : undefined,
    ].filter(Boolean).join('\n\n');

    const response = await requestRuntimeCompletion({
      messages: [
        ...messages,
        { role: 'assistant', content: currentOutput },
        { role: 'user', content: repairPrompt },
      ],
      temperature: Math.min(effectiveTemperature, 0.1),
      max_tokens: Math.min(responseMaxTokens, 9_000),
    }, 'preview_repair');

    if (response.usage) {
      recordUsage(response.usage, response.model || modelId, 'preview_repair');
      await chargeAccumulatedUsage();
    }

    const choice = requireFirstChoice(
      response,
      'LLM returned no choices during landing preview repair',
    );
    const repairedRaw = extractAssistantTextFromMessage(choice.message);
    logger.info({
      runId: run.id,
      repairedLength: repairedRaw.trim().length,
    }, 'Landing preview repair response received');
    const repaired = normalizeAssistantChatPayload(repairedRaw, null);
    const repairedPreview = repaired.codingReport?.preview;
    if (!repairedPreview || repairedPreview.type !== 'html' || !repairedPreview.html?.trim()) {
      return null;
    }

    const repairedReport = sanitizeCodingReport({
      ...(repaired.codingReport ?? {}),
      notes: [
        ...(repaired.codingReport?.notes ?? []),
        'Preview автоматически восстановлен через repair-pass после невалидного финального ответа модели.',
      ].slice(0, 12),
    });

    if (!repairedReport) {
      return null;
    }

    return {
      content: repaired.content.trim() || repairedReport.summary?.trim() || currentOutput.trim(),
      codingReport: repairedReport,
    };
  };

  const executeAssistantToolCalls = async (
    assistantMessage: ChatMessage,
    iterationLabel: number | 'forced_file',
  ): Promise<number> => {
    const toolCalls = assistantMessage.tool_calls ?? [];
    if (toolCalls.length === 0) return 0;

    messages.push(assistantMessage);

    const detailLabel = iterationLabel === 'forced_file'
      ? 'Создание файла'
      : `Шаг ${iterationLabel}`;

    await db.update(agentRuns).set({ status: 'tool_executing' }).where(eq(agentRuns.id, run.id));
    await emitRunEvent('chat.run.status', {
      run_id: run.id,
      status: 'tool_executing',
      iteration: iterationLabel === 'forced_file' ? undefined : iterationLabel,
      label: `Запускаю инструменты: ${toolCalls.length}`,
    });

    for (const [toolIndex, toolCall] of toolCalls.entries()) {
      const toolSlug = toolCall.function.name;
      let toolInput: Record<string, unknown>;
      try {
        toolInput = JSON.parse(toolCall.function.arguments);
      } catch {
        toolInput = {};
      }

      const toolDef = tools.find(t => t.slug === toolSlug);
      const normalizedFileInput = toolSlug === CREATE_CHAT_FILES_TOOL_SLUG
        ? normalizeCreateChatFilesRuntimeInput(toolInput, {
          fallbackHtml: codingReport?.preview?.type === 'html' ? codingReport.preview.html : null,
          fallbackText: rawTerminalAssistantOutput || finalOutput,
        })
        : { input: toolInput, error: null, repaired: false };
      toolInput = normalizedFileInput.input;

      if (normalizedFileInput.error) {
        const errMsg = normalizedFileInput.error;
        messages.push({
          role: 'tool',
          content: JSON.stringify({
            error: errMsg,
            instruction: `Call ${CREATE_CHAT_FILES_TOOL_SLUG} again with non-empty content or content_base64 for every file.`,
          }),
          tool_call_id: toolCall.id,
        });
        toolTraces.push({
          tool_call_id: toolCall.id,
          tool_name: toolSlug,
          input: toolInput,
          output: null,
          status: 'error',
          duration_ms: 0,
          error: errMsg,
        });
        await emitRunEvent('chat.run.tool.finished', {
          run_id: run.id,
          tool_call_id: toolCall.id,
          tool_name: toolSlug,
          input: toolInput,
          output: { error: errMsg },
          status: 'error',
          duration_ms: 0,
          error: errMsg,
          label: `Инструмент ${toolSlug} отклонён до запуска`,
          detail: 'Файловый tool-call пришёл без содержимого файла, попросил модель пересобрать вызов с реальным content.',
        });
        continue;
      }

      const [tcRecord] = await db.insert(agentRunToolCalls).values({
        run_id: run.id,
        tool_definition_id: toolDef?.id ?? null,
        tool_call_id: toolCall.id,
        tool_name: toolSlug,
        tool_input: toolInput,
        status: 'running',
      }).returning();
      await emitRunEvent('chat.run.tool.started', {
        run_id: run.id,
        tool_call_id: toolCall.id,
        tool_name: toolSlug,
        input: toolInput,
        label: `Запущен инструмент ${toolSlug}`,
        detail: normalizedFileInput.repaired
          ? `${detailLabel}: ${toolIndex + 1} из ${toolCalls.length}. Пустой файловый payload восстановлен из уже собранного ответа.`
          : `${detailLabel}: ${toolIndex + 1} из ${toolCalls.length}`,
      });

      let trace: ToolTrace;
      try {
        const toolConfig = toolSlug === CREATE_CHAT_FILES_TOOL_SLUG
          ? {
            ...(toolDef?.config_json ?? {}),
            storage_dir: CHAT_GENERATED_FILES_DIR,
            chat_id: syncedConversationId,
            run_id: run.id,
          }
          : (toolDef?.config_json ?? undefined);
        const execResult = await executeTool(toolSlug, toolInput, toolConfig);
        if (toolSlug === CREATE_CHAT_FILES_TOOL_SLUG) {
          pendingGeneratedFiles.push(...extractGeneratedFilesFromToolResult(execResult.result, toolCall.id));
        }
        for (const usageEntry of normalizeToolUsageEntries(execResult.usage)) {
          recordUsage({
            prompt_tokens: usageEntry.prompt_tokens,
            completion_tokens: usageEntry.completion_tokens,
            total_tokens: usageEntry.total_tokens || (usageEntry.prompt_tokens + usageEntry.completion_tokens),
          }, usageEntry.model_external_id, `tool:${toolSlug}`);
        }
        await chargeAccumulatedUsage();

        await db.update(agentRunToolCalls).set({
          tool_output: execResult.result,
          status: 'success',
          duration_ms: execResult.duration_ms,
        }).where(eq(agentRunToolCalls.id, tcRecord.id));

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
        await emitRunEvent('chat.run.tool.finished', {
          run_id: run.id,
          tool_call_id: toolCall.id,
          tool_name: toolSlug,
          input: toolInput,
          output: execResult.result,
          status: 'success',
          duration_ms: execResult.duration_ms,
          label: `Инструмент ${toolSlug} завершён успешно`,
          detail: `${detailLabel}: ${toolIndex + 1} из ${toolCalls.length} завершён за ${execResult.duration_ms} мс`,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';

        await db.update(agentRunToolCalls).set({
          status: 'error',
          error_message: errMsg,
          duration_ms: 0,
        }).where(eq(agentRunToolCalls.id, tcRecord.id));

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
        await emitRunEvent('chat.run.tool.finished', {
          run_id: run.id,
          tool_call_id: toolCall.id,
          tool_name: toolSlug,
          input: toolInput,
          output: { error: errMsg },
          status: 'error',
          duration_ms: 0,
          error: errMsg,
          label: `Инструмент ${toolSlug} завершился с ошибкой`,
          detail: `${detailLabel}: ${toolIndex + 1} из ${toolCalls.length} завершился с ошибкой`,
        });
      }

      toolTraces.push(trace);
    }

    await db.update(agentRuns).set({ status: 'continuing' }).where(eq(agentRuns.id, run.id));
    await emitRunEvent('chat.run.status', {
      run_id: run.id,
      status: 'continuing',
      iteration: iterationLabel === 'forced_file' ? undefined : iterationLabel,
      label: 'Обрабатываю результаты инструментов',
      detail: iterationLabel === 'forced_file'
        ? 'Файл создан через принудительный file-pass, сохраняю результат в чат.'
        : 'Собираю данные от инструментов в единый финальный ответ.',
    });

    return toolCalls.length;
  };

  const maybeForceChatFileCreation = async (): Promise<boolean> => {
    if (!syncToChats || !syncedConversationId) return false;
    if (pendingGeneratedFiles.length > 0) return false;
    if (!looksLikeChatFileArtifactRequest(latestUserMessage)) return false;

    const fileToolParam = toolParams.find((tool) => tool.function.name === CREATE_CHAT_FILES_TOOL_SLUG);
    if (!fileToolParam) return false;

    await emitRunEvent('chat.run.status', {
      run_id: run.id,
      status: 'file_artifact_forced',
      label: 'Создаю файл',
      detail: 'Модель не вызвала файловый инструмент сама, запускаю отдельный шаг создания файла.',
    });

    const prompt = [
      `The user explicitly asked for a downloadable file: ${latestUserMessage}`,
      `Call ${CREATE_CHAT_FILES_TOOL_SLUG} now.`,
      'Use the conversation and tool results above as source material.',
      'If exact formatting is missing, choose a practical default.',
      'For spreadsheet requests, prefer .xlsx; if the user explicitly asked for .xls, create .xls. Put table data in content as CSV, an HTML table, a markdown table, a JSON array of objects, or JSON rows.',
      'For a periodic table request, create a spreadsheet with useful columns such as atomic_number, symbol, name, group, period, category, atomic_mass, phase, summary when possible.',
      `Never call ${CREATE_CHAT_FILES_TOOL_SLUG} with empty arguments. The files array is required, and every generated file must include content or content_base64.`,
      'Do not ask follow-up questions in this pass.',
    ].join('\n');

    try {
      for (let attempt = 0; attempt <= OPENROUTER_CHAT_FALLBACK_MODELS.length; attempt += 1) {
        const beforeCount = pendingGeneratedFiles.length;
        const response = await requestRuntimeCompletion({
          messages: [
            ...messages,
            { role: 'user', content: prompt },
          ],
          tools: [fileToolParam],
          tool_choice: { type: 'function', function: { name: CREATE_CHAT_FILES_TOOL_SLUG } },
          temperature: Math.min(effectiveTemperature, 0.1),
          max_tokens: Math.max(responseMaxTokens, 8_000),
        }, 'file_artifact_forced');

        if (response.usage) {
          recordUsage(response.usage, response.model || modelId, 'file_artifact_forced');
          await chargeAccumulatedUsage();
        }

        const choice = requireFirstChoice(response, 'LLM returned no choices during forced file creation');
        const forcedMessage = choice.message;
        if (forcedMessage.tool_calls?.length) {
          await executeAssistantToolCalls(forcedMessage, 'forced_file');
        } else {
          const forcedText = extractAssistantTextFromMessage(forcedMessage);
          if (forcedText && !finalOutput.trim()) {
            finalOutput = forcedText.trim();
            rawTerminalAssistantOutput = finalOutput;
            gotTerminalAssistantMessage = true;
          }
        }

        if (pendingGeneratedFiles.length > beforeCount) {
          if (!finalOutput.trim()) {
            finalOutput = 'Файл подготовлен.';
            rawTerminalAssistantOutput = finalOutput;
            gotTerminalAssistantMessage = true;
          }
          return true;
        }

        const fallbackModel = resolveOpenRouterRuntimeFallbackModel(modelId, attemptedRuntimeModelIds);
        if (!fallbackModel) break;

        const previousModelId = modelId;
        attemptedRuntimeModelIds.add(fallbackModel);
        modelId = fallbackModel;
        refreshModelRuntimeSettings();
        logger.warn({
          runId: run.id,
          previousModelId,
          fallbackModel,
          finishReason: choice.finish_reason,
          forcedMessage,
        }, 'Forced file creation returned no file, retrying with fallback model');
        await emitRunEvent('chat.run.status', {
          run_id: run.id,
          status: 'model_fallback',
          label: 'Переключаю модель для создания файла',
          detail: `Модель ${previousModelId} не создала файл, повторяю файловый шаг через ${fallbackModel}.`,
          previous_model: previousModelId,
          model: fallbackModel,
        });
      }
    } catch (err) {
      logger.warn({ runId: run.id, err }, 'Forced chat file creation failed');
      await emitRunEvent('chat.run.status', {
        run_id: run.id,
        status: 'file_artifact_failed',
        label: 'Не удалось создать файл автоматически',
        detail: err instanceof Error ? err.message : 'Файловый шаг завершился с ошибкой.',
      });
    }

    return false;
  };

  try {
    // 8. Main loop
    for (
      let iteration = 0;
      iteration < maxIterations;
      iteration++
    ) {
      if (Boolean(codingReport && (codingReport as CodingReport).preview)) {
        break;
      }
      logger.info({ runId: run.id, iteration, messageCount: messages.length, hasTools: toolParams.length > 0 }, 'Runtime loop iteration');
      await emitRunEvent('chat.run.status', {
        run_id: run.id,
        status: 'thinking',
        iteration: iteration + 1,
        label: `Итерация ${iteration + 1}: анализирую задачу`,
        detail: toolParams.length > 0
          ? 'Проверяю, нужно ли вызвать инструменты или уже можно собрать финальный ответ.'
          : 'Собираю ответ напрямую без инструментов.',
      });

      const response = await requestRuntimeCompletion({
        messages,
        tools: toolParams.length > 0 ? toolParams : undefined,
        tool_choice: toolParams.length > 0 ? 'auto' : undefined,
        temperature: effectiveTemperature,
      }, 'orchestrator');

      // Accumulate usage
      if (response.usage) {
        recordUsage(response.usage, response.model || modelId, 'orchestrator');
        await chargeAccumulatedUsage();
        await emitRunEvent('chat.run.status', {
          run_id: run.id,
          status: 'model_response_received',
          label: 'Ответ модели получен',
          detail: `Модель вернула ${response.usage.completion_tokens} токенов ответа, обновляю бюджет контекста.`,
        });
      }

      const choice = requireFirstChoice(response, 'LLM returned no choices');

      const assistantMessage = choice.message;
      logger.info({
        runId: run.id,
        iteration,
        finishReason: choice.finish_reason,
        hasToolCalls: !!(assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0),
        toolCallCount: assistantMessage.tool_calls?.length ?? 0,
        responseMaxTokens,
      }, 'LLM response received');

      // If tool calls are present, execute tools and continue
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        await executeAssistantToolCalls(assistantMessage, iteration + 1);
        continue; // Next iteration: LLM processes tool results
      }

      // No tool calls: final answer
      gotTerminalAssistantMessage = true;
      const rawAssistantOutput = extractAssistantTextFromMessage(assistantMessage);
      rawTerminalAssistantOutput = rawAssistantOutput;
      finalOutput = rawAssistantOutput;
      let combinedAssistantOutput = rawAssistantOutput;
      let finalFinishReason = choice.finish_reason;
      const shouldContinueLongOutput = (
        output: string,
        finishReason: ChatCompletionChoice['finish_reason'],
      ) => finishReason === 'length' || isRecoveredPreviewIncomplete(output);
      if (finalOutput && shouldContinueLongOutput(finalOutput, choice.finish_reason)) {
        await persistPartialAssistantOutput(finalOutput, { markTruncated: true });
        finalOutputWasTruncated = true;
        for (let continuationIndex = 1; continuationIndex <= MAX_FINAL_OUTPUT_CONTINUATIONS; continuationIndex += 1) {
          const continuation = await continueFinalAssistantOutput(finalOutput, continuationIndex);
          const chunk = continuation.chunk;
          if (!chunk) {
            break;
          }
          finalOutput = mergeAssistantOutputChunks(finalOutput, chunk);
          combinedAssistantOutput = finalOutput;
          rawTerminalAssistantOutput = combinedAssistantOutput;
          finalFinishReason = continuation.finishReason;
          await persistPartialAssistantOutput(finalOutput, {
            markTruncated: shouldContinueLongOutput(finalOutput, continuation.finishReason),
          });
          if (!shouldContinueLongOutput(finalOutput, continuation.finishReason)) {
            finalOutputWasTruncated = false;
            break;
          }
        }
      } else if (finalOutput) {
        await persistPartialAssistantOutput(finalOutput);
      }
      if (finalOutput && !codingReport) {
        const parsed = extractCodingReport(finalOutput);
        finalOutput = parsed.cleanText;
        codingReport = parsed.report;
        if (!finalOutput && codingReport?.summary) {
          finalOutput = codingReport.summary;
        }
        if (!finalOutput && combinedAssistantOutput) {
          finalOutput = extractPartialCodingSummary(combinedAssistantOutput) ?? combinedAssistantOutput;
        }
        if (finalOutputWasTruncated && finalOutput) {
          finalOutput = `${finalOutput.trim()}\n\n[Ответ всё ещё был обрезан по лимиту длины. Можно попросить продолжить или сузить задачу.]`;
        }
      }

      if (finalOutput && !codingReport?.preview) {
        const normalized = normalizeAssistantChatPayload(
          finalOutput,
          codingReport
            ? { coding_report: codingReport as unknown as Record<string, unknown> }
            : null,
        );
        if (normalized.codingReport) {
          codingReport = normalized.codingReport;
        }
        if (normalized.content.trim()) {
          finalOutput = normalized.content.trim();
        }
      }

      const requiresLandingPreview = landingDetectionEnabled && looksLikeLandingBuildRequest(latestUserMessage) && !strictPreviewEdit;
      if (
        runStatus === 'completed'
        && requiresLandingPreview
        && (!codingReport?.preview || codingReport.preview.type !== 'html' || !codingReport.preview.html?.trim())
      ) {
        const repairedPreview = await attemptLandingPreviewRepair(combinedAssistantOutput || finalOutput);
        if (repairedPreview) {
          finalOutput = repairedPreview.content;
          codingReport = repairedPreview.codingReport;
          finalOutputWasTruncated = false;
          if (finalOutput.trim()) {
            await persistPartialAssistantOutput(finalOutput, {
              overrideReport: codingReport,
              overrideContent: finalOutput,
            });
          }
        }
      }

      if (
        runStatus === 'completed'
        && requiresLandingPreview
        && (!codingReport?.preview || codingReport.preview.type !== 'html' || !codingReport.preview.html?.trim())
      ) {
        runStatus = 'failed';
        errorMessage = 'Landing preview was not assembled';
        const failureNotes = [
          ...(codingReport?.notes ?? []),
          'Run завершился без рабочего preview, поэтому не считается успешным.',
        ].slice(0, 12);
        codingReport = sanitizeCodingReport({
          ...(codingReport ?? {}),
          notes: failureNotes,
        });
        if (finalOutput.trim()) {
          await persistPartialAssistantOutput(finalOutput, {
            overrideReport: codingReport,
            overrideContent: finalOutput,
          });
        }
      }

      if (!finalOutput) {
        logger.warn(
          {
            runId: run.id,
            iteration,
            finishReason: finalFinishReason,
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

  if (runStatus === 'completed' && pendingGeneratedFiles.length === 0) {
    await maybeForceChatFileCreation();
  }

  if (runStatus === 'completed' && !finalOutput.trim() && pendingGeneratedFiles.length > 0) {
    finalOutput = 'Файл подготовлен.';
    rawTerminalAssistantOutput = finalOutput;
    gotTerminalAssistantMessage = true;
  }

  if (runStatus === 'completed' && !finalOutput.trim()) {
    runStatus = 'failed';
    errorMessage = gotTerminalAssistantMessage
      ? 'Модель не вернула текстовый ответ.'
      : `Агент не вернул итоговый ответ: достигнут лимит итераций (${maxIterations}).`;
    logger.warn({ runId: run.id, modelId, maxIterations }, 'Agent run completed without final text output');
  }

  const latencyMs = Date.now() - startTime;

  // 9. Persist messages
  const allMessages = messages.map(m => ({
    run_id: run.id,
    role: m.role,
    content_text: typeof m.content === 'string' ? m.content : (m.content ? JSON.stringify(m.content) : null),
  }));
  if (gotTerminalAssistantMessage && rawTerminalAssistantOutput.trim()) {
    allMessages.push({
      run_id: run.id,
      role: 'assistant',
      content_text: rawTerminalAssistantOutput,
    });
  }
  if (allMessages.length > 0) {
    await db.insert(agentRunMessages).values(allMessages);
  }

  if (chargeUsage && totalUsage.total_tokens > 0) {
    await chargeAccumulatedUsage(true);
  }

  // 10. Persist usage
  const estCost = getEstimatedCostTotal();
  const usdToRubRate = await getUsdToRubRate();
  const usageBreakdownPayload = getUsageBreakdownPayload();
  if (totalUsage.total_tokens > 0) {
    const ledgerRows = usageBreakdownPayload.length > 0
      ? usageBreakdownPayload.map((entry) => ({
        run_id: run.id,
        provider: 'openrouter',
        model_external_id: entry.model,
        provider_name: 'openrouter',
        prompt_tokens: entry.prompt_tokens,
        completion_tokens: entry.completion_tokens,
        total_tokens: entry.total_tokens,
        estimated_cost: entry.estimated_cost,
        raw_usage_json: {
          ...entry,
          orchestrator_model: modelId,
          run_total_tokens: totalUsage.total_tokens,
          run_total_estimated_cost: estCost,
          run_total_charged_cost: chargedCostUsd.toFixed(4),
          run_total_provider_cost: pricedProviderCostUsd.toFixed(6),
          pricing_margin_usd: (chargedCostUsd - pricedProviderCostUsd).toFixed(6),
        } as Record<string, unknown>,
      }))
      : [{
        run_id: run.id,
        provider: 'openrouter',
        model_external_id: modelId,
        provider_name: 'openrouter',
        prompt_tokens: totalUsage.prompt_tokens,
        completion_tokens: totalUsage.completion_tokens,
        total_tokens: totalUsage.total_tokens,
        estimated_cost: estCost,
        raw_usage_json: {
          ...(totalUsage as unknown as Record<string, unknown>),
          run_total_charged_cost: chargedCostUsd.toFixed(4),
          run_total_provider_cost: pricedProviderCostUsd.toFixed(6),
          pricing_margin_usd: (chargedCostUsd - pricedProviderCostUsd).toFixed(6),
        },
      }];
    await db.insert(usageLedger).values(ledgerRows);
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
    const visibleToolTraces = getUserVisibleToolTraces(toolTraces);
    const usagePayload = totalUsage.total_tokens > 0
      ? {
        ...totalUsage,
        estimated_cost: estCost,
        ...getActualBillingPayload(),
        model: modelId,
        usd_to_rub_rate: usdToRubRate,
        by_model: usageBreakdownPayload,
        tool_traces: visibleToolTraces,
        coding_report: codingReport,
      }
      : (
        visibleToolTraces.length > 0 || codingReport
          ? {
            tool_traces: visibleToolTraces,
            coding_report: codingReport,
          }
          : null
      );

    let syncedAssistantMessageId: string | null = null;

    if (partialAssistantMessageId) {
      await db.update(chatConversationMessages).set({
        ...(runStatus === 'completed' && finalOutput.trim().length > 0
          ? { content_text: finalOutput }
          : {}),
        usage_json: usagePayload as Record<string, unknown> | null,
        latency_ms: latencyMs,
      }).where(eq(chatConversationMessages.id, partialAssistantMessageId));
      syncedAssistantMessageId = partialAssistantMessageId;
    } else if (runStatus === 'completed' && (finalOutput.trim().length > 0 || pendingGeneratedFiles.length > 0)) {
      const [insertedAssistantMessage] = await db.insert(chatConversationMessages).values({
        conversation_id: syncedConversationId,
        role: 'assistant',
        content_text: finalOutput.trim().length > 0 ? finalOutput : 'Файлы подготовлены.',
        run_id: run.id,
        usage_json: usagePayload as Record<string, unknown> | null,
        latency_ms: latencyMs,
      }).returning({ id: chatConversationMessages.id });
      syncedAssistantMessageId = insertedAssistantMessage?.id ?? null;
    }

    if (syncedAssistantMessageId && pendingGeneratedFiles.length > 0) {
      const generatedFiles = await persistGeneratedFilesForMessage({
        conversationId: syncedConversationId,
        messageId: syncedAssistantMessageId,
        userId,
        runId: run.id,
        files: pendingGeneratedFiles,
      });
      if (generatedFiles.length > 0) {
        await db.update(chatConversationMessages)
          .set({
            usage_json: attachGeneratedFilesToUsage(usagePayload as Record<string, unknown> | null, generatedFiles),
          })
          .where(eq(chatConversationMessages.id, syncedAssistantMessageId));
      }
    }

    await db.update(chatConversations).set({
      title: options.sync_chat_title?.trim() || (latestUserMessage ? compactTitle(latestUserMessage) : undefined),
      model_external_id: modelId,
      last_message_at: new Date(),
      updated_at: new Date(),
    }).where(eq(chatConversations.id, syncedConversationId));
  }

  if (runStatus === 'completed') {
    await emitRunEvent('chat.run.completed', {
      run_id: run.id,
      latency_ms: latencyMs,
      tool_count: toolTraces.length,
      has_preview: Boolean(codingReport?.preview),
      label: 'Агент завершил выполнение задачи',
      detail: codingReport?.preview
        ? 'Ответ собран, preview подготовлен и скоро будет сохранён в чат.'
        : 'Ответ собран и готов к сохранению в чат.',
    });
  } else {
    await emitRunEvent('chat.run.failed', {
      run_id: run.id,
      error: errorMessage ?? 'Unknown error',
      label: 'Выполнение завершилось с ошибкой',
      detail: errorMessage ?? 'Во время выполнения произошла ошибка.',
    });
  }

  return {
    run_id: run.id,
    status: runStatus,
    output: finalOutput,
    tool_traces: getUserVisibleToolTraces(toolTraces),
    usage: totalUsage.total_tokens > 0
      ? {
        ...totalUsage,
        estimated_cost: estCost,
        ...getActualBillingPayload(),
        model: modelId,
        usd_to_rub_rate: usdToRubRate,
        by_model: usageBreakdownPayload,
      }
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

  if (!run) throw new NotFoundError('Ресурс не найден');

  const messages = await db.select().from(agentRunMessages).where(eq(agentRunMessages.run_id, runId)).orderBy(agentRunMessages.created_at);
  const toolCalls = await db.select().from(agentRunToolCalls).where(eq(agentRunToolCalls.run_id, runId)).orderBy(agentRunToolCalls.created_at);

  return { ...run, messages, tool_calls: toolCalls };
}

export async function listRuns(userId: string, agentId?: string, deploymentId?: string) {
  let query = db
    .select({
      id: agentRuns.id,
      agent_id: agentRuns.agent_id,
      deployment_id: agentRuns.deployment_id,
      chat_id: chatConversations.id,
      chat_title: chatConversations.title,
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
    .leftJoin(chatConversationMessages, eq(chatConversationMessages.run_id, agentRuns.id))
    .leftJoin(chatConversations, eq(chatConversations.id, chatConversationMessages.conversation_id))
    .where(
      and(
        eq(agentRuns.user_id, userId),
        ...(agentId ? [eq(agentRuns.agent_id, agentId)] : []),
        ...(deploymentId ? [eq(agentRuns.deployment_id, deploymentId)] : []),
      ),
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

  if (!session) throw new NotFoundError('Ресурс не найден');

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

  if (!session) throw new NotFoundError('Ресурс не найден');

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

const DEFAULT_GENERAL_MODEL = 'google/gemini-2.5-flash';
const CHAT_TOOL_RUNTIME_AGENT_SLUG_PREFIX = 'chat-tool-runtime-';
const CREATE_CHAT_FILES_TOOL_SLUG = 'create-chat-files';
const AUTO_ATTACH_CHAT_TOOL_SLUGS = [CREATE_CHAT_FILES_TOOL_SLUG] as const;
const AUTO_RUN_CHAT_TOOL_SLUGS = [CREATE_CHAT_FILES_TOOL_SLUG] as const;
const MAX_CHAT_TOOL_IDS = 64;

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function createSafeToolInputPreview(input: Record<string, unknown>, reason: string): Record<string, unknown> {
  const files = Array.isArray(input.files)
    ? input.files.map((item, index) => {
      const file = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return {
        name: hasNonEmptyString(file.name) ? file.name.trim().slice(0, 180) : `file-${index + 1}.txt`,
        rejected: reason,
      };
    })
    : [];

  return {
    files,
    rejected: true,
    reason,
  };
}

function chooseFallbackChatFileContent(
  originalName: string,
  fallbackHtml: string | null | undefined,
  fallbackText: string | null | undefined,
): string | null {
  const ext = path.extname(originalName).toLowerCase();
  if ((ext === '.html' || ext === '.htm') && fallbackHtml?.trim()) {
    return fallbackHtml.trim();
  }

  if ((ext === '.html' || ext === '.htm') && fallbackText?.trim()) {
    const trimmed = fallbackText.trim();
    return /<!doctype html|<html[\s>]|<body[\s>]|<main[\s>]|<section[\s>]/i.test(trimmed)
      ? trimmed
      : null;
  }

  if (fallbackText?.trim()) {
    return fallbackText.trim();
  }

  if (fallbackHtml?.trim()) {
    return fallbackHtml.trim();
  }

  return null;
}

function normalizeCreateChatFilesRuntimeInput(
  input: Record<string, unknown>,
  fallback: {
    fallbackHtml?: string | null;
    fallbackText?: string | null;
  },
): { input: Record<string, unknown>; error: string | null; repaired: boolean } {
  const rawFiles = Array.isArray(input.files) ? input.files : [];
  if (rawFiles.length === 0) {
    const reason = 'create-chat-files requires at least one file with non-empty content or content_base64.';
    return { input: createSafeToolInputPreview(input, reason), error: reason, repaired: false };
  }

  let repaired = false;
  const normalizedFiles = rawFiles.map((item, index) => {
    if (!item || typeof item !== 'object') return item;
    const file = item as Record<string, unknown>;
    if (hasNonEmptyString(file.content) || hasNonEmptyString(file.content_base64)) {
      return file;
    }

    const originalName = hasNonEmptyString(file.name) ? file.name.trim() : `file-${index + 1}.txt`;
    const fallbackContent = chooseFallbackChatFileContent(
      originalName,
      fallback.fallbackHtml,
      fallback.fallbackText,
    );
    if (!fallbackContent) return file;

    repaired = true;
    const rest = { ...file };
    delete rest.content_base64;
    return {
      ...rest,
      name: originalName,
      content: fallbackContent,
    };
  });

  const missingContent = normalizedFiles.some((item) => {
    if (!item || typeof item !== 'object') return true;
    const file = item as Record<string, unknown>;
    return !hasNonEmptyString(file.content) && !hasNonEmptyString(file.content_base64);
  });

  if (missingContent) {
    const reason = 'create-chat-files received a file without non-empty content or content_base64.';
    return { input: createSafeToolInputPreview(input, reason), error: reason, repaired: false };
  }

  return {
    input: {
      ...input,
      files: normalizedFiles,
    },
    error: null,
    repaired,
  };
}

const OPENROUTER_CHAT_FALLBACK_MODELS = [
  DEFAULT_GENERAL_MODEL,
  'anthropic/claude-haiku-4.5',
] as const;
const OPENROUTER_FREE_CHAT_FALLBACK_MODELS = [
  'openrouter/free',
  'deepseek/deepseek-v4-flash:free',
  'qwen/qwen3-coder:free',
] as const;
const OPENROUTER_IMAGE_GENERATION_FALLBACK_MODELS = [
  'google/gemini-3.1-flash-image-preview',
] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AGENT_OPENROUTER_TIMEOUT_MS = 3 * 60_000;
const TOOL_AGENT_OPENROUTER_TIMEOUT_MS = 8 * 60_000;
const CODING_AGENT_OPENROUTER_TIMEOUT_MS = 8 * 60_000;
const GENERAL_CHAT_OPENROUTER_TIMEOUT_MS = 3 * 60_000;
const MAX_FINAL_OUTPUT_CONTINUATIONS = 24;
const MAX_AGENT_RESPONSE_TOKENS = 2200;
const MAX_LANDING_RESPONSE_TOKENS = 12_000;

function resolveAgentOpenRouterTimeoutMs(modelId: string, toolCount: number): number {
  if (isCodingModel(modelId)) {
    return CODING_AGENT_OPENROUTER_TIMEOUT_MS;
  }

  if (toolCount > 0) {
    return TOOL_AGENT_OPENROUTER_TIMEOUT_MS;
  }

  return AGENT_OPENROUTER_TIMEOUT_MS;
}

function resolveOpenRouterProviderPreferences(
  modelId: string,
  toolCount: number,
  previewOnlyLandingRequest = false,
) {
  if (previewOnlyLandingRequest) {
    return undefined;
  }

  const pricing = getModelPricingInfo(modelId);
  const isFreeModel = pricing?.input === 0 && pricing.output === 0;
  if (isFreeModel) {
    return {
      sort: 'price' as const,
      allow_fallbacks: false,
      require_parameters: toolCount > 0,
      max_price: {
        prompt: 0,
        completion: 0,
        request: 0,
      },
    };
  }

  if (isCodingModel(modelId) || toolCount > 0) {
    return {
      sort: 'throughput' as const,
      require_parameters: true,
    };
  }

  return undefined;
}

function stringifyErrorDetails(error: unknown): string {
  if (!(error instanceof AppError) || !error.details) return '';

  try {
    return JSON.stringify(error.details);
  } catch {
    return '';
  }
}

function isKnownFreeOpenRouterModel(modelId?: string | null): boolean {
  const pricing = getModelPricingInfo(modelId);
  return pricing?.input === 0 && pricing.output === 0;
}

function shouldTryOpenRouterRuntimeFallback(error: unknown, currentModelId?: string | null): boolean {
  if (!(error instanceof AppError)) return false;
  if (error.code === 'EMPTY_RESPONSE') return true;
  if (error.code === 'RATE_LIMITED' && isKnownFreeOpenRouterModel(currentModelId)) return true;
  if (error.code !== 'LLM_PROVIDER_ERROR' && error.code !== 'LLM_BAD_REQUEST') return false;

  const haystack = `${error.message} ${stringifyErrorDetails(error)}`.toLowerCase();
  return [
    'unsupported_country_region_territory',
    'country, region, or territory not supported',
    'provider returned error',
    'no endpoints found that can handle',
    'not a valid model id',
  ].some((needle) => haystack.includes(needle));
}

function resolveOpenRouterRuntimeFallbackModel(
  currentModelId: string,
  triedModelIds: Set<string>,
): string | null {
  const normalizedCurrent = normalizeOpenRouterModelId(currentModelId);
  const currentPricing = getModelPricingInfo(normalizedCurrent);
  const fallbackModels = currentPricing?.input === 0 && currentPricing.output === 0
    ? OPENROUTER_FREE_CHAT_FALLBACK_MODELS
    : OPENROUTER_CHAT_FALLBACK_MODELS;

  for (const candidate of fallbackModels) {
    const normalizedCandidate = normalizeOpenRouterModelId(candidate);
    if (normalizedCandidate && normalizedCandidate !== normalizedCurrent && !triedModelIds.has(normalizedCandidate)) {
      return normalizedCandidate;
    }
  }

  return null;
}

function looksLikeChatFileArtifactRequest(value: string): boolean {
  const normalized = value.toLowerCase();
  return [
    /\b(csv|json|html|markdown|md|txt|xml|sql|xlsx?|excel)\b/i,
    /эксел/i,
    /файл/i,
    /скача/i,
    /экспорт/i,
    /табличк/i,
    /таблиц/i,
    /сгенерируй\s+.*документ/i,
    /созда[йть]\s+.*документ/i,
    /downloadable/i,
    /\bfile\b/i,
    /\bexport\b/i,
  ].some((pattern) => pattern.test(normalized));
}

function resolveAgentResponseMaxTokens(
  configuredMaxTokens: number | undefined,
  modelId: string,
  toolCount: number,
  landingBuildRequest = false,
): number {
  const base = configuredMaxTokens && Number.isFinite(configuredMaxTokens)
    ? Math.max(256, Math.round(configuredMaxTokens))
    : 4096;

  if (landingBuildRequest) {
    return Math.min(base, MAX_LANDING_RESPONSE_TOKENS);
  }

  if (isCodingModel(modelId) || toolCount > 0) {
    return Math.min(base, MAX_AGENT_RESPONSE_TOKENS);
  }

  return base;
}

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
  pinned_at: Date | null;
  last_message_at: Date;
  created_at: Date;
  updated_at: Date;
}

interface ConversationListItem {
  id: string;
  title: string;
  note: string | null;
  mode: ChatMode;
  agent_id: string | null;
  agent_name: string | null;
  agent_model_external_id: string | null;
  agent_model_label: string | null;
  effective_model_label: string | null;
  model_external_id: string | null;
  access: ChatAccess;
  access_identifiers: string[];
  share_token: string | null;
  message_count: number;
  last_message_preview: string | null;
  pending_run: SharedPendingRunState | null;
  pinned_at: string | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
  has_active_deployment?: boolean;
}

interface ChatAgentOption {
  id: string;
  name: string;
  owner_user_id: string;
  owner_name: string | null;
  owner_username: string | null;
  is_owner: boolean;
  description: string | null;
  created_at: string;
  total_runs: number;
  model_external_id: string | null;
  model_label: string | null;
  pricing_input_usd_per_million: number | null;
  pricing_output_usd_per_million: number | null;
  is_coding_model: boolean;
  chat_description: string | null;
  starter_prompts: string[];
}

interface PublicAgentChatListItem {
  id: string;
  title: string;
  chat_url: string;
  share_token: string;
  owner_name: string;
  owner_username: string | null;
  is_owner: boolean;
  message_count: number;
  last_message_preview: string | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
  unique_view_count: number;
  total_view_count: number;
}

interface PublicAgentChatsResult {
  agent: {
    id: string;
    name: string | null;
    model_external_id: string | null;
    model_label: string | null;
    chat_description: string | null;
    public_chats_count: number;
  };
  chats: PublicAgentChatListItem[];
}

interface PublicModelChatListItem extends PublicAgentChatListItem {
  agent_id: string;
  agent_name: string | null;
}

interface PublicModelChatsResult {
  model: {
    model_external_id: string;
    model_label: string | null;
    public_chats_count: number;
    agents_count: number;
  };
  chats: PublicModelChatListItem[];
}

interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  run_id: string | null;
  usage: Record<string, unknown> | null;
  attachments: ChatAttachmentMeta[];
  generated_files: ChatGeneratedFileMeta[];
  project_run_count: number;
  latency_ms: number | null;
  created_at: string;
}

interface PublishedLandingResult {
  id: string;
  slug?: string;
  subdomain: string | null;
  title: string | null;
  description?: string | null;
  url: string;
  site_url: string | null;
  preview_url: string | null;
  is_published: boolean;
  updated_at: string | null;
}

interface ConversationDetails {
  chat: Omit<ConversationListItem, 'last_message_preview' | 'message_count'> & {
    message_count: number;
    system_prompt: string | null;
    settings_json: Record<string, unknown> | null;
    agent_name: string | null;
    agent_chat_description: string | null;
    agent_starter_prompts: string[];
    agent_system_prompt: string | null;
    agent_developer_prompt: string | null;
    agent_runtime_config: Record<string, unknown> | null;
    agent_tool_config: Record<string, unknown> | null;
    tool_ids: string[];
    tools: ChatToolSummary[];
    chat_tool_ids: string[];
    chat_tools: ChatToolSummary[];
    agent_tool_ids: string[];
    agent_tools: ChatToolSummary[];
    effective_tool_ids: string[];
    effective_tools: ChatToolSummary[];
    project_deployments: ChatProjectDeploymentSummary[];
    pending_run: SharedPendingRunState | null;
  };
  messages: ConversationMessage[];
}

interface ChatProjectDeploymentSummary {
  id: string;
  title: string;
  status: string;
  runtime: string;
  entrypoint: string | null;
  linked_agent_id: string | null;
  linked_agent_name: string | null;
  model_external_id: string | null;
  telegram_bot_username: string | null;
  telegram_bot_url: string | null;
  delivery_mode: string | null;
  webhook_url: string;
  last_error: string | null;
  last_started_at: string | null;
  last_stopped_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ChatToolSummary {
  id: string;
  name: string;
  slug: string;
  tool_type: typeof toolDefinitions.$inferSelect.tool_type;
  description: string | null;
  is_builtin: boolean;
  is_active: boolean;
}

interface ChatTransferAttachment {
  filename: string;
  original_name: string;
  mime_type: string;
  kind: 'image' | 'text' | 'file';
  size: number;
  data_base64: string;
}

interface ChatTransferMessage {
  role: 'user' | 'assistant';
  content: string;
  usage: Record<string, unknown> | null;
  project_run_count: number | null;
  latency_ms: number | null;
  created_at: string;
}

interface ChatTransferBundlePayload {
  schema_version: 1;
  exported_at: string;
  chat: {
    title: string;
    mode: ChatMode;
    model_external_id: string | null;
    agent_name: string | null;
    agent_model_external_id: string | null;
  };
  messages: ChatTransferMessage[];
  attachments: ChatTransferAttachment[];
}

interface ChatTransferBundleFile {
  filename: string;
  payload: ChatTransferBundlePayload;
}

type GalleryItemKind = 'preview' | 'project' | 'hybrid';

interface GalleryPreviewItem {
  message_id: string;
  chat_id: string;
  chat_title: string;
  chat_url: string;
  is_owner: boolean;
  kind: GalleryItemKind;
  preview_title: string | null;
  preview_type: 'html' | 'url' | null;
  preview_url: string | null;
  preview_html: string | null;
  project_title: string | null;
  project_runtime: 'node' | 'python' | 'static' | 'generic' | null;
  project_entrypoint: string | null;
  project_file_count: number;
  project_run_count: number;
  author_name: string;
  author_username: string | null;
  view_count: number;
  unique_view_count: number;
  total_view_count: number;
  recent_view_count_day: number;
  recent_view_count_week: number;
  recent_view_count_month: number;
  message_count: number;
  reaction_counts: Record<ChatReactionType, number>;
  my_reaction: ChatReactionType | null;
  created_at: string;
  total_usd_cost: number;
  total_rub_cost: number;
  model: string | null;
}

interface GalleryTextChatItem {
  chat_id: string;
  chat_title: string;
  chat_url: string;
  is_owner: boolean;
  author_name: string;
  author_username: string | null;
  text_preview: string;
  created_at: string;
  unique_view_count: number;
  total_view_count: number;
  recent_view_count_day: number;
  recent_view_count_week: number;
  recent_view_count_month: number;
  message_count: number;
  total_usd_cost: number;
  model: string | null;
}

type GalleryTextChatSort =
  | 'newest'
  | 'oldest'
  | 'views_day'
  | 'views_week'
  | 'views_month'
  | 'views_all'
  | 'message_count'
  | 'total_cost';

interface ChatStatsModelBreakdown {
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  usd_cost: number;
  rub_cost: number;
  messages: number;
  generated_images: number;
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
    generated_images: number;
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
  return text.length > 80 ? `${text.slice(0, 80)}...` : text || 'Новый чат';
}

function compactTextPreview(content: string, maxLength = 220): string {
  const text = content.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}...` : text;
}

function resolveGalleryTextChatSort(value: unknown): GalleryTextChatSort {
  switch (value) {
    case 'oldest':
    case 'views_day':
    case 'views_week':
    case 'views_month':
    case 'views_all':
    case 'message_count':
    case 'total_cost':
      return value;
    default:
      return 'newest';
  }
}

function extractStarterPrompts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v.length > 0)
    .slice(0, 12);
}

function normalizeChatToolIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const toolId = item.trim();
    if (!UUID_PATTERN.test(toolId) || seen.has(toolId)) continue;
    seen.add(toolId);
    normalized.push(toolId);
    if (normalized.length >= MAX_CHAT_TOOL_IDS) break;
  }

  return normalized;
}

function extractChatToolSettings(settings: Record<string, unknown> | null | undefined): {
  tool_ids: string[];
  tool_agent_id: string | null;
} {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return { tool_ids: [], tool_agent_id: null };
  }

  const maybeAgentId = typeof settings.tool_agent_id === 'string' ? settings.tool_agent_id.trim() : '';
  return {
    tool_ids: normalizeChatToolIds(settings.tool_ids),
    tool_agent_id: UUID_PATTERN.test(maybeAgentId) ? maybeAgentId : null,
  };
}

function normalizeChatNote(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 300) : null;
}

function extractChatNote(settings: Record<string, unknown> | null | undefined): string | null {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return null;
  }

  return normalizeChatNote(settings.note);
}

function normalizeContextWindowOverride(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  if (rounded < 8192 || rounded > 2_000_000) return null;
  return rounded;
}

function buildChatSettingsJson(
  existing: Record<string, unknown> | null | undefined,
  overrides: {
    tool_ids?: string[];
    tool_agent_id?: string | null;
    note?: string | null;
    context_window_tokens?: number | null;
  },
): Record<string, unknown> | null {
  const base = (existing && typeof existing === 'object' && !Array.isArray(existing))
    ? { ...existing }
    : {};

  if (overrides.tool_ids !== undefined) {
    base.tool_ids = normalizeChatToolIds(overrides.tool_ids);
  }

  if (overrides.tool_agent_id !== undefined) {
    if (overrides.tool_agent_id) {
      base.tool_agent_id = overrides.tool_agent_id;
    } else {
      delete base.tool_agent_id;
    }
  }

  if (overrides.note !== undefined) {
    const normalizedNote = normalizeChatNote(overrides.note);
    if (normalizedNote) {
      base.note = normalizedNote;
    } else {
      delete base.note;
    }
  }

  if (overrides.context_window_tokens !== undefined) {
    const normalizedContextWindow = normalizeContextWindowOverride(overrides.context_window_tokens);
    if (normalizedContextWindow) {
      base.context_window_tokens = normalizedContextWindow;
    } else {
      delete base.context_window_tokens;
    }
  }

  return Object.keys(base).length > 0 ? base : null;
}

async function getActiveToolSummariesByIds(toolIds: string[]): Promise<ChatToolSummary[]> {
  const normalizedToolIds = normalizeChatToolIds(toolIds);
  if (normalizedToolIds.length === 0) return [];

  const rows = await db
    .select({
      id: toolDefinitions.id,
      name: toolDefinitions.name,
      slug: toolDefinitions.slug,
      tool_type: toolDefinitions.tool_type,
      description: toolDefinitions.description,
      is_builtin: toolDefinitions.is_builtin,
      is_active: toolDefinitions.is_active,
    })
    .from(toolDefinitions)
    .where(and(
      inArray(toolDefinitions.id, normalizedToolIds),
      eq(toolDefinitions.is_active, true),
    ));

  const byId = new Map(rows.map((row) => [row.id, row]));
  const orderedTools: ChatToolSummary[] = [];
  for (const toolId of normalizedToolIds) {
    const tool = byId.get(toolId);
    if (tool) {
      orderedTools.push(tool);
    }
  }

  return orderedTools;
}

async function getActiveToolDefinitionRowsBySlugs(
  slugs: readonly string[],
): Promise<Array<typeof toolDefinitions.$inferSelect>> {
  if (slugs.length === 0) return [];

  const rows = await db
    .select()
    .from(toolDefinitions)
    .where(and(
      inArray(toolDefinitions.slug, [...slugs]),
      eq(toolDefinitions.is_active, true),
    ));

  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  return slugs
    .map((slug) => bySlug.get(slug) ?? null)
    .filter((row): row is typeof toolDefinitions.$inferSelect => Boolean(row));
}

async function getAutoAttachChatToolSummaries(): Promise<ChatToolSummary[]> {
  const rows = await getActiveToolDefinitionRowsBySlugs(AUTO_ATTACH_CHAT_TOOL_SLUGS);
  if (rows.length !== AUTO_ATTACH_CHAT_TOOL_SLUGS.length) {
    logger.warn({ slugs: AUTO_ATTACH_CHAT_TOOL_SLUGS }, 'One or more auto chat tools are unavailable');
  }
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    tool_type: row.tool_type,
    description: row.description,
    is_builtin: row.is_builtin,
    is_active: row.is_active,
  }));
}

async function mergeAutoChatToolIds(toolIds: string[]): Promise<string[]> {
  const normalizedToolIds = normalizeChatToolIds(toolIds);
  const autoTools = await getAutoAttachChatToolSummaries();
  return normalizeChatToolIds([
    ...normalizedToolIds,
    ...autoTools.map((tool) => tool.id),
  ]);
}

async function ensureAutoChatToolsForConversation(
  chat: ChatConversationRow,
): Promise<ChatConversationRow> {
  if (chat.mode !== 'general') return chat;

  const existingToolSettings = extractChatToolSettings(chat.settings_json);
  const nextToolIds = await mergeAutoChatToolIds(existingToolSettings.tool_ids);
  if (
    nextToolIds.length === existingToolSettings.tool_ids.length
    && nextToolIds.every((toolId, index) => toolId === existingToolSettings.tool_ids[index])
  ) {
    return chat;
  }

  const nextSettings = buildChatSettingsJson(chat.settings_json, {
    tool_ids: nextToolIds,
  });

  await db.update(chatConversations)
    .set({
      settings_json: nextSettings,
      updated_at: new Date(),
    })
    .where(eq(chatConversations.id, chat.id));

  return {
    ...chat,
    settings_json: nextSettings,
    updated_at: new Date(),
  };
}

async function getActiveAgentToolSummaries(agentId: string | null): Promise<ChatToolSummary[]> {
  if (!agentId) return [];

  const [agent] = await db
    .select({ current_version_id: agents.current_version_id })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent?.current_version_id) return [];

  return db
    .select({
      id: toolDefinitions.id,
      name: toolDefinitions.name,
      slug: toolDefinitions.slug,
      tool_type: toolDefinitions.tool_type,
      description: toolDefinitions.description,
      is_builtin: toolDefinitions.is_builtin,
      is_active: toolDefinitions.is_active,
    })
    .from(agentVersionTools)
    .innerJoin(toolDefinitions, eq(agentVersionTools.tool_definition_id, toolDefinitions.id))
    .where(and(
      eq(agentVersionTools.agent_version_id, agent.current_version_id),
      eq(toolDefinitions.is_active, true),
    ))
    .orderBy(agentVersionTools.order_index);
}

function mergeToolSummaries(...groups: ChatToolSummary[][]): ChatToolSummary[] {
  const byId = new Map<string, ChatToolSummary>();
  for (const group of groups) {
    for (const tool of group) {
      if (!byId.has(tool.id)) {
        byId.set(tool.id, tool);
      }
    }
  }
  return [...byId.values()];
}

async function validateChatToolSelection(toolIds: string[]): Promise<ChatToolSummary[]> {
  const normalizedToolIds = normalizeChatToolIds(toolIds);
  const tools = await getActiveToolSummariesByIds(normalizedToolIds);

  if (tools.length !== normalizedToolIds.length) {
    throw new AppError(400, 'CHAT_TOOL_NOT_FOUND', 'Один или несколько выбранных инструментов недоступны');
  }

  return tools;
}

function buildChatToolRuntimeConfig(chatId: string, modelExternalId?: string | null): Record<string, unknown> {
  return {
    max_iterations: 4,
    temperature: 0.3,
    max_tokens: 4096,
    model_external_id: normalizeOpenRouterModelId(modelExternalId ?? DEFAULT_GENERAL_MODEL),
    internal_chat_tools: true,
    internal_chat_id: chatId,
  };
}

async function ensureChatToolRuntimeAgent(
  chat: Pick<ChatConversationRow, 'id' | 'title'>,
  userId: string,
  toolIds: string[],
  modelExternalId?: string | null,
  systemPrompt?: string | null,
): Promise<string> {
  const normalizedToolIds = normalizeChatToolIds(toolIds);
  if (normalizedToolIds.length === 0) {
    throw new AppError(400, 'CHAT_TOOLS_REQUIRED', 'Для tool-runtime чата нужен хотя бы один инструмент');
  }

  const slug = `${CHAT_TOOL_RUNTIME_AGENT_SLUG_PREFIX}${chat.id}`;
  const runtimeConfig = buildChatToolRuntimeConfig(chat.id, modelExternalId);
  const safeName = `Chat Tools: ${chat.title.slice(0, 80) || chat.id.slice(0, 8)}`;

  let [agent] = await db
    .select()
    .from(agents)
    .where(and(
      eq(agents.owner_user_id, userId),
      eq(agents.slug, slug),
    ))
    .limit(1);

  if (!agent) {
    [agent] = await db.insert(agents).values({
      owner_user_id: userId,
      name: safeName,
      slug,
      description: 'Internal chat tool runtime agent',
      visibility: 'private',
      status: 'draft',
    }).returning();
  } else {
    [agent] = await db.update(agents)
      .set({
        name: safeName,
        description: 'Internal chat tool runtime agent',
      })
      .where(eq(agents.id, agent.id))
      .returning();
  }

  let versionId = agent.current_version_id ?? null;
  if (!versionId) {
    const [createdVersion] = await db.insert(agentVersions).values({
      agent_id: agent.id,
      version_number: 1,
      runtime_engine: 'openrouter_chat',
      system_prompt: systemPrompt?.trim() || null,
      response_mode: 'text',
      runtime_config: runtimeConfig,
    }).returning();

    versionId = createdVersion.id;
    await db.update(agents).set({ current_version_id: versionId }).where(eq(agents.id, agent.id));
  } else {
    await db.update(agentVersions)
      .set({
        runtime_engine: 'openrouter_chat',
        system_prompt: systemPrompt?.trim() || null,
        response_mode: 'text',
        runtime_config: runtimeConfig,
      })
      .where(eq(agentVersions.id, versionId));
  }

  await db.delete(agentVersionTools).where(eq(agentVersionTools.agent_version_id, versionId));
  await db.insert(agentVersionTools).values(
    normalizedToolIds.map((toolId, index) => ({
      agent_version_id: versionId!,
      tool_definition_id: toolId,
      is_required: false,
      order_index: index,
    })),
  );

  return agent.id;
}

async function deleteChatToolRuntimeAgent(userId: string, toolAgentId?: string | null) {
  if (!toolAgentId || !UUID_PATTERN.test(toolAgentId)) return;

  await db.delete(agents).where(and(
    eq(agents.id, toolAgentId),
    eq(agents.owner_user_id, userId),
    sql`${agents.slug} like ${`${CHAT_TOOL_RUNTIME_AGENT_SLUG_PREFIX}%`}`,
  ));
}

async function getConversationForUser(chatId: string, userId: string): Promise<ChatConversationRow> {
  const [chat] = await db
    .select()
    .from(chatConversations)
    .where(and(eq(chatConversations.id, chatId), eq(chatConversations.user_id, userId)))
    .limit(1);

  if (!chat) throw new NotFoundError('Ресурс не найден');
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
  return chat as ChatConversationRow;
}

function getHtmlPreviewForMessageRow(message: typeof chatConversationMessages.$inferSelect): {
  title: string | null;
  html: string;
} {
  const rawUsage = (message.usage_json as Record<string, unknown> | null) ?? null;
  const normalized = normalizeAssistantChatPayload(message.content_text, rawUsage);
  const preview = normalized.codingReport?.preview;

  if (!preview || preview.type !== 'html' || !preview.html) {
    throw new NotFoundError('Preview not found');
  }

  return {
    title: preview.title ?? null,
    html: preview.html,
  };
}

function toPublishedLandingResult(
  row: typeof publishedLandings.$inferSelect,
  options: { shareToken: string; messageId: string },
): PublishedLandingResult {
  const urls = buildPublishedLandingUrls(row.subdomain, options.shareToken, options.messageId);
  return {
    id: row.id,
    slug: row.subdomain,
    subdomain: row.subdomain,
    title: row.title ?? null,
    description: null,
    url: urls.url,
    site_url: urls.site_url,
    preview_url: urls.preview_url,
    is_published: row.status === 'active',
    updated_at: row.updated_at ? toIso(row.updated_at) : null,
  };
}

async function getPublishedLandingRowForOwner(chatId: string, messageId: string, userId: string) {
  const chat = await getConversationForUser(chatId, userId);
  const message = await getAssistantMessageForConversation(chat.id, messageId);
  const [landing] = await db
    .select()
    .from(publishedLandings)
    .where(and(
      eq(publishedLandings.conversation_id, chat.id),
      eq(publishedLandings.message_id, message.id),
      eq(publishedLandings.user_id, userId),
    ))
    .limit(1);

  return { chat, message, landing: landing ?? null };
}

async function getConversationMessages(
  chatId: string,
  options?: { sharedToken?: string | null },
): Promise<ConversationMessage[]> {
  const usdToRubRate = await getUsdToRubRate();
  const rows = await db
    .select()
    .from(chatConversationMessages)
    .where(eq(chatConversationMessages.conversation_id, chatId))
    .orderBy(asc(chatConversationMessages.created_at));

  const messages = rows
    .filter((row) => row.role === 'user' || row.role === 'assistant')
    .map((row) => toConversationMessage(row, usdToRubRate));

  const filesByMessageId = await loadGeneratedFilesForMessages(messages.map((message) => message.id), options);
  return messages.map((message) => {
    const generatedFiles = filesByMessageId.get(message.id) ?? [];
    return {
      ...message,
      generated_files: generatedFiles,
      usage: attachGeneratedFilesToUsage(message.usage, generatedFiles),
    };
  });
}

function isConversationMessagePartial(message?: ConversationMessage | null): boolean {
  if (!message || message.role !== 'assistant') return false;
  if (/\[Ответ всё ещё был обрезан по лимиту длины/i.test(message.content)) return true;

  const normalized = normalizeAssistantChatPayload(message.content, message.usage);
  return Boolean(normalized.codingReport?.notes?.some((note) => /незаверш|обрезан|partial|incomplete/i.test(note)));
}

async function buildPendingRunProgressEvents(
  run: {
    id: string;
    status: string;
    started_at: Date;
    completed_at: Date | null;
    error_message: string | null;
  },
  options?: {
    latestAssistantCreatedAt?: string | null;
    latestAssistantPartial?: boolean;
  },
): Promise<PendingRunProgressEvent[]> {
  const events: PendingRunProgressEvent[] = [
    {
      event: 'chat.run.started',
      run_id: run.id,
      label: 'Запускаю выполнение',
      detail: 'Run создан и отправлен в агентный runtime.',
      status: 'running',
      ts: toIso(run.started_at),
    },
  ];

  const toolCalls = await db
    .select({
      tool_call_id: agentRunToolCalls.tool_call_id,
      tool_name: agentRunToolCalls.tool_name,
      tool_input: agentRunToolCalls.tool_input,
      tool_output: agentRunToolCalls.tool_output,
      status: agentRunToolCalls.status,
      duration_ms: agentRunToolCalls.duration_ms,
      error_message: agentRunToolCalls.error_message,
      created_at: agentRunToolCalls.created_at,
    })
    .from(agentRunToolCalls)
    .where(eq(agentRunToolCalls.run_id, run.id))
    .orderBy(asc(agentRunToolCalls.created_at));

  for (const [index, call] of toolCalls.entries()) {
    const step = index + 1;
    events.push({
      event: 'chat.run.tool.started',
      run_id: run.id,
      tool_call_id: call.tool_call_id,
      tool_name: call.tool_name,
      input: call.tool_input as Record<string, unknown>,
      label: `Запущен инструмент ${call.tool_name}`,
      detail: `Шаг ${step}`,
      ts: toIso(call.created_at),
    });

    if (call.status !== 'running' && call.status !== 'pending') {
      events.push({
        event: 'chat.run.tool.finished',
        run_id: run.id,
        tool_call_id: call.tool_call_id,
        tool_name: call.tool_name,
        input: call.tool_input as Record<string, unknown>,
        output: (call.tool_output as Record<string, unknown> | null) ?? (call.error_message ? { error: call.error_message } : null),
        status: call.status,
        duration_ms: call.duration_ms,
        error: call.error_message,
        label: call.status === 'success'
          ? `Инструмент ${call.tool_name} завершён успешно`
          : `Инструмент ${call.tool_name} завершился с ошибкой`,
        detail: typeof call.duration_ms === 'number'
          ? `Шаг ${step} завершён за ${call.duration_ms} мс`
          : `Шаг ${step} завершён`,
        ts: toIso(call.created_at),
      });
    }
  }

  if (toolCalls.length > 0 && run.status !== 'tool_executing') {
    const lastTool = toolCalls[toolCalls.length - 1];
    events.push({
      event: 'chat.run.status',
      run_id: run.id,
      status: run.status === 'continuing' ? 'continuing' : 'running',
      label: 'Обрабатываю результаты инструментов',
      detail: 'Собираю данные от инструментов в единый финальный ответ.',
      tool_name: lastTool.tool_name,
      ts: toIso(lastTool.created_at),
    });
  }

  if (options?.latestAssistantCreatedAt) {
    events.push({
      event: 'chat.message.completed',
      run_id: run.id,
      status: options.latestAssistantPartial ? 'partial' : 'completed',
      label: options.latestAssistantPartial ? 'Частичный результат сохранён' : 'Ответ сохранён',
      detail: options.latestAssistantPartial
        ? 'Часть результата уже есть в чате, run мог продолжать работу дальше.'
        : 'Сообщение ассистента сохранено в чате.',
      ts: options.latestAssistantCreatedAt,
    });
  }

  if (run.completed_at) {
    events.push({
      event: run.status === 'failed' ? 'chat.run.failed' : 'chat.run.completed',
      run_id: run.id,
      status: run.status,
      label: run.status === 'failed' ? 'Выполнение завершилось с ошибкой' : 'Выполнение завершено',
      detail: run.error_message ?? undefined,
      error: run.error_message,
      ts: toIso(run.completed_at),
    });
  }

  return events.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
}

async function getConversationRuntimeState(chat: ChatConversationRow, messages: ConversationMessage[]): Promise<SharedPendingRunState | null> {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user') ?? null;
  if (!lastUserMessage) return null;

  const lastUserAt = new Date(lastUserMessage.created_at);
  if (Number.isNaN(lastUserAt.getTime())) return null;

  const assistantMessagesAfterLastUser = messages.filter((message) => (
    message.role === 'assistant' && Date.parse(message.created_at) >= lastUserAt.getTime()
  ));
  const latestAssistantMessage = assistantMessagesAfterLastUser[assistantMessagesAfterLastUser.length - 1] ?? null;
  const latestRunIdFromMessages = [...assistantMessagesAfterLastUser]
    .reverse()
    .find((message) => Boolean(message.run_id))
    ?.run_id ?? null;
  const toolSettings = extractChatToolSettings(chat.settings_json);
  const runtimeAgentId = chat.agent_id ?? toolSettings.tool_agent_id;

  let latestRun: {
    id: string;
    status: string;
    started_at: Date;
    completed_at: Date | null;
    error_message: string | null;
  } | undefined;

  if (latestRunIdFromMessages) {
    [latestRun] = await db
      .select({
        id: agentRuns.id,
        status: agentRuns.status,
        started_at: agentRuns.started_at,
        completed_at: agentRuns.completed_at,
        error_message: agentRuns.error_message,
      })
      .from(agentRuns)
      .where(eq(agentRuns.id, latestRunIdFromMessages))
      .limit(1);
  }

  if (!latestRun && runtimeAgentId) {
    [latestRun] = await db
      .select({
        id: agentRuns.id,
        status: agentRuns.status,
        started_at: agentRuns.started_at,
        completed_at: agentRuns.completed_at,
        error_message: agentRuns.error_message,
      })
      .from(agentRuns)
      .where(and(
        eq(agentRuns.user_id, chat.user_id),
        eq(agentRuns.agent_id, runtimeAgentId),
        sql`${agentRuns.started_at} >= ${lastUserAt.toISOString()}`,
      ))
      .orderBy(desc(agentRuns.started_at))
      .limit(1);
  }

  if (!latestRun) {
    if (!latestAssistantMessage) return null;

    const latestAssistantCreatedAt = latestAssistantMessage.created_at;
    const partialWithoutRun = isConversationMessagePartial(latestAssistantMessage);

    return {
      run_id: latestAssistantMessage.run_id ?? latestAssistantMessage.id,
      status: 'completed',
      started_at: lastUserMessage.created_at,
      completed_at: latestAssistantCreatedAt,
      result_status: partialWithoutRun ? 'partial' : 'success',
      label: partialWithoutRun ? 'Результат сохранён частично' : 'Ответ сохранён в чате',
      detail: partialWithoutRun
        ? 'Итоговый ответ сохранился не полностью, но часть результата уже есть в чате.'
        : 'Run уже завершён, и результат сохранён в чат.',
      tool_name: null,
      error: null,
      is_terminal: true,
      is_partial: partialWithoutRun,
    };
  }

  const [latestToolCall] = await db
    .select({
      tool_name: agentRunToolCalls.tool_name,
      status: agentRunToolCalls.status,
      error_message: agentRunToolCalls.error_message,
      created_at: agentRunToolCalls.created_at,
    })
    .from(agentRunToolCalls)
    .where(eq(agentRunToolCalls.run_id, latestRun.id))
    .orderBy(desc(agentRunToolCalls.created_at))
    .limit(1);

  const startedAtIso = toIso(latestRun.started_at);
  const completedAtIso = latestRun.completed_at ? toIso(latestRun.completed_at) : null;
  const latestAssistantForRun = latestRunIdFromMessages && latestAssistantMessage?.run_id === latestRun.id
    ? latestAssistantMessage
    : (assistantMessagesAfterLastUser.find((message) => message.run_id === latestRun.id) ?? latestAssistantMessage);
  const hasAssistantForRun = Boolean(latestAssistantForRun);
  const isPartialResult = isConversationMessagePartial(latestAssistantForRun);
  const progressEvents = await buildPendingRunProgressEvents(latestRun, {
    latestAssistantCreatedAt: latestAssistantForRun?.created_at ?? null,
    latestAssistantPartial: isPartialResult,
  });
  const latestAssistantObservedAtMs = latestAssistantForRun?.created_at ? Date.parse(latestAssistantForRun.created_at) : Number.NaN;
  const latestToolObservedAtMs = latestToolCall?.created_at ? new Date(latestToolCall.created_at).getTime() : Number.NaN;
  const startedAtMs = new Date(latestRun.started_at).getTime();
  const lastObservedActivityMs = Math.max(
    Number.isNaN(startedAtMs) ? 0 : startedAtMs,
    Number.isNaN(latestAssistantObservedAtMs) ? 0 : latestAssistantObservedAtMs,
    Number.isNaN(latestToolObservedAtMs) ? 0 : latestToolObservedAtMs,
  );
  const isStalePendingRun = !latestRun.completed_at
    && lastObservedActivityMs > 0
    && (Date.now() - lastObservedActivityMs) > STALE_PENDING_RUN_MS;

  if (isStalePendingRun) {
    return {
      run_id: latestRun.id,
      status: 'failed',
      started_at: startedAtIso,
      completed_at: completedAtIso,
      result_status: hasAssistantForRun ? 'failed_partial' : 'failed_no_result',
      label: hasAssistantForRun ? 'Run завис после частичного результата' : 'Run завис без финального ответа',
      detail: hasAssistantForRun
        ? 'После частичного результата больше не было новых обновлений. Считаю run зависшим и завершаю его как неуспешный.'
        : 'Новых обновлений по run слишком долго нет. Считаю его зависшим и завершаю как неуспешный.',
      tool_name: latestToolCall?.tool_name ?? null,
      error: latestRun.error_message ?? 'STALE_PENDING_RUN',
      is_terminal: true,
      is_partial: hasAssistantForRun,
      events: progressEvents,
    };
  }

  if (latestRun.status === 'failed') {
    return {
      run_id: latestRun.id,
      status: latestRun.status,
      started_at: startedAtIso,
      completed_at: completedAtIso,
      result_status: hasAssistantForRun ? 'failed_partial' : 'failed_no_result',
      label: hasAssistantForRun ? 'Выполнение завершилось с ошибкой, сохранился частичный результат' : 'Ответ не получен',
      detail: latestRun.error_message?.trim() || (
        hasAssistantForRun
          ? 'Часть ответа успела сохраниться в чат, но run завершился с ошибкой.'
          : 'Во время выполнения произошла ошибка.'
      ),
      tool_name: latestToolCall?.tool_name ?? null,
      error: latestRun.error_message ?? null,
      is_terminal: true,
      is_partial: hasAssistantForRun,
      events: progressEvents,
    };
  }

  if (latestRun.status === 'completed') {
    const completedAtMs = latestRun.completed_at ? new Date(latestRun.completed_at).getTime() : Date.now();
    if (!hasAssistantForRun && (Date.now() - completedAtMs) <= 30_000) {
      return {
        run_id: latestRun.id,
        status: 'finalizing',
        started_at: startedAtIso,
        completed_at: completedAtIso,
        label: 'Ответ почти готов',
        detail: 'Финализирую сообщение и сохраняю результат в чат.',
        tool_name: latestToolCall?.tool_name ?? null,
        error: null,
        is_terminal: false,
        is_partial: false,
        events: progressEvents,
      };
    }

    if (!hasAssistantForRun) {
      return null;
    }

    return {
      run_id: latestRun.id,
      status: latestRun.status,
      started_at: startedAtIso,
      completed_at: completedAtIso,
      result_status: isPartialResult ? 'partial' : 'success',
      label: isPartialResult ? 'Результат сохранён частично' : 'Ответ сохранён в чате',
      detail: isPartialResult
        ? 'Run завершился, но итоговый ответ сохранился не полностью.'
        : 'Run завершился и результат уже сохранён в чат.',
      tool_name: latestToolCall?.tool_name ?? null,
      error: null,
      is_terminal: true,
      is_partial: isPartialResult,
      events: progressEvents,
    };
  }

  if (latestRun.status === 'tool_executing') {
    return {
      run_id: latestRun.id,
      status: latestRun.status,
      started_at: startedAtIso,
      completed_at: completedAtIso,
      label: 'Инструменты работают',
      detail: latestToolCall?.tool_name
        ? `Сейчас выполняется или только что обновился инструмент ${latestToolCall.tool_name}.`
        : 'Собираю данные через инструменты.',
      tool_name: latestToolCall?.tool_name ?? null,
      error: latestToolCall?.error_message ?? null,
      is_terminal: false,
      is_partial: hasAssistantForRun,
      events: progressEvents,
    };
  }

  if (latestRun.status === 'continuing') {
    return {
      run_id: latestRun.id,
      status: latestRun.status,
      started_at: startedAtIso,
      completed_at: completedAtIso,
      label: 'Обрабатываю результаты инструментов',
      detail: hasAssistantForRun
        ? 'Частичный результат уже сохранён. Продолжаю дособирать финальный ответ.'
        : 'Собираю найденные данные в единый финальный ответ.',
      tool_name: latestToolCall?.tool_name ?? null,
      error: null,
      is_terminal: false,
      is_partial: hasAssistantForRun,
      events: progressEvents,
    };
  }

  return {
    run_id: latestRun.id,
    status: latestRun.status,
    started_at: startedAtIso,
    completed_at: completedAtIso,
    label: 'Агент работает',
    detail: 'Анализирую задачу и готовлю следующие шаги.',
    tool_name: latestToolCall?.tool_name ?? null,
    error: null,
    is_terminal: false,
    is_partial: hasAssistantForRun,
    events: progressEvents,
  };
}

function extractUsageAttachments(value: Record<string, unknown> | null | undefined): ChatAttachmentMeta[] {
  if (!value || !Array.isArray((value as { attachments?: unknown[] }).attachments)) return [];
  return ((value as { attachments: unknown[] }).attachments ?? [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => item as ChatAttachmentMeta);
}

function buildGeneratedFileDownloadUrl(
  conversationId: string,
  messageId: string,
  fileId: string,
  options?: { sharedToken?: string | null },
): string {
  if (options?.sharedToken) {
    return `/api/shared/chats/${options.sharedToken}/messages/${messageId}/files/${fileId}/download`;
  }

  return `/api/chats/${conversationId}/messages/${messageId}/files/${fileId}/download`;
}

function toGeneratedFileMeta(
  row: typeof chatMessageFiles.$inferSelect,
  options?: { sharedToken?: string | null },
): ChatGeneratedFileMeta {
  const kind: ChatGeneratedFileMeta['kind'] = row.kind === 'image' || row.kind === 'text' || row.kind === 'file'
    ? row.kind
    : 'file';

  return {
    id: row.id,
    storage_filename: row.storage_filename,
    original_name: row.original_name,
    mime_type: row.mime_type,
    size: row.size,
    kind,
    text_preview: row.text_preview ?? undefined,
    tool_call_id: row.tool_call_id ?? null,
    url: buildGeneratedFileDownloadUrl(row.conversation_id, row.message_id, row.id, options),
    created_at: toIso(row.created_at),
  };
}

function attachGeneratedFilesToUsage(
  usage: Record<string, unknown> | null,
  files: ChatGeneratedFileMeta[],
): Record<string, unknown> | null {
  if (files.length === 0) return usage;

  const publicFiles = files.map(({ storage_filename: _storageFilename, ...file }) => file);
  const nextUsage: Record<string, unknown> = usage ? { ...usage } : {};
  nextUsage.generated_files = publicFiles;
  nextUsage.artifacts = {
    ...(
      nextUsage.artifacts && typeof nextUsage.artifacts === 'object' && !Array.isArray(nextUsage.artifacts)
        ? nextUsage.artifacts as Record<string, unknown>
        : {}
    ),
    files: publicFiles,
  };
  return nextUsage;
}

function stripGeneratedFilesFromUsage(
  usage: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!usage) return null;
  const nextUsage: Record<string, unknown> = { ...usage };
  delete nextUsage.generated_files;

  if (nextUsage.artifacts && typeof nextUsage.artifacts === 'object' && !Array.isArray(nextUsage.artifacts)) {
    const artifacts = { ...(nextUsage.artifacts as Record<string, unknown>) };
    delete artifacts.files;
    if (Object.keys(artifacts).length > 0) {
      nextUsage.artifacts = artifacts;
    } else {
      delete nextUsage.artifacts;
    }
  }

  return nextUsage;
}

function extractGeneratedFilesFromToolResult(
  value: Record<string, unknown> | null | undefined,
  toolCallId: string,
): GeneratedChatFileArtifact[] {
  if (!value || !Array.isArray((value as { files?: unknown[] }).files)) return [];

  return ((value as { files: unknown[] }).files ?? [])
    .map((item): GeneratedChatFileArtifact | null => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const storageFilename = typeof row.storage_filename === 'string'
        ? path.basename(row.storage_filename)
        : (typeof row.filename === 'string' ? path.basename(row.filename) : '');
      const originalName = typeof row.original_name === 'string' && row.original_name.trim()
        ? row.original_name.trim().slice(0, 500)
        : storageFilename;
      const mimeType = typeof row.mime_type === 'string' && row.mime_type.trim()
        ? row.mime_type.trim().slice(0, 200)
        : getAttachmentMimeType(originalName || storageFilename);
      const kind: GeneratedChatFileArtifact['kind'] = row.kind === 'image' || row.kind === 'text' || row.kind === 'file'
        ? row.kind
        : (isImageMime(mimeType) ? 'image' : (isTextMime(mimeType) ? 'text' : 'file'));
      const size = typeof row.size === 'number' && Number.isFinite(row.size) ? Math.max(0, Math.floor(row.size)) : 0;
      const sha256 = typeof row.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(row.sha256.trim())
        ? row.sha256.trim().toLowerCase()
        : undefined;
      if (!storageFilename || !originalName || size <= 0) return null;
      return {
        storage_filename: storageFilename,
        original_name: originalName,
        mime_type: mimeType,
        size,
        kind,
        sha256,
        text_preview: typeof row.text_preview === 'string' && row.text_preview.trim()
          ? row.text_preview.trim().slice(0, 400)
          : undefined,
        tool_call_id: toolCallId,
      };
    })
    .filter((item): item is GeneratedChatFileArtifact => Boolean(item));
}

function buildGeneratedFileArtifactDedupeKey(file: GeneratedChatFileArtifact): string {
  const contentKey = file.sha256
    ? `sha:${file.sha256}`
    : `preview:${file.text_preview ?? ''}`;
  return [
    file.original_name.trim().toLowerCase(),
    file.mime_type.trim().toLowerCase(),
    String(file.size),
    contentKey,
  ].join('\u0000');
}

async function persistGeneratedFilesForMessage(input: {
  conversationId: string;
  messageId: string;
  userId: string;
  runId: string | null;
  files: GeneratedChatFileArtifact[];
}): Promise<ChatGeneratedFileMeta[]> {
  if (input.files.length === 0) return [];

  const verifiedFiles: GeneratedChatFileArtifact[] = [];
  const seenFileKeys = new Set<string>();
  for (const file of input.files) {
    try {
      const fileStats = await stat(safeGeneratedFilePath(file.storage_filename));
      if (!fileStats.isFile()) continue;
      const verifiedFile = {
        ...file,
        size: fileStats.size,
      };
      const dedupeKey = buildGeneratedFileArtifactDedupeKey(verifiedFile);
      if (seenFileKeys.has(dedupeKey)) continue;
      seenFileKeys.add(dedupeKey);
      verifiedFiles.push(verifiedFile);
    } catch {
    }
  }

  if (verifiedFiles.length === 0) return [];

  const inserted = await db.insert(chatMessageFiles).values(
    verifiedFiles.map((file) => ({
      conversation_id: input.conversationId,
      message_id: input.messageId,
      user_id: input.userId,
      run_id: input.runId,
      tool_call_id: file.tool_call_id ?? null,
      storage_filename: file.storage_filename,
      original_name: file.original_name,
      mime_type: file.mime_type,
      kind: file.kind,
      size: file.size,
      text_preview: file.text_preview ?? null,
    })),
  ).returning();

  return inserted.map((row) => toGeneratedFileMeta(row));
}

async function loadGeneratedFilesForMessages(
  messageIds: string[],
  options?: { sharedToken?: string | null },
): Promise<Map<string, ChatGeneratedFileMeta[]>> {
  const normalizedIds = messageIds.filter((id) => UUID_PATTERN.test(id));
  if (normalizedIds.length === 0) return new Map();

  const rows = await db
    .select()
    .from(chatMessageFiles)
    .where(inArray(chatMessageFiles.message_id, normalizedIds))
    .orderBy(asc(chatMessageFiles.created_at));

  const filesByMessageId = new Map<string, ChatGeneratedFileMeta[]>();
  for (const row of rows) {
    const list = filesByMessageId.get(row.message_id) ?? [];
    list.push(toGeneratedFileMeta(row, options));
    filesByMessageId.set(row.message_id, list);
  }

  return filesByMessageId;
}

function sanitizeImportedDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function buildChatTransferFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'chat'}-${Date.now()}.llmchat.json`;
}

function getExtensionForImportedAttachment(attachment: ChatTransferAttachment): string {
  const originalExt = path.extname(attachment.original_name || attachment.filename).toLowerCase();
  if (originalExt) return originalExt;

  switch (attachment.mime_type) {
    case 'image/png': return '.png';
    case 'image/jpeg': return '.jpg';
    case 'image/webp': return '.webp';
    case 'image/gif': return '.gif';
    case 'text/markdown': return '.md';
    case 'text/plain': return '.txt';
    case 'application/json': return '.json';
    case 'text/html': return '.html';
    default: return '.bin';
  }
}

function deriveImportedGeneralModel(
  messages: ChatTransferMessage[],
  preferredModelExternalId?: string | null,
): string | null {
  if (preferredModelExternalId?.trim()) {
    return normalizeOpenRouterModelId(preferredModelExternalId.trim());
  }

  const counts = new Map<string, number>();
  for (const message of messages) {
    const model = typeof message.usage?.model === 'string' ? message.usage.model.trim() : '';
    if (!model) continue;
    counts.set(model, (counts.get(model) ?? 0) + 1);
  }

  const winner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return winner ? normalizeOpenRouterModelId(winner) : DEFAULT_GENERAL_MODEL;
}

async function findImportTargetAgent(
  userId: string,
  userRole: string | undefined,
  agentName: string | null,
  agentModelExternalId: string | null,
): Promise<string | null> {
  if (!agentName?.trim()) return null;

  const visibleAgents = await listChatAgents(userId, userRole);
  const normalizedName = agentName.trim().toLowerCase();
  const normalizedModel = normalizeModelLookupKey(agentModelExternalId);

  const exact = visibleAgents.find((agent) => (
    agent.name.trim().toLowerCase() === normalizedName
    && normalizeModelLookupKey(agent.model_external_id) === normalizedModel
  ));
  if (exact) return exact.id;

  const byName = visibleAgents.find((agent) => agent.name.trim().toLowerCase() === normalizedName);
  return byName?.id ?? null;
}

async function buildChatTransferBundlePayload(
  chat: ChatConversationRow,
  messages: ConversationMessage[],
): Promise<ChatTransferBundlePayload> {
  let agentName: string | null = null;
  let agentModelExternalId: string | null = null;

  if (chat.agent_id) {
    const [agentRow] = await db
      .select({
        name: agents.name,
        runtime_config: agentVersions.runtime_config,
        version_model_external_id: aiModels.external_model_id,
      })
      .from(agents)
      .leftJoin(agentVersions, eq(agentVersions.id, agents.current_version_id))
      .leftJoin(aiModels, eq(aiModels.id, agentVersions.model_id))
      .where(eq(agents.id, chat.agent_id))
      .limit(1);

    agentName = agentRow?.name ?? null;
    agentModelExternalId = resolveAgentModelExternalId(
      agentRow?.runtime_config as Record<string, unknown> | null,
      agentRow?.version_model_external_id ?? null,
    );
  }

  const attachmentMap = new Map<string, ChatTransferAttachment>();

  for (const message of messages) {
    const attachments = extractUsageAttachments(message.usage);
    for (const attachment of attachments) {
      if (!attachment.filename || attachmentMap.has(attachment.filename)) continue;

      try {
        const buffer = await readFile(safeAttachmentPath(attachment.filename));
        attachmentMap.set(attachment.filename, {
          filename: attachment.filename,
          original_name: attachment.original_name,
          mime_type: attachment.mime_type,
          kind: attachment.kind,
          size: attachment.size,
          data_base64: buffer.toString('base64'),
        });
      } catch {
      }
    }
  }

  return {
    schema_version: 1,
    exported_at: new Date().toISOString(),
    chat: {
      title: chat.title,
      mode: chat.mode,
      model_external_id: chat.model_external_id ?? null,
      agent_name: agentName,
      agent_model_external_id: agentModelExternalId,
    },
    messages: messages.map((message) => ({
      role: message.role,
      content: message.content,
      usage: stripGeneratedFilesFromUsage(message.usage),
      project_run_count: message.project_run_count,
      latency_ms: message.latency_ms,
      created_at: message.created_at,
    })),
    attachments: [...attachmentMap.values()],
  };
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

  const mentionsExistingPreviewSurface = /(preview|превью|лендинг|страниц|странице|сайт|site|hero|html|css|js|блок|кнопк|заголов|стил|верстк|разметк)/i.test(text);
  const mentionsStructuralBreakage = /(незакрыт|не закрыт|оборван|обрыв|слом|ломан|бит|broken|невалид|invalid|ошибк|баг|артефакт|криво|съех|разъех|поеха|обреза|truncat|обрезан|закрой|закрывающ|хвост|не работает|не отображ|не груз|не видно|пропал|пропала)/i.test(text);
  const mentionsMarkupTags = /<\/?(?:style|script|div|section|main|body|html|head)\b/i.test(text);

  if ((mentionsExistingPreviewSurface && mentionsStructuralBreakage) || (mentionsStructuralBreakage && mentionsMarkupTags)) {
    return true;
  }

  return /(preview|превью|лендинг|страниц|шапк|hero|html|блок|кнопк|заголов|надпись)/i.test(text)
    && /(исправ|поправ|подвин|сдвин|выровн|центр|замен|измени|доработ|отредакт)/i.test(text);
}

function buildStrictPreviewEditInstruction(options: StrictPreviewEditOptions): string {
  return [
    'Режим точечной правки preview.',
    'Пользователь просит ИЗМЕНИТЬ уже существующий preview, а не сгенерировать новый дизайн с нуля.',
    'Используй последний HTML preview как базовую версию.',
    'Сохраняй без изменений все секции, структуру, классы, id, тексты, стили, анимации и layout, которые не относятся к запросу.',
    'Меняй только то, что явно попросил пользователь.',
    'Если задачу можно решить 1-2 правками CSS или маленькой заменой текста, делай только это.',
    'Не переписывай весь HTML, не делай редизайн и не улучшай посторонние части страницы.',
    'Если меняешь текст, меняй только нужный текст. Если меняешь позиционирование, старайся ограничиться точечными стилями.',
    'Нужна минимальная и точечная правка.',
    'Если пользователь описывает сломанную или оборванную HTML/CSS/JS-разметку, исправь текущий preview и верни ПОЛНУЮ обновлённую версию preview.html целиком.',
    'Не отвечай хвостом файла, diff-ом, патчем или продолжением с места обрыва.',
    'Не выдумывай project.files, index.html.tail.html и не описывай несуществующий обрыв, если у тебя уже есть полный текущий preview.',
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
  const attachments = extractUsageAttachments(normalizedUsage);

  return {
    id: row.id,
    role: row.role as 'user' | 'assistant',
    content: normalized.content,
    run_id: row.run_id ?? null,
    usage: attachUsdToRubRate(normalizedUsage, usdToRubRate),
    attachments,
    generated_files: [],
    project_run_count: row.project_run_count ?? 0,
    latency_ms: row.latency_ms ?? null,
    created_at: toIso(row.created_at),
  };
}

async function cloneConversationAttachments(
  messages: ChatTransferMessage[],
): Promise<{
  messages: ChatTransferMessage[];
}> {
  const attachmentMetaMap = new Map<string, ChatAttachmentMeta>();

  for (const message of messages) {
    const usageAttachments = extractUsageAttachments(message.usage);
    for (const attachment of usageAttachments) {
      const sourceFilename = typeof attachment.filename === 'string' ? attachment.filename.trim() : '';
      if (!sourceFilename || attachmentMetaMap.has(sourceFilename)) continue;

      try {
        const buffer = await readFile(safeAttachmentPath(sourceFilename));
        const ext = path.extname(attachment.original_name || sourceFilename) || path.extname(sourceFilename) || '.bin';
        const filename = `${uuidv4()}${ext.toLowerCase()}`;
        await writeFile(safeAttachmentPath(filename), buffer);

        attachmentMetaMap.set(sourceFilename, {
          filename,
          original_name: attachment.original_name || sourceFilename,
          mime_type: attachment.mime_type || getAttachmentMimeType(filename),
          size: typeof attachment.size === 'number' && attachment.size > 0 ? attachment.size : buffer.length,
          kind: attachment.kind === 'image' || attachment.kind === 'text' || attachment.kind === 'file'
            ? attachment.kind
            : (isImageMime(attachment.mime_type) ? 'image' : (isTextMime(attachment.mime_type) ? 'text' : 'file')),
          url: `/uploads/chat/${filename}`,
          text_preview: attachment.text_preview,
        });
      } catch {
      }
    }
  }

  return {
    messages: messages.map((message) => {
      if (!message.usage) return message;
      const usageCopy: Record<string, unknown> = { ...message.usage };
      const usageAttachments = extractUsageAttachments(message.usage);
      if (usageAttachments.length > 0) {
        usageCopy.attachments = usageAttachments
          .map((attachment) => attachmentMetaMap.get(attachment.filename) ?? null)
          .filter((attachment): attachment is ChatAttachmentMeta => Boolean(attachment));
      }
      return {
        ...message,
        usage: stripGeneratedFilesFromUsage(usageCopy),
      };
    }),
  };
}

async function cloneChatFromMessages(
  userId: string,
  userRole: string | undefined,
  sourceChat: ChatConversationRow,
  messages: ChatTransferMessage[],
): Promise<ConversationListItem> {
  const sourceToolSettings = extractChatToolSettings(sourceChat.settings_json);
  const sourceAgentMeta = sourceChat.agent_id
    ? await getAgentChatMeta(sourceChat.agent_id)
    : { agent_name: null, agent_model_external_id: null, agent_model_label: null, agent_chat_description: null, agent_starter_prompts: [] };

  let nextMode: ChatMode = sourceChat.mode;
  let agentId: string | null = null;
  let modelExternalId: string | null = null;

  if (sourceChat.mode === 'agent') {
    agentId = await findImportTargetAgent(
      userId,
      userRole,
      sourceAgentMeta.agent_name,
      sourceAgentMeta.agent_model_external_id,
    );
    if (!agentId) {
      nextMode = 'general';
      modelExternalId = deriveImportedGeneralModel(messages, sourceAgentMeta.agent_model_external_id ?? sourceChat.model_external_id);
    }
  } else {
    modelExternalId = deriveImportedGeneralModel(messages, sourceChat.model_external_id);
  }

  const cloned = await cloneConversationAttachments(messages);
  const createdAtFallback = new Date();
  const orderedMessages = cloned.messages
    .map((message, index) => ({
      ...message,
      createdAtDate: sanitizeImportedDate(
        message.created_at,
        new Date(createdAtFallback.getTime() + index * 1000),
      ),
    }))
    .sort((a, b) => a.createdAtDate.getTime() - b.createdAtDate.getTime());
  const lastMessageAt = orderedMessages[orderedMessages.length - 1]?.createdAtDate ?? createdAtFallback;
  const shareToken = uuidv4().replace(/-/g, '').slice(0, 16);
  const clonedTitleBase = sourceChat.title.trim() || 'Новый чат';
  const clonedTitle = clonedTitleBase.toLowerCase().startsWith('копия ')
    ? clonedTitleBase
    : `Копия ${clonedTitleBase}`;
  const clonedToolIds = nextMode === 'general'
    ? await mergeAutoChatToolIds(sourceChat.mode === 'general' ? sourceToolSettings.tool_ids : [])
    : [];

  const [chat] = await db.insert(chatConversations).values({
    user_id: userId,
    agent_id: nextMode === 'agent' ? agentId : null,
    mode: nextMode,
    title: clonedTitle.slice(0, 500),
    model_external_id: nextMode === 'general' ? (modelExternalId ?? DEFAULT_GENERAL_MODEL) : null,
    system_prompt: sourceChat.system_prompt ?? null,
    access: 'private',
    access_identifiers: [],
    share_token: shareToken,
    settings_json: buildChatSettingsJson(null, {
      tool_ids: clonedToolIds,
      tool_agent_id: null,
      note: extractChatNote(sourceChat.settings_json),
    }),
    is_clone: true,
    cloned_from_conversation_id: sourceChat.id,
    cloned_at: createdAtFallback,
    last_message_at: lastMessageAt,
    created_at: createdAtFallback,
    updated_at: new Date(),
  }).returning();

  if (orderedMessages.length > 0) {
    await db.insert(chatConversationMessages).values(
      orderedMessages.map((message) => ({
        conversation_id: chat.id,
        role: message.role,
        content_text: message.content,
        run_id: null,
        usage_json: message.usage ?? null,
        project_run_count: message.project_run_count ?? 0,
        latency_ms: message.latency_ms ?? null,
        created_at: message.createdAtDate,
      })),
    );
  }

  if (nextMode === 'general' && clonedToolIds.length > 0) {
    const toolAgentId = await ensureChatToolRuntimeAgent(
      { id: chat.id, title: chat.title },
      userId,
      clonedToolIds,
      chat.model_external_id ?? DEFAULT_GENERAL_MODEL,
      chat.system_prompt,
    );

    await db.update(chatConversations)
      .set({
        settings_json: buildChatSettingsJson(chat.settings_json, {
          tool_ids: clonedToolIds,
          tool_agent_id: toolAgentId,
          note: extractChatNote(sourceChat.settings_json),
        }),
        updated_at: new Date(),
      })
      .where(eq(chatConversations.id, chat.id));
  }

  const [finalChat] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, chat.id))
    .limit(1);

  const agentMeta = finalChat?.mode === 'agent'
    ? await getAgentChatMeta(finalChat.agent_id ?? null)
    : null;
  const effectiveModelLabel = finalChat?.mode === 'agent'
    ? (agentMeta?.agent_model_label ?? null)
    : getModelDisplayLabel(finalChat?.model_external_id ?? null);

  return {
    id: chat.id,
    title: finalChat?.title ?? chat.title,
    note: extractChatNote(finalChat?.settings_json ?? chat.settings_json),
    mode: (finalChat?.mode ?? chat.mode) as ChatMode,
    agent_id: finalChat?.agent_id ?? null,
    agent_name: agentMeta?.agent_name ?? null,
    agent_model_external_id: agentMeta?.agent_model_external_id ?? null,
    agent_model_label: agentMeta?.agent_model_label ?? null,
    effective_model_label: effectiveModelLabel,
    model_external_id: finalChat?.model_external_id ?? null,
    access: 'private',
    access_identifiers: [],
    share_token: finalChat?.share_token ?? chat.share_token ?? null,
    message_count: orderedMessages.length,
    last_message_preview: orderedMessages[orderedMessages.length - 1]?.content.slice(0, 160) ?? null,
    pending_run: null,
    pinned_at: null,
    last_message_at: toIso(finalChat?.last_message_at ?? lastMessageAt),
    created_at: toIso(finalChat?.created_at ?? createdAtFallback),
    updated_at: toIso(finalChat?.updated_at ?? new Date()),
    has_active_deployment: false,
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

async function incrementProjectRunCount(messageId: string): Promise<number> {
  const [row] = await db.update(chatConversationMessages)
    .set({ project_run_count: sql`${chatConversationMessages.project_run_count} + 1` })
    .where(eq(chatConversationMessages.id, messageId))
    .returning({ project_run_count: chatConversationMessages.project_run_count });

  return row?.project_run_count ?? 0;
}

async function registerConversationView(
  chat: Pick<ChatConversationRow, 'id' | 'user_id'>,
  viewerUserId?: string | null,
  viewerKey?: string | null,
) {
  if (!viewerKey) return;
  if (chat.user_id === viewerUserId) return;

  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);

  await db.transaction(async (tx) => {
    await tx.update(chatConversations)
      .set({ total_view_count: sql`${chatConversations.total_view_count} + 1` })
      .where(eq(chatConversations.id, chat.id));

    const inserted = await tx.insert(chatConversationViewers)
      .values({
        conversation_id: chat.id,
        viewer_key: viewerKey,
        view_count: 1,
        first_viewed_at: now,
        last_viewed_at: now,
      })
      .onConflictDoNothing({
        target: [chatConversationViewers.conversation_id, chatConversationViewers.viewer_key],
      })
      .returning({ id: chatConversationViewers.id });

    if (inserted.length > 0) {
      await tx.update(chatConversations)
        .set({ unique_view_count: sql`${chatConversations.unique_view_count} + 1` })
        .where(eq(chatConversations.id, chat.id));

      await tx.insert(chatConversationDailyViews)
        .values({
          conversation_id: chat.id,
          day: dayKey,
          total_views: 1,
          unique_views: 1,
          created_at: now,
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: [chatConversationDailyViews.conversation_id, chatConversationDailyViews.day],
          set: {
            total_views: sql`${chatConversationDailyViews.total_views} + 1`,
            unique_views: sql`${chatConversationDailyViews.unique_views} + 1`,
            updated_at: now,
          },
        });

      return;
    }

    await tx.update(chatConversationViewers)
      .set({
        view_count: sql`${chatConversationViewers.view_count} + 1`,
        last_viewed_at: now,
      })
      .where(and(
        eq(chatConversationViewers.conversation_id, chat.id),
        eq(chatConversationViewers.viewer_key, viewerKey),
      ));

    await tx.insert(chatConversationDailyViews)
      .values({
        conversation_id: chat.id,
        day: dayKey,
        total_views: 1,
        unique_views: 0,
        created_at: now,
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: [chatConversationDailyViews.conversation_id, chatConversationDailyViews.day],
        set: {
          total_views: sql`${chatConversationDailyViews.total_views} + 1`,
          updated_at: now,
        },
      });
  });
}

function emptyReactionCounts(): Record<ChatReactionType, number> {
  return {
    heart: 0,
    thumbs_up: 0,
    thumbs_down: 0,
    laugh: 0,
    smile: 0,
    meh: 0,
  };
}

async function getGalleryReactionState(chatId: string, viewerUserId?: string | null): Promise<{
  reaction_counts: Record<ChatReactionType, number>;
  my_reaction: ChatReactionType | null;
}> {
  const rows = await db
    .select({
      reaction_type: chatConversationReactions.reaction_type,
      user_id: chatConversationReactions.user_id,
    })
    .from(chatConversationReactions)
    .where(eq(chatConversationReactions.conversation_id, chatId));

  const reactionCounts = emptyReactionCounts();
  let myReaction: ChatReactionType | null = null;

  for (const row of rows) {
    const reactionType = row.reaction_type as ChatReactionType;
    if (CHAT_REACTION_TYPES.includes(reactionType)) {
      reactionCounts[reactionType] += 1;
      if (viewerUserId && row.user_id === viewerUserId) {
        myReaction = reactionType;
      }
    }
  }

  return {
    reaction_counts: reactionCounts,
    my_reaction: myReaction,
  };
}

async function getAgentChatMeta(agentId: string | null): Promise<{
  agent_name: string | null;
  agent_model_external_id: string | null;
  agent_model_label: string | null;
  agent_chat_description: string | null;
  agent_starter_prompts: string[];
  agent_system_prompt: string | null;
  agent_developer_prompt: string | null;
  agent_runtime_config: Record<string, unknown> | null;
  agent_tool_config: Record<string, unknown> | null;
}> {
  if (!agentId) {
    return {
      agent_name: null,
      agent_model_external_id: null,
      agent_model_label: null,
      agent_chat_description: null,
      agent_starter_prompts: [],
      agent_system_prompt: null,
      agent_developer_prompt: null,
      agent_runtime_config: null,
      agent_tool_config: null,
    };
  }

  const [row] = await db
    .select({
      slug: agents.slug,
      name: agents.name,
      description: agents.description,
      system_prompt: agentVersions.system_prompt,
      developer_prompt: agentVersions.developer_prompt,
      runtime_config: agentVersions.runtime_config,
      tool_config: agentVersions.tool_config,
      version_model_external_id: aiModels.external_model_id,
    })
    .from(agents)
    .leftJoin(agentVersions, eq(agentVersions.id, agents.current_version_id))
    .leftJoin(aiModels, eq(aiModels.id, agentVersions.model_id))
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!row) {
    return {
      agent_name: null,
      agent_model_external_id: null,
      agent_model_label: null,
      agent_chat_description: null,
      agent_starter_prompts: [],
      agent_system_prompt: null,
      agent_developer_prompt: null,
      agent_runtime_config: null,
      agent_tool_config: null,
    };
  }

  const runtime = isPlainRecord(row.runtime_config) ? row.runtime_config : null;
  const toolConfig = isPlainRecord(row.tool_config) ? row.tool_config : null;
  const modelExternalId = resolveAgentModelExternalId(runtime, row.version_model_external_id ?? null);
  const chatIntro = cleanDisplayText(runtime?.chat_intro);
  const starterPrompts = resolveStarterPromptsForAgentSlug(
    row.slug,
    extractStarterPrompts(runtime?.starter_prompts),
    await getStarterPromptSettings(),
  );

  return {
    agent_name: row.name ?? null,
    agent_model_external_id: modelExternalId,
    agent_model_label: getModelDisplayLabel(modelExternalId),
    agent_chat_description: chatIntro || row.description || null,
    agent_starter_prompts: starterPrompts,
    agent_system_prompt: row.system_prompt ?? null,
    agent_developer_prompt: row.developer_prompt ?? null,
    agent_runtime_config: runtime,
    agent_tool_config: toolConfig,
  };
}

function normalizeTelegramUsername(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const username = value.trim().replace(/^@+/, '');
  return username ? username : null;
}

async function getChatProjectDeploymentSummaries(chatId: string, userId: string): Promise<ChatProjectDeploymentSummary[]> {
  const rows = await db
    .select({
      id: chatProjectDeployments.id,
      title: chatProjectDeployments.title,
      status: chatProjectDeployments.status,
      runtime: chatProjectDeployments.runtime,
      entrypoint: chatProjectDeployments.entrypoint,
      public_token: chatProjectDeployments.public_token,
      linked_agent_id: chatProjectDeployments.linked_agent_id,
      linked_agent_name: agents.name,
      model_external_id: chatProjectDeployments.model_external_id,
      env_json: chatProjectDeployments.env_json,
      last_error: chatProjectDeployments.last_error,
      last_started_at: chatProjectDeployments.last_started_at,
      last_stopped_at: chatProjectDeployments.last_stopped_at,
      created_at: chatProjectDeployments.created_at,
      updated_at: chatProjectDeployments.updated_at,
    })
    .from(chatProjectDeployments)
    .leftJoin(agents, eq(agents.id, chatProjectDeployments.linked_agent_id))
    .where(and(
      eq(chatProjectDeployments.conversation_id, chatId),
      eq(chatProjectDeployments.user_id, userId),
    ))
    .orderBy(desc(chatProjectDeployments.updated_at))
    .limit(20);

  return rows.map((row) => {
    const deploymentEnv = normalizeProjectRunEnv(row.env_json);
    const telegramUsername = normalizeTelegramUsername(
      deploymentEnv.TELEGRAM_BOT_USERNAME
      ?? deploymentEnv.BOT_USERNAME
      ?? deploymentEnv.TELEGRAM_USERNAME,
    );
    const deliveryMode = typeof deploymentEnv.TELEGRAM_DELIVERY_MODE === 'string'
      ? deploymentEnv.TELEGRAM_DELIVERY_MODE.trim() || null
      : null;

    return {
      id: row.id,
      title: row.title,
      status: row.status,
      runtime: row.runtime,
      entrypoint: row.entrypoint ?? null,
      linked_agent_id: row.linked_agent_id ?? null,
      linked_agent_name: row.linked_agent_name ?? null,
      model_external_id: row.model_external_id ?? null,
      telegram_bot_username: telegramUsername,
      telegram_bot_url: telegramUsername ? `https://t.me/${telegramUsername}` : null,
      delivery_mode: deliveryMode,
      webhook_url: buildProjectRunWebhookUrl(row.public_token),
      last_error: row.last_error ?? null,
      last_started_at: row.last_started_at ? toIso(row.last_started_at) : null,
      last_stopped_at: row.last_stopped_at ? toIso(row.last_stopped_at) : null,
      created_at: toIso(row.created_at),
      updated_at: toIso(row.updated_at),
    };
  });
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
    .orderBy(
      sql`case when ${chatConversations.pinned_at} is null then 1 else 0 end`,
      desc(chatConversations.pinned_at),
      desc(chatConversations.last_message_at),
    )
    .limit(200);

  const ids = chats.map((chat) => chat.id);
  if (ids.length === 0) return [];
  const agentIds = Array.from(new Set(chats.map((chat) => chat.agent_id).filter((agentId): agentId is string => Boolean(agentId))));
  const activeDeploymentStatuses = ['deploying', 'running'];

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
      role: chatConversationMessages.role,
      content_text: chatConversationMessages.content_text,
      created_at: chatConversationMessages.created_at,
      id: chatConversationMessages.id,
      run_id: chatConversationMessages.run_id,
      usage_json: chatConversationMessages.usage_json,
      project_run_count: chatConversationMessages.project_run_count,
      latency_ms: chatConversationMessages.latency_ms,
    })
    .from(chatConversationMessages)
    .where(inArray(chatConversationMessages.conversation_id, ids))
    .orderBy(desc(chatConversationMessages.created_at));

  const countMap = new Map<string, number>();
  for (const c of counts) countMap.set(c.conversation_id, c.count);

  const activeDeployments = await db
    .select({
      conversation_id: chatProjectDeployments.conversation_id,
    })
    .from(chatProjectDeployments)
    .where(and(
      inArray(chatProjectDeployments.conversation_id, ids),
      eq(chatProjectDeployments.user_id, userId),
      inArray(chatProjectDeployments.status, activeDeploymentStatuses),
    ))
    .groupBy(chatProjectDeployments.conversation_id);

  const activeDeploymentConversationIds = new Set(activeDeployments.map((row) => row.conversation_id));

  const previewMap = new Map<string, string>();
  for (const m of lastMessages) {
    if (!previewMap.has(m.conversation_id)) {
      const previewContent = normalizeAssistantChatPayload(
        m.content_text,
        (m.usage_json as Record<string, unknown> | null) ?? null,
      ).content;
      previewMap.set(m.conversation_id, compactTitle(previewContent || m.content_text));
    }
  }

  const messagesByConversation = new Map<string, ConversationMessage[]>();
  for (const m of lastMessages) {
    const list = messagesByConversation.get(m.conversation_id) ?? [];
    list.push({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content_text,
      run_id: m.run_id ?? null,
      usage: (m.usage_json as Record<string, unknown> | null) ?? null,
      attachments: extractUsageAttachments((m.usage_json as Record<string, unknown> | null) ?? null),
      generated_files: [],
      project_run_count: m.project_run_count ?? 0,
      latency_ms: m.latency_ms ?? null,
      created_at: toIso(m.created_at),
    });
    messagesByConversation.set(m.conversation_id, list);
  }

  const agentMetaMap = new Map<string, { name: string | null; model_external_id: string | null; model_label: string | null }>();
  if (agentIds.length > 0) {
    const agentRows = await db
    .select({
      id: agents.id,
      name: agents.name,
      runtime_config: agentVersions.runtime_config,
      version_model_external_id: aiModels.external_model_id,
    })
    .from(agents)
    .leftJoin(agentVersions, eq(agentVersions.id, agents.current_version_id))
    .leftJoin(aiModels, eq(aiModels.id, agentVersions.model_id))
    .where(inArray(agents.id, agentIds));

    for (const row of agentRows) {
      const modelExternalId = resolveAgentModelExternalId(
        row.runtime_config as Record<string, unknown> | null,
        row.version_model_external_id ?? null,
      );

      agentMetaMap.set(row.id, {
        name: row.name ?? null,
        model_external_id: modelExternalId,
        model_label: getModelDisplayLabel(modelExternalId),
      });
    }
  }

  const pendingRuns = await Promise.all(chats.map(async (chat) => {
    const pendingRun = await getConversationRuntimeState(
      {
        ...(chat as ChatConversationRow),
        mode: chat.mode as ChatMode,
        access: normalizeChatAccess(chat.access),
        access_identifiers: normalizeAccessIdentifiers(chat.access_identifiers),
      },
      messagesByConversation.get(chat.id) ?? [],
    );
    return [chat.id, pendingRun] as const;
  }));
  const pendingRunMap = new Map<string, SharedPendingRunState | null>(pendingRuns);

  return chats.map((chat) => {
    const agentMeta = chat.agent_id ? agentMetaMap.get(chat.agent_id) : undefined;
    const generalModelLabel = getModelDisplayLabel(chat.model_external_id ?? null);

    return {
      id: chat.id,
      title: chat.title,
      note: extractChatNote(chat.settings_json),
      mode: chat.mode as ChatMode,
      agent_id: chat.agent_id ?? null,
      agent_name: agentMeta?.name ?? null,
      agent_model_external_id: agentMeta?.model_external_id ?? null,
      agent_model_label: agentMeta?.model_label ?? null,
      effective_model_label: chat.mode === 'agent'
        ? getModelDisplayLabel(chat.model_external_id ?? null) ?? (agentMeta?.model_label ?? null)
        : generalModelLabel,
      model_external_id: chat.model_external_id ?? null,
      access: normalizeChatAccess(chat.access),
      access_identifiers: normalizeAccessIdentifiers(chat.access_identifiers),
      share_token: chat.share_token ?? null,
      message_count: countMap.get(chat.id) ?? 0,
      last_message_preview: previewMap.get(chat.id) ?? null,
      pending_run: pendingRunMap.get(chat.id) ?? null,
      pinned_at: chat.pinned_at ? toIso(chat.pinned_at) : null,
      last_message_at: toIso(chat.last_message_at),
      created_at: toIso(chat.created_at),
      updated_at: toIso(chat.updated_at),
      has_active_deployment: activeDeploymentConversationIds.has(chat.id),
    };
  });
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
      owner_name: users.name,
      owner_username: users.username,
      description: agents.description,
      runtime_config: agentVersions.runtime_config,
      version_model_external_id: aiModels.external_model_id,
      created_at: agents.created_at,
      total_runs: sql<number>`count(${agentRuns.id})::int`,
    })
    .from(agents)
    .leftJoin(agentVersions, eq(agentVersions.id, agents.current_version_id))
    .leftJoin(aiModels, eq(aiModels.id, agentVersions.model_id))
    .leftJoin(users, eq(users.id, agents.owner_user_id))
    .leftJoin(agentRuns, eq(agentRuns.agent_id, agents.id))
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
    .groupBy(
      agents.id,
      agents.slug,
      agents.name,
      agents.owner_user_id,
      users.name,
      users.username,
      agents.description,
      agentVersions.runtime_config,
      aiModels.external_model_id,
      agents.created_at,
    )
    .orderBy(desc(sql<number>`count(${agentRuns.id})::int`), desc(agents.created_at));

  return rows.map((row) => {
    const modelExternalId = resolveAgentModelExternalId(
      row.runtime_config as Record<string, unknown> | null,
      row.version_model_external_id ?? null,
    );

    return {
      id: row.id,
      name: row.name,
      owner_user_id: row.owner_user_id,
      owner_name: row.owner_name ?? null,
      owner_username: row.owner_username ?? null,
      is_owner: row.owner_user_id === userId,
      description: row.description ?? null,
      created_at: toIso(row.created_at),
      total_runs: row.total_runs ?? 0,
      model_external_id: modelExternalId,
      model_label: getModelDisplayLabel(modelExternalId),
      pricing_input_usd_per_million: getModelPricingInfo(modelExternalId)?.input ?? null,
      pricing_output_usd_per_million: getModelPricingInfo(modelExternalId)?.output ?? null,
      is_coding_model: isCodingModel(modelExternalId),
      chat_description:
        cleanDisplayText((row.runtime_config as Record<string, unknown> | null)?.chat_intro) || row.description || null,
      starter_prompts: resolveStarterPromptsForAgentSlug(
        row.slug,
        extractStarterPrompts((row.runtime_config as Record<string, unknown> | null)?.starter_prompts),
        starterPromptSettings,
      ),
    };
  });
}

async function loadPublicChatSummary(chatIds: string[]) {
  const messageCountMap = new Map<string, number>();
  const previewMap = new Map<string, string | null>();

  if (!chatIds.length) {
    return { messageCountMap, previewMap };
  }

  const counts = await db
    .select({
      conversation_id: chatConversationMessages.conversation_id,
      count: sql<number>`count(*)::int`,
    })
    .from(chatConversationMessages)
    .where(inArray(chatConversationMessages.conversation_id, chatIds))
    .groupBy(chatConversationMessages.conversation_id);

  for (const row of counts) {
    messageCountMap.set(row.conversation_id, row.count);
  }

  const lastMessages = await db
    .select({
      conversation_id: chatConversationMessages.conversation_id,
      content_text: chatConversationMessages.content_text,
      usage_json: chatConversationMessages.usage_json,
      created_at: chatConversationMessages.created_at,
    })
    .from(chatConversationMessages)
    .where(inArray(chatConversationMessages.conversation_id, chatIds))
    .orderBy(desc(chatConversationMessages.created_at));

  for (const row of lastMessages) {
    if (previewMap.has(row.conversation_id)) continue;
    const normalized = normalizeAssistantChatPayload(
      row.content_text,
      (row.usage_json as Record<string, unknown> | null) ?? null,
    );
    previewMap.set(row.conversation_id, compactTitle(normalized.content || row.content_text) || null);
  }

  return { messageCountMap, previewMap };
}

async function buildPublicChatListItem(
  chat: {
    id: string;
    user_id: string;
    title: string;
    share_token: string | null;
    last_message_at: Date;
    created_at: Date;
    updated_at: Date;
    unique_view_count: number | null;
    total_view_count: number | null;
    owner_email: string;
    owner_username: string | null;
    owner_name_raw: string | null;
  },
  viewerUserId: string | null | undefined,
  messageCountMap: Map<string, number>,
  previewMap: Map<string, string | null>,
): Promise<PublicAgentChatListItem> {
  const shareToken = await ensureChatShareToken(chat.id, chat.share_token);
  return {
    id: chat.id,
    title: chat.title,
    chat_url: `/shared/chats/${shareToken}`,
    share_token: shareToken,
    owner_name: formatAuthorName({
      email: chat.owner_email,
      username: chat.owner_username,
      name: chat.owner_name_raw,
    }),
    owner_username: chat.owner_username,
    is_owner: Boolean(viewerUserId && chat.user_id === viewerUserId),
    message_count: messageCountMap.get(chat.id) ?? 0,
    last_message_preview: previewMap.get(chat.id) ?? null,
    last_message_at: toIso(chat.last_message_at),
    created_at: toIso(chat.created_at),
    updated_at: toIso(chat.updated_at),
    unique_view_count: chat.unique_view_count ?? 0,
    total_view_count: chat.total_view_count ?? 0,
  };
}

export async function listPublicChatsByAgent(agentId: string, viewerUserId?: string | null): Promise<PublicAgentChatsResult> {
  const agentMeta = await getAgentChatMeta(agentId);
  if (!agentMeta.agent_name) {
    throw new NotFoundError('Ресурс не найден');
  }

  const [countRow] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(chatConversations)
    .where(and(
      eq(chatConversations.agent_id, agentId),
      eq(chatConversations.mode, 'agent'),
      eq(chatConversations.access, 'public'),
    ));

  const chats = await db
    .select({
      id: chatConversations.id,
      user_id: chatConversations.user_id,
      title: chatConversations.title,
      share_token: chatConversations.share_token,
      last_message_at: chatConversations.last_message_at,
      created_at: chatConversations.created_at,
      updated_at: chatConversations.updated_at,
      unique_view_count: chatConversations.unique_view_count,
      total_view_count: chatConversations.total_view_count,
      owner_email: users.email,
      owner_username: users.username,
      owner_name_raw: users.name,
    })
    .from(chatConversations)
    .innerJoin(users, eq(users.id, chatConversations.user_id))
    .where(and(
      eq(chatConversations.agent_id, agentId),
      eq(chatConversations.mode, 'agent'),
      eq(chatConversations.access, 'public'),
    ))
    .orderBy(desc(chatConversations.last_message_at))
    .limit(24);

  const chatIds = chats.map((chat) => chat.id);
  const { messageCountMap, previewMap } = await loadPublicChatSummary(chatIds);

  const items: PublicAgentChatListItem[] = [];
  for (const chat of chats) {
    items.push(await buildPublicChatListItem(chat, viewerUserId, messageCountMap, previewMap));
  }

  return {
    agent: {
      id: agentId,
      name: agentMeta.agent_name,
      model_external_id: agentMeta.agent_model_external_id,
      model_label: agentMeta.agent_model_label,
      chat_description: agentMeta.agent_chat_description,
      public_chats_count: countRow?.count ?? 0,
    },
    chats: items,
  };
}

export async function listPublicChatsByModel(modelExternalId: string, viewerUserId?: string | null): Promise<PublicModelChatsResult> {
  const normalizedModel = normalizeModelLookupKey(modelExternalId);
  if (!normalizedModel) {
    throw new AppError(400, 'MODEL_REQUIRED', 'Нужно передать model');
  }

  const rows = await db
    .select({
      id: chatConversations.id,
      user_id: chatConversations.user_id,
      title: chatConversations.title,
      share_token: chatConversations.share_token,
      last_message_at: chatConversations.last_message_at,
      created_at: chatConversations.created_at,
      updated_at: chatConversations.updated_at,
      unique_view_count: chatConversations.unique_view_count,
      total_view_count: chatConversations.total_view_count,
      owner_email: users.email,
      owner_username: users.username,
      owner_name_raw: users.name,
      agent_id: agents.id,
      agent_name: agents.name,
      runtime_config: agentVersions.runtime_config,
      version_model_external_id: aiModels.external_model_id,
    })
    .from(chatConversations)
    .innerJoin(users, eq(users.id, chatConversations.user_id))
    .innerJoin(agents, eq(agents.id, chatConversations.agent_id))
    .leftJoin(agentVersions, eq(agentVersions.id, agents.current_version_id))
    .leftJoin(aiModels, eq(aiModels.id, agentVersions.model_id))
    .where(and(
      eq(chatConversations.mode, 'agent'),
      eq(chatConversations.access, 'public'),
    ))
    .orderBy(desc(chatConversations.last_message_at));

  const filteredChats = rows.filter((row) => {
    const resolvedModel = resolveAgentModelExternalId(
      row.runtime_config as Record<string, unknown> | null,
      row.version_model_external_id ?? null,
    );
    return normalizeModelLookupKey(resolvedModel) === normalizedModel;
  });

  const topChats = filteredChats.slice(0, 24);
  const { messageCountMap, previewMap } = await loadPublicChatSummary(topChats.map((chat) => chat.id));

  const items: PublicModelChatListItem[] = [];
  for (const chat of topChats) {
    const baseItem = await buildPublicChatListItem(chat, viewerUserId, messageCountMap, previewMap);
    items.push({
      ...baseItem,
      agent_id: chat.agent_id,
      agent_name: chat.agent_name ?? null,
    });
  }

  const uniqueAgentIds = new Set(filteredChats.map((chat) => chat.agent_id));
  const canonicalModelExternalId = filteredChats.find((chat) => {
    const resolvedModel = resolveAgentModelExternalId(
      chat.runtime_config as Record<string, unknown> | null,
      chat.version_model_external_id ?? null,
    );
    return normalizeModelLookupKey(resolvedModel) === normalizedModel;
  });
  const resolvedModelExternalId = resolveAgentModelExternalId(
    canonicalModelExternalId?.runtime_config as Record<string, unknown> | null,
    canonicalModelExternalId?.version_model_external_id ?? null,
  ) ?? modelExternalId.trim();

  return {
    model: {
      model_external_id: resolvedModelExternalId,
      model_label: getModelDisplayLabel(resolvedModelExternalId),
      public_chats_count: filteredChats.length,
      agents_count: uniqueAgentIds.size,
    },
    chats: items,
  };
}

export async function createChat(userId: string, input: {
  title?: string;
  note?: string | null;
  mode?: ChatMode;
  agent_id?: string | null;
  model_external_id?: string | null;
  system_prompt?: string | null;
  tool_ids?: string[];
  context_window_tokens?: number | null;
  access?: ChatAccess;
  access_identifiers?: string[];
}, userRole?: string) {
  const mode = input.mode ?? 'general';
  const access = normalizeChatAccess(input.access);
  const accessIdentifiers = normalizeAccessIdentifiers(input.access_identifiers);
  const normalizedToolIds = mode === 'general'
    ? await mergeAutoChatToolIds(normalizeChatToolIds(input.tool_ids))
    : normalizeChatToolIds(input.tool_ids);
  if (mode === 'agent' && !input.agent_id) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Для режима чата с агентом требуется agent_id');
  }
  
  if (mode === 'agent' && input.agent_id) {
    await ensureAgentIsVisibleForUser(input.agent_id, userId, userRole);
  }

  if (access === 'restricted' && accessIdentifiers.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Для ограниченного доступа укажите email или логины');
  }

  if (normalizedToolIds.length > 0) {
    await validateChatToolSelection(normalizedToolIds);
  }

  const shareToken = uuidv4().replace(/-/g, '').slice(0, 16);
  const initialSettings = buildChatSettingsJson(null, {
    tool_ids: normalizedToolIds,
    tool_agent_id: null,
    note: input.note ?? null,
  });

  const [chat] = await db.insert(chatConversations).values({
    user_id: userId,
    mode,
    agent_id: input.agent_id ?? null,
    title: (input.title?.trim() || 'Новый чат').slice(0, 500),
    model_external_id: input.model_external_id ?? null,
    system_prompt: input.system_prompt ?? null,
    access,
    access_identifiers: accessIdentifiers,
    share_token: shareToken,
    settings_json: initialSettings,
    last_message_at: new Date(),
  }).returning();

  let toolAgentId: string | null = null;
  if (mode === 'general' && normalizedToolIds.length > 0) {
    toolAgentId = await ensureChatToolRuntimeAgent(
      { id: chat.id, title: chat.title },
      userId,
      normalizedToolIds,
      chat.model_external_id ?? DEFAULT_GENERAL_MODEL,
      chat.system_prompt,
    );

    await db.update(chatConversations)
      .set({
        settings_json: buildChatSettingsJson(chat.settings_json, {
          tool_ids: normalizedToolIds,
          tool_agent_id: toolAgentId,
        }),
        updated_at: new Date(),
      })
      .where(eq(chatConversations.id, chat.id));
  }

  const agentMeta = chat.mode === 'agent'
    ? await getAgentChatMeta(chat.agent_id ?? null)
    : null;
  const effectiveModelLabel = chat.mode === 'agent'
    ? getModelDisplayLabel(chat.model_external_id ?? null) ?? (agentMeta?.agent_model_label ?? null)
    : getModelDisplayLabel(chat.model_external_id ?? null);

  return {
    id: chat.id,
    title: chat.title,
    note: extractChatNote(chat.settings_json ?? initialSettings),
    mode: chat.mode,
    agent_id: chat.agent_id,
    agent_name: agentMeta?.agent_name ?? null,
    agent_model_external_id: agentMeta?.agent_model_external_id ?? null,
    agent_model_label: agentMeta?.agent_model_label ?? null,
    effective_model_label: effectiveModelLabel,
    model_external_id: chat.model_external_id,
    access: normalizeChatAccess(chat.access),
    access_identifiers: normalizeAccessIdentifiers(chat.access_identifiers),
    share_token: chat.share_token ?? null,
    message_count: 0,
    last_message_preview: null,
    pinned_at: chat.pinned_at ? toIso(chat.pinned_at) : null,
    last_message_at: toIso(chat.last_message_at),
    created_at: toIso(chat.created_at),
    updated_at: toIso(chat.updated_at),
    has_active_deployment: false,
  };
}

export async function getChatById(chatId: string, userId: string): Promise<ConversationDetails> {
  const chat = await ensureAutoChatToolsForConversation(await getConversationForUser(chatId, userId));
  const shareToken = await ensureChatShareToken(chat.id, chat.share_token);
  const chatToolSettings = extractChatToolSettings(chat.settings_json);
  const [messages, agentMeta, chatTools, agentTools, projectDeployments, autoChatTools] = await Promise.all([
    getConversationMessages(chatId),
    getAgentChatMeta(chat.agent_id ?? null),
    getActiveToolSummariesByIds(chatToolSettings.tool_ids),
    getActiveAgentToolSummaries(chat.agent_id ?? null),
    getChatProjectDeploymentSummaries(chat.id, userId),
    getAutoAttachChatToolSummaries(),
  ]);
  const effectiveTools = mergeToolSummaries(agentTools, chatTools, chat.mode === 'agent' ? autoChatTools : []);
  const pending_run = await getConversationRuntimeState(chat, messages);

  return {
    chat: {
      id: chat.id,
      title: chat.title,
      note: extractChatNote(chat.settings_json),
      mode: chat.mode,
      system_prompt: chat.system_prompt ?? null,
      settings_json: chat.settings_json ?? null,
      agent_id: chat.agent_id ?? null,
      agent_name: agentMeta.agent_name,
      agent_model_external_id: agentMeta.agent_model_external_id,
      agent_model_label: agentMeta.agent_model_label,
      effective_model_label: chat.mode === 'agent'
        ? getModelDisplayLabel(chat.model_external_id ?? null) ?? agentMeta.agent_model_label
        : getModelDisplayLabel(chat.model_external_id ?? null),
      model_external_id: chat.model_external_id ?? null,
      access: normalizeChatAccess(chat.access),
      access_identifiers: normalizeAccessIdentifiers(chat.access_identifiers),
      share_token: shareToken,
      message_count: messages.length,
      agent_chat_description: agentMeta.agent_chat_description,
      agent_starter_prompts: agentMeta.agent_starter_prompts,
      agent_system_prompt: agentMeta.agent_system_prompt,
      agent_developer_prompt: agentMeta.agent_developer_prompt,
      agent_runtime_config: agentMeta.agent_runtime_config,
      agent_tool_config: agentMeta.agent_tool_config,
      tool_ids: chatTools.map((tool) => tool.id),
      tools: chatTools,
      chat_tool_ids: chatTools.map((tool) => tool.id),
      chat_tools: chatTools,
      agent_tool_ids: agentTools.map((tool) => tool.id),
      agent_tools: agentTools,
      effective_tool_ids: effectiveTools.map((tool) => tool.id),
      effective_tools: effectiveTools,
      project_deployments: projectDeployments,
      pending_run,
      pinned_at: chat.pinned_at ? toIso(chat.pinned_at) : null,
      last_message_at: toIso(chat.last_message_at),
      created_at: toIso(chat.created_at),
      updated_at: toIso(chat.updated_at),
    },
    messages,
  };
}

async function getAssistantMessageForConversation(conversationId: string, messageId: string) {
  const [message] = await db
    .select()
    .from(chatConversationMessages)
    .where(and(
      eq(chatConversationMessages.id, messageId),
      eq(chatConversationMessages.conversation_id, conversationId),
    ))
    .limit(1);

  if (!message || message.role !== 'assistant') {
    throw new NotFoundError('Assistant message not found');
  }

  return message;
}

export function extractProjectBundleFromMessageRecord(message: {
  content_text: string;
  usage_json: Record<string, unknown> | null;
}): CodingReportProject {
  const rawUsage = message.usage_json ?? null;
  const normalized = normalizeAssistantChatPayload(message.content_text, rawUsage);
  const project = normalized.codingReport?.project;

  if (!project || !project.files || project.files.length === 0) {
    throw new AppError(400, 'PROJECT_BUNDLE_MISSING', 'В сообщении нет runnable project bundle');
  }

  return project;
}

function extractProjectBundleFromMessage(message: typeof chatConversationMessages.$inferSelect): CodingReportProject {
  return extractProjectBundleFromMessageRecord({
    content_text: message.content_text,
    usage_json: (message.usage_json as Record<string, unknown> | null) ?? null,
  });
}

export async function runChatMessageProject(
  chatId: string,
  messageId: string,
  userId: string,
): Promise<ProjectRunResult> {
  await getConversationForUser(chatId, userId);
  const message = await getAssistantMessageForConversation(chatId, messageId);
  const project = extractProjectBundleFromMessage(message);
  const projectRunCount = await incrementProjectRunCount(message.id);
  const deploymentEnv = await getChatProjectDeploymentRunEnv(chatId, message.id, userId);
  const result = await runProjectBundle(project, { env: deploymentEnv });
  return {
    ...result,
    project_run_count: projectRunCount,
  };
}

export async function runGalleryPreviewProject(
  chatId: string,
  messageId: string,
  viewerUserId: string,
): Promise<ProjectRunResult> {
  const chat = await getConversationById(chatId);
  await ensureChatViewerAccess(chat, viewerUserId);

  if (chat.access !== 'public') {
    throw new NotFoundError('Ресурс не найден');
  }

  const message = await getAssistantMessageForConversation(chatId, messageId);
  const project = extractProjectBundleFromMessage(message);
  const projectRunCount = await incrementProjectRunCount(message.id);
  const result = await runProjectBundle(project);
  return {
    ...result,
    project_run_count: projectRunCount,
  };
}

async function getGeneratedFileForMessage(
  conversationId: string,
  messageId: string,
  fileId: string,
) {
  const [file] = await db
    .select()
    .from(chatMessageFiles)
    .where(and(
      eq(chatMessageFiles.id, fileId),
      eq(chatMessageFiles.conversation_id, conversationId),
      eq(chatMessageFiles.message_id, messageId),
    ))
    .limit(1);

  if (!file) {
    throw new NotFoundError('File not found');
  }

  const filePath = safeGeneratedFilePath(file.storage_filename);
  try {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      throw new NotFoundError('File not found');
    }
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw new NotFoundError('File not found');
  }

  return {
    file,
    file_path: filePath,
  };
}

export async function getChatMessageFileDownload(
  chatId: string,
  messageId: string,
  fileId: string,
  userId: string,
) {
  await getConversationForUser(chatId, userId);
  return getGeneratedFileForMessage(chatId, messageId, fileId);
}

export async function getSharedChatMessageFileDownload(
  token: string,
  messageId: string,
  fileId: string,
  viewerUserId?: string | null,
) {
  const chat = await getConversationForSharedViewer(token, viewerUserId);
  return getGeneratedFileForMessage(chat.id, messageId, fileId);
}

export async function getChatMessagePreviewHtml(
  chatId: string,
  messageId: string,
  viewerUserId?: string | null,
  viewerKey?: string | null,
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
    await registerConversationView(chat, viewerUserId, viewerKey);
    await incrementPreviewViewCount(message.id);
  }

  return preparePreviewHtml(preview.html, options);
}

export async function getSharedChatMessagePreviewHtml(
  token: string,
  messageId: string,
  viewerUserId?: string | null,
  viewerKey?: string | null,
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
    await registerConversationView(chat, viewerUserId, viewerKey);
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

export async function getPublishedLanding(
  chatId: string,
  messageId: string,
  userId: string,
): Promise<PublishedLandingResult | null> {
  const { chat, message, landing } = await getPublishedLandingRowForOwner(chatId, messageId, userId);
  if (!landing) return null;
  const shareToken = await ensureChatShareToken(chat.id, chat.share_token);
  return toPublishedLandingResult(landing, { shareToken, messageId: message.id });
}

export async function publishChatMessageLanding(
  chatId: string,
  messageId: string,
  userId: string,
  input?: { subdomain?: string | null; title?: string | null },
): Promise<PublishedLandingResult> {
  const { chat, message, landing } = await getPublishedLandingRowForOwner(chatId, messageId, userId);
  const preview = getHtmlPreviewForMessageRow(message);
  const shareToken = await ensureChatShareToken(chat.id, chat.share_token);

  let subdomain = input?.subdomain?.trim()
    ? normalizeLandingSubdomain(input.subdomain)
    : (landing?.subdomain ?? await ensureAvailableLandingSubdomain(input?.title ?? preview.title ?? chat.title, message.id.replace(/-/g, '')));

  if (landing && landing.subdomain !== subdomain) {
    const [taken] = await db
      .select({ id: publishedLandings.id })
      .from(publishedLandings)
      .where(and(
        eq(publishedLandings.subdomain, subdomain),
        sql`${publishedLandings.id} <> ${landing.id}`,
      ))
      .limit(1);
    if (taken) {
      throw new ConflictError('Этот поддомен уже занят');
    }
  }

  try {
    const now = new Date();
    const values = {
      conversation_id: chat.id,
      message_id: message.id,
      user_id: userId,
      deployment_id: null,
      type: 'preview_html' as const,
      status: 'active' as const,
      subdomain,
      title: (input?.title?.trim() || preview.title || chat.title || null),
      updated_at: now,
    };

    const [row] = landing
      ? await db.update(publishedLandings)
        .set(values)
        .where(eq(publishedLandings.id, landing.id))
        .returning()
      : await db.insert(publishedLandings)
        .values({
          ...values,
          created_at: now,
        })
        .returning();

    return toPublishedLandingResult(row, { shareToken, messageId: message.id });
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === '23505') {
      throw new ConflictError('Этот поддомен уже занят');
    }
    throw error;
  }
}

export async function updatePublishedLanding(
  chatId: string,
  messageId: string,
  userId: string,
  input: { subdomain?: string | null; title?: string | null },
): Promise<PublishedLandingResult> {
  const { chat, message, landing } = await getPublishedLandingRowForOwner(chatId, messageId, userId);
  if (!landing) {
    throw new NotFoundError('Landing not found');
  }

  getHtmlPreviewForMessageRow(message);

  const shareToken = await ensureChatShareToken(chat.id, chat.share_token);
  const nextSubdomain = input.subdomain?.trim()
    ? normalizeLandingSubdomain(input.subdomain)
    : landing.subdomain;

  try {
    const [row] = await db.update(publishedLandings)
      .set({
        subdomain: nextSubdomain,
        title: input.title?.trim() || landing.title || chat.title || null,
        status: 'active',
        updated_at: new Date(),
      })
      .where(eq(publishedLandings.id, landing.id))
      .returning();

    return toPublishedLandingResult(row, { shareToken, messageId: message.id });
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === '23505') {
      throw new ConflictError('Этот поддомен уже занят');
    }
    throw error;
  }
}

export async function unpublishChatMessageLanding(
  chatId: string,
  messageId: string,
  userId: string,
): Promise<void> {
  const { landing } = await getPublishedLandingRowForOwner(chatId, messageId, userId);
  if (!landing) return;

  await db.delete(publishedLandings).where(eq(publishedLandings.id, landing.id));
}

export async function getPublishedLandingHtmlBySubdomain(
  subdomain: string,
  viewerUserId?: string | null,
  viewerKey?: string | null,
  options?: { previewId?: string },
): Promise<string> {
  const normalizedSubdomain = normalizeLandingSubdomain(subdomain);
  const [landing] = await db
    .select()
    .from(publishedLandings)
    .where(and(
      eq(publishedLandings.subdomain, normalizedSubdomain),
      eq(publishedLandings.status, 'active'),
    ))
    .limit(1);

  if (!landing) {
    throw new NotFoundError('Landing not found');
  }

  const chat = await getConversationById(landing.conversation_id);
  const message = await getAssistantMessageForConversation(landing.conversation_id, landing.message_id);
  const preview = getHtmlPreviewForMessageRow(message);

  if (chat.user_id !== viewerUserId) {
    await registerConversationView(chat, viewerUserId, viewerKey);
    await incrementPreviewViewCount(message.id);
  }

  return preparePreviewHtml(preview.html, { previewId: options?.previewId });
}

export async function streamChatEvents(chatId: string, userId: string, res: Response) {
  await openChatEventStream(chatId, userId, res);
}

export async function streamSharedChatEvents(token: string, res: Response) {
  await openSharedChatEventStream(token, res);
}

export async function getChatStats(chatId: string, userId: string): Promise<ChatStatsResponse> {
  const chat = await getConversationForUser(chatId, userId);
  const usdToRubRate = await getUsdToRubRate();
  const messages = await db
    .select()
    .from(chatConversationMessages)
    .where(eq(chatConversationMessages.conversation_id, chatId))
    .orderBy(asc(chatConversationMessages.created_at));
  const generatedImageRows = await db
    .select({ message_id: chatMessageFiles.message_id })
    .from(chatMessageFiles)
    .where(and(
      eq(chatMessageFiles.conversation_id, chatId),
      eq(chatMessageFiles.kind, 'image'),
    ));

  let userMessages = 0;
  let assistantMessages = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let usdCost = 0;
  let messagesWithUsage = 0;
  let totalLatencyMs = 0;
  const generatedImages = generatedImageRows.length;
  const generatedImagesByMessageId = new Map<string, number>();
  for (const row of generatedImageRows) {
    generatedImagesByMessageId.set(row.message_id, (generatedImagesByMessageId.get(row.message_id) ?? 0) + 1);
  }

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
    const generatedImagesForMessage = generatedImagesByMessageId.get(msg.id) ?? 0;

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
      generated_images: 0,
    };
    existing.prompt_tokens += p;
    existing.completion_tokens += c;
    existing.total_tokens += t;
    existing.usd_cost += usd;
    existing.messages += 1;
    existing.generated_images += generatedImagesForMessage;
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
      generated_images: generatedImages,
    },
    by_model: byModelArr,
    usd_to_rub_rate: usdToRubRate,
  };
}

export async function updateChat(chatId: string, userId: string, input: {
  title?: string;
  note?: string | null;
  mode?: ChatMode;
  agent_id?: string | null;
  model_external_id?: string | null;
  system_prompt?: string | null;
  context_window_tokens?: number | null;
  tool_ids?: string[];
  access?: ChatAccess;
  access_identifiers?: string[];
  pin_to_top?: boolean;
  unpin_from_top?: boolean;
}, userRole?: string) {
  const existing = await ensureAutoChatToolsForConversation(await getConversationForUser(chatId, userId));
  const nextMode = input.mode ?? existing.mode;
  const nextAgentId = input.agent_id === undefined ? existing.agent_id : input.agent_id;
  const nextAccess = input.access === undefined ? existing.access : normalizeChatAccess(input.access);
  const nextAccessIdentifiers = input.access_identifiers === undefined
    ? normalizeAccessIdentifiers(existing.access_identifiers)
    : normalizeAccessIdentifiers(input.access_identifiers);
  const existingToolSettings = extractChatToolSettings(existing.settings_json);
  const requestedNextToolIds = input.tool_ids === undefined
    ? existingToolSettings.tool_ids
    : normalizeChatToolIds(input.tool_ids);
  const nextToolIds = nextMode === 'general'
    ? await mergeAutoChatToolIds(requestedNextToolIds)
    : requestedNextToolIds;

  if (nextMode === 'agent' && !nextAgentId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Для режима чата с агентом требуется agent_id');
  }

  
  if (nextMode === 'agent' && nextAgentId) {
    await ensureAgentIsVisibleForUser(nextAgentId, userId, userRole);
  }

  if (nextAccess === 'restricted' && nextAccessIdentifiers.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Для ограниченного доступа укажите email или логины');
  }

  if (input.tool_ids !== undefined && nextToolIds.length > 0) {
    await validateChatToolSelection(nextToolIds);
  }

  const ensuredShareToken = await ensureChatShareToken(existing.id, existing.share_token);
  const nextModelExternalId = input.model_external_id === undefined
    ? existing.model_external_id
    : (input.model_external_id ?? null);
  const nextSystemPrompt = input.system_prompt === undefined ? existing.system_prompt : (input.system_prompt ?? null);

  let toolAgentId = existingToolSettings.tool_agent_id;
  if (nextMode === 'general' && nextToolIds.length > 0) {
    toolAgentId = await ensureChatToolRuntimeAgent(
      {
        id: existing.id,
        title: input.title ? input.title.trim().slice(0, 500) : existing.title,
      },
      userId,
      nextToolIds,
      nextModelExternalId ?? DEFAULT_GENERAL_MODEL,
      nextSystemPrompt,
    );
  } else if (existingToolSettings.tool_agent_id) {
    await deleteChatToolRuntimeAgent(userId, existingToolSettings.tool_agent_id);
    toolAgentId = null;
  }

  const [chat] = await db.update(chatConversations)
    .set({
      title: input.title ? input.title.trim().slice(0, 500) : existing.title,
      mode: nextMode,
      agent_id: nextAgentId ?? null,
      model_external_id: nextModelExternalId,
      system_prompt: nextSystemPrompt,
      access: nextAccess,
      access_identifiers: nextAccessIdentifiers,
      share_token: ensuredShareToken,
      pinned_at: input.unpin_from_top ? null : (input.pin_to_top ? new Date() : existing.pinned_at),
      settings_json: buildChatSettingsJson(existing.settings_json, {
        tool_ids: nextToolIds,
        tool_agent_id: toolAgentId,
        note: input.note,
        context_window_tokens: input.context_window_tokens,
      }),
      updated_at: new Date(),
    })
    .where(eq(chatConversations.id, chatId))
    .returning();

  if (nextMode === 'agent') {
    await db.update(chatProjectDeployments)
      .set({
        linked_agent_id: nextAgentId ?? null,
        model_external_id: nextModelExternalId,
        updated_at: new Date(),
      })
      .where(and(
        eq(chatProjectDeployments.conversation_id, chat.id),
        eq(chatProjectDeployments.user_id, userId),
      ));
  }

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chatConversationMessages)
    .where(eq(chatConversationMessages.conversation_id, chatId));

  const agentMeta = chat.mode === 'agent'
    ? await getAgentChatMeta(chat.agent_id ?? null)
    : null;
  const effectiveModelLabel = chat.mode === 'agent'
    ? getModelDisplayLabel(chat.model_external_id ?? null) ?? (agentMeta?.agent_model_label ?? null)
    : getModelDisplayLabel(chat.model_external_id ?? null);

  return {
    id: chat.id,
    title: chat.title,
    note: extractChatNote(chat.settings_json),
    mode: chat.mode,
    agent_id: chat.agent_id ?? null,
    agent_name: agentMeta?.agent_name ?? null,
    agent_model_external_id: agentMeta?.agent_model_external_id ?? null,
    agent_model_label: agentMeta?.agent_model_label ?? null,
    effective_model_label: effectiveModelLabel,
    model_external_id: chat.model_external_id ?? null,
    access: normalizeChatAccess(chat.access),
    access_identifiers: normalizeAccessIdentifiers(chat.access_identifiers),
    share_token: chat.share_token ?? null,
    message_count: countRow?.count ?? 0,
    last_message_preview: null,
    pinned_at: chat.pinned_at ? toIso(chat.pinned_at) : null,
    last_message_at: toIso(chat.last_message_at),
    created_at: toIso(chat.created_at),
    updated_at: toIso(chat.updated_at),
    has_active_deployment: false,
  };
}

async function createReusableChatFromSource(
  userId: string,
  sourceChat: ChatConversationRow,
): Promise<ConversationListItem> {
  const sourceToolSettings = extractChatToolSettings(sourceChat.settings_json);
  const copiedToolIds = sourceChat.mode === 'general'
    ? await mergeAutoChatToolIds(sourceToolSettings.tool_ids)
    : [];
  const sourceAgentMeta = sourceChat.agent_id
    ? await getAgentChatMeta(sourceChat.agent_id)
    : null;
  const createdAt = new Date();
  const shareToken = uuidv4().replace(/-/g, '').slice(0, 16);
  const sourceTitle = sourceChat.title.trim() || 'Новый чат';
  const title = sourceTitle.toLowerCase().startsWith('копия ')
    ? sourceTitle.replace(/^копия\s+/i, '').trim() || 'Новый чат'
    : sourceTitle;

  const [chat] = await db.insert(chatConversations).values({
    user_id: userId,
    agent_id: sourceChat.mode === 'agent' ? sourceChat.agent_id : null,
    mode: sourceChat.mode,
    title: title.slice(0, 500),
    model_external_id: sourceChat.mode === 'general' ? sourceChat.model_external_id : null,
    system_prompt: sourceChat.system_prompt ?? null,
    access: 'private',
    access_identifiers: [],
    share_token: shareToken,
    settings_json: buildChatSettingsJson(null, {
      tool_ids: copiedToolIds,
      tool_agent_id: null,
      note: extractChatNote(sourceChat.settings_json),
    }),
    is_clone: false,
    cloned_from_conversation_id: sourceChat.id,
    cloned_at: createdAt,
    last_message_at: createdAt,
    created_at: createdAt,
    updated_at: createdAt,
  }).returning();

  if (sourceChat.mode === 'general' && copiedToolIds.length > 0) {
    const toolAgentId = await ensureChatToolRuntimeAgent(
      { id: chat.id, title: chat.title },
      userId,
      copiedToolIds,
      chat.model_external_id ?? DEFAULT_GENERAL_MODEL,
      chat.system_prompt,
    );

    await db.update(chatConversations)
      .set({
        settings_json: buildChatSettingsJson(chat.settings_json, {
          tool_ids: copiedToolIds,
          tool_agent_id: toolAgentId,
          note: extractChatNote(sourceChat.settings_json),
        }),
        updated_at: new Date(),
      })
      .where(eq(chatConversations.id, chat.id));
  }

  const [finalChat] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, chat.id))
    .limit(1);

  const effectiveChat = finalChat ?? chat;
  const effectiveAgentMeta = effectiveChat.mode === 'agent'
    ? (sourceAgentMeta ?? await getAgentChatMeta(effectiveChat.agent_id ?? null))
    : null;
  const effectiveModelLabel = effectiveChat.mode === 'agent'
    ? (effectiveAgentMeta?.agent_model_label ?? null)
    : getModelDisplayLabel(effectiveChat.model_external_id ?? null);

  return {
    id: effectiveChat.id,
    title: effectiveChat.title,
    note: extractChatNote(effectiveChat.settings_json),
    mode: effectiveChat.mode as ChatMode,
    agent_id: effectiveChat.agent_id ?? null,
    agent_name: effectiveAgentMeta?.agent_name ?? null,
    agent_model_external_id: effectiveAgentMeta?.agent_model_external_id ?? null,
    agent_model_label: effectiveAgentMeta?.agent_model_label ?? null,
    effective_model_label: effectiveModelLabel,
    model_external_id: effectiveChat.model_external_id ?? null,
    access: 'private',
    access_identifiers: [],
    share_token: effectiveChat.share_token ?? chat.share_token ?? null,
    message_count: 0,
    last_message_preview: null,
    pending_run: null,
    pinned_at: null,
    last_message_at: toIso(effectiveChat.last_message_at ?? createdAt),
    created_at: toIso(effectiveChat.created_at ?? createdAt),
    updated_at: toIso(effectiveChat.updated_at ?? createdAt),
    has_active_deployment: false,
  };
}

export async function cloneChat(
  chatId: string,
  userId: string,
  userRole?: string,
  options?: { includeMessages?: boolean },
): Promise<ConversationListItem> {
  const sourceChat = await getConversationById(chatId);
  await ensureChatViewerAccess(sourceChat, userId);

  if (options?.includeMessages === false) {
    return createReusableChatFromSource(userId, sourceChat);
  }

  const sourceMessages = await getConversationMessages(sourceChat.id);
  if (sourceMessages.length === 0) {
    throw new AppError(400, 'CHAT_CLONE_EMPTY', 'Нельзя клонировать пустой чат');
  }

  const transferableMessages: ChatTransferMessage[] = sourceMessages.map((message) => ({
    role: message.role,
    content: message.content,
    usage: stripGeneratedFilesFromUsage(message.usage),
    project_run_count: message.project_run_count,
    latency_ms: message.latency_ms,
    created_at: message.created_at,
  }));

  return cloneChatFromMessages(userId, userRole, sourceChat, transferableMessages);
}

export async function deleteChatMessage(chatId: string, messageId: string, userId: string): Promise<{ ok: true }> {
  const chat = await getConversationForUser(chatId, userId);

  const [message] = await db
    .select({
      id: chatConversationMessages.id,
      created_at: chatConversationMessages.created_at,
    })
    .from(chatConversationMessages)
    .where(and(
      eq(chatConversationMessages.id, messageId),
      eq(chatConversationMessages.conversation_id, chat.id),
    ))
    .limit(1);

  if (!message) {
    throw new NotFoundError('Сообщение не найдено');
  }

  await db.delete(chatConversationMessages)
    .where(and(
      eq(chatConversationMessages.id, messageId),
      eq(chatConversationMessages.conversation_id, chat.id),
    ));

  const [latestMessage] = await db
    .select({ created_at: chatConversationMessages.created_at })
    .from(chatConversationMessages)
    .where(eq(chatConversationMessages.conversation_id, chat.id))
    .orderBy(desc(chatConversationMessages.created_at))
    .limit(1);

  await db.update(chatConversations)
    .set({
      last_message_at: latestMessage?.created_at ?? chat.created_at,
      updated_at: new Date(),
    })
    .where(eq(chatConversations.id, chat.id));

  return { ok: true };
}

export async function truncateChatFromMessage(chatId: string, messageId: string, userId: string): Promise<{ ok: true }> {
  const chat = await getConversationForUser(chatId, userId);

  const messages = await db
    .select({
      id: chatConversationMessages.id,
      role: chatConversationMessages.role,
      created_at: chatConversationMessages.created_at,
    })
    .from(chatConversationMessages)
    .where(eq(chatConversationMessages.conversation_id, chat.id))
    .orderBy(asc(chatConversationMessages.created_at));

  const targetIndex = messages.findIndex((message) => message.id === messageId);
  if (targetIndex === -1) {
    throw new NotFoundError('Сообщение не найдено');
  }

  const target = messages[targetIndex];
  if (target.role !== 'user') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Редактировать можно только пользовательское сообщение');
  }

  const idsToDelete = messages.slice(targetIndex).map((message) => message.id);
  if (idsToDelete.length === 0) {
    return { ok: true };
  }

  await db.delete(chatConversationMessages)
    .where(and(
      eq(chatConversationMessages.conversation_id, chat.id),
      inArray(chatConversationMessages.id, idsToDelete),
    ));

  const [latestMessage] = await db
    .select({ created_at: chatConversationMessages.created_at })
    .from(chatConversationMessages)
    .where(eq(chatConversationMessages.conversation_id, chat.id))
    .orderBy(desc(chatConversationMessages.created_at))
    .limit(1);

  await db.update(chatConversations)
    .set({
      last_message_at: latestMessage?.created_at ?? chat.created_at,
      updated_at: new Date(),
    })
    .where(eq(chatConversations.id, chat.id));

  return { ok: true };
}

export async function deleteChat(chatId: string, userId: string) {
  const chat = await getConversationForUser(chatId, userId);
  const toolSettings = extractChatToolSettings(chat.settings_json);
  await deleteChatToolRuntimeAgent(userId, toolSettings.tool_agent_id);
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
  const chat = await ensureAutoChatToolsForConversation(await getConversationForUser(chatId, userId));
  const chatToolSettings = extractChatToolSettings(chat.settings_json);
  const openRouterRequestsEnabled = await getOpenRouterRequestsEnabled();
  const openRouterDisabledMessage = openRouterRequestsEnabled
    ? null
    : await getOpenRouterDisabledMessage();
  if (openRouterRequestsEnabled) {
    await ensureSufficientBalance(userId);
  }
  const usdToRubRate = await getUsdToRubRate();
  const emitChatEvent = (event: string, payload: Record<string, unknown>) => {
    publishChatEvent(chatId, userId, event, payload);
    if (chat.share_token) {
      publishSharedChatEvent(chat.share_token, event, payload);
    }
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

  const userMessage: ConversationMessage = {
    id: '',
    role: 'user',
    content: trimmedContent,
    run_id: null,
    project_run_count: 0,
    usage: attachmentMetas.length > 0 ? ({ attachments: attachmentMetas } as Record<string, unknown>) : null,
    attachments: attachmentMetas,
    generated_files: [],
    latency_ms: null,
    created_at: new Date().toISOString(),
  };

  const [userMessageRow] = await db.insert(chatConversationMessages).values({
    conversation_id: chatId,
    role: 'user',
    content_text: trimmedContent,
    usage_json: attachmentMetas.length > 0 ? ({ attachments: attachmentMetas } as Record<string, unknown>) : null,
  }).returning();
  const persistedUserMessage = toConversationMessage(userMessageRow, usdToRubRate);
  emitChatEvent('chat.message.accepted', {
    mode: chat.mode,
    has_attachments: attachmentMetas.length > 0,
    label: attachmentMetas.length > 0
      ? 'Сообщение принято, подготавливаю вложения'
      : 'Сообщение принято, запускаю обработку',
  });

  let assistantText = '';
  let runId: string | null = null;
  let usagePayload: Record<string, unknown> | null = null;
  let latencyMs: number | null = null;
  let completedGeneralModel: string | null = null;
  let generalChatModelToPersist: string | null = null;
  let assistantGeneratedImageArtifacts: GeneratedChatFileArtifact[] = [];
  const wantsImageGeneration = detectImageGenerationIntent(trimmedContent);
  const canUseChatTools = openRouterRequestsEnabled
    && chat.mode === 'general'
    && chatToolSettings.tool_ids.length > 0
    && imageDataUrls.length === 0
    && !wantsImageGeneration;

  if (!openRouterRequestsEnabled) {
    latencyMs = 0;
    assistantText = openRouterDisabledMessage || 'В данный момент отправка запросов отключена. В скором времени отправка снова будет доступна.';
    emitChatEvent('chat.run.skipped', {
      mode: chat.mode,
      disabled_by_admin: true,
      label: 'Отправка запросов временно отключена администратором',
    });
  } else {
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
    const modelEnvironmentContext = buildModelEnvironmentContext();
    const isDefaultTitle = chat.title === 'Новый чат';
    const nextTitle = isDefaultTitle ? compactTitle(trimmedContent || 'Вложение') : chat.title;

    const previousMessages = (await getConversationMessages(chatId))
      .filter((message) => message.id !== userMessageRow.id);
    const historyForModel = [
      ...(chat.system_prompt ? [{ role: 'system' as const, content: chat.system_prompt }] : []),
      { role: 'system' as const, content: modelEnvironmentContext },
      ...previousMessages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: userModelText },
    ];

    if (chat.mode === 'agent') {
      if (!chat.agent_id) {
        throw new AppError(400, 'CHAT_CONFIG_ERROR', 'Этот чат не настроен как агент');
      }
      await ensureAgentIsVisibleForUser(chat.agent_id, userId, userRole);

      await db.update(chatConversations).set({
        title: nextTitle,
        last_message_at: new Date(),
        updated_at: new Date(),
      }).where(eq(chatConversations.id, chatId));

      void startRun(chat.agent_id, userId, {
        messages: historyForModel
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        model_external_id: chat.model_external_id ?? null,
      }, {
        sync_to_chats: true,
        sync_conversation_id: chatId,
        skip_sync_user_message: true,
        sync_chat_title: nextTitle,
        charge_usage: true,
        user_role: userRole,
        on_event: emitChatEvent,
        strict_preview_edit: strictPreviewEdit && latestPreviewSnapshot
          ? {
            user_request: trimmedContent,
            original_html: latestPreviewSnapshot.html,
            preview_title: latestPreviewSnapshot.title ?? null,
          }
          : null,
      }).catch((error) => {
        const message = error instanceof Error ? error.message : 'Во время выполнения произошла ошибка.';
        logger.error({ chatId, userId, agentId: chat.agent_id, error }, 'Background agent chat run failed');
        emitChatEvent('chat.run.failed', {
          mode: chat.mode,
          error: message,
          label: 'Выполнение завершилось с ошибкой',
          detail: message,
        });
      });

      return {
        processing: true,
        pending_run: {
          status: 'starting',
          label: 'Агент начал выполнение задачи',
          detail: 'Сообщение принято. Живой прогресс и частичный результат будут появляться прямо в чате.',
        },
        user_message: persistedUserMessage,
        assistant_message: null,
        chat: {
          id: chat.id,
          title: nextTitle,
          mode: chat.mode,
          agent_id: chat.agent_id ?? null,
          model_external_id: chat.model_external_id ?? null,
          share_token: chat.share_token ?? null,
        },
      };
    } else if (canUseChatTools) {
      const selectedTools = await getActiveToolSummariesByIds(chatToolSettings.tool_ids);
      if (selectedTools.length === 0) {
        throw new AppError(400, 'CHAT_TOOLS_UNAVAILABLE', 'Подключённые инструменты чата сейчас недоступны');
      }

      const toolAgentId = await ensureChatToolRuntimeAgent(
        { id: chat.id, title: chat.title },
        userId,
        selectedTools.map((tool) => tool.id),
        chat.model_external_id ?? DEFAULT_GENERAL_MODEL,
        chat.system_prompt,
      );

      if (toolAgentId !== chatToolSettings.tool_agent_id) {
        await db.update(chatConversations)
          .set({
            settings_json: buildChatSettingsJson(chat.settings_json, {
              tool_ids: selectedTools.map((tool) => tool.id),
              tool_agent_id: toolAgentId,
            }),
            updated_at: new Date(),
          })
          .where(eq(chatConversations.id, chat.id));
      }

      await db.update(chatConversations).set({
        title: nextTitle,
        last_message_at: new Date(),
        updated_at: new Date(),
      }).where(eq(chatConversations.id, chatId));

      void startRun(toolAgentId, userId, {
        messages: historyForModel
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        model_external_id: chat.model_external_id ?? DEFAULT_GENERAL_MODEL,
      }, {
        sync_to_chats: true,
        sync_conversation_id: chatId,
        skip_sync_user_message: true,
        sync_chat_title: nextTitle,
        charge_usage: true,
        user_role: userRole,
        on_event: emitChatEvent,
        strict_preview_edit: strictPreviewEdit && latestPreviewSnapshot
          ? {
            user_request: trimmedContent,
            original_html: latestPreviewSnapshot.html,
            preview_title: latestPreviewSnapshot.title ?? null,
          }
          : null,
      }).catch((error) => {
        const message = error instanceof Error ? error.message : 'Во время выполнения произошла ошибка.';
        logger.error({ chatId, userId, toolAgentId, error }, 'Background tool chat run failed');
        emitChatEvent('chat.run.failed', {
          mode: chat.mode,
          error: message,
          label: 'Выполнение завершилось с ошибкой',
          detail: message,
        });
      });

      return {
        processing: true,
        pending_run: {
          status: 'starting',
          label: 'Агент начал выполнение задачи',
          detail: 'Сообщение принято. Живой прогресс и частичный результат будут появляться прямо в чате.',
        },
        user_message: persistedUserMessage,
        assistant_message: null,
        chat: {
          id: chat.id,
          title: nextTitle,
          mode: chat.mode,
          agent_id: chat.agent_id ?? null,
          model_external_id: chat.model_external_id ?? null,
          share_token: chat.share_token ?? null,
        },
      };
    } else {
      const requestedModel = normalizeOpenRouterModelId(chat.model_external_id || DEFAULT_GENERAL_MODEL);
      let model = wantsImageGeneration ? DEFAULT_IMAGE_GENERATION_MODEL : requestedModel;
      const switchedToImageGenerationModel = wantsImageGeneration && model !== requestedModel;
      if (switchedToImageGenerationModel) {
        generalChatModelToPersist = requestedModel;
      }
      const switchedToVisionModel = !wantsImageGeneration && imageDataUrls.length > 0 && !isVisionModel(model);
      if (switchedToVisionModel) {
        model = DEFAULT_VISION_CHAT_MODEL;
        generalChatModelToPersist = requestedModel;
      }
      const attemptedGeneralModelIds = new Set<string>([requestedModel, model]);
      const startedAt = Date.now();
      emitChatEvent('chat.run.started', {
        mode: 'general',
        model,
        label: wantsImageGeneration ? 'Генерирую изображение через OpenRouter' : 'Отправляю запрос в OpenRouter',
        detail: switchedToImageGenerationModel
          ? `Для генерации изображения использую модель ${model}. После ответа чат останется на ${requestedModel}.`
          : switchedToVisionModel
          ? `В сообщении есть изображение, поэтому вместо ${requestedModel} использую vision-модель ${model}.`
          : undefined,
        previous_model: switchedToImageGenerationModel || switchedToVisionModel ? requestedModel : undefined,
      });
      if (switchedToImageGenerationModel) {
        emitChatEvent('chat.run.status', {
          mode: 'general',
          status: 'image_model_selected',
          label: 'Переключаю на image-модель',
          detail: `Для этого ответа использую ${model}, выбранная модель чата останется ${requestedModel}.`,
          previous_model: requestedModel,
          model,
        });
      }
      if (switchedToVisionModel) {
        emitChatEvent('chat.run.status', {
          mode: 'general',
          status: 'vision_model_selected',
          label: 'Переключаю на vision-модель',
          detail: `Модель ${requestedModel} не умеет читать изображения. Для этого ответа использую ${model}.`,
          previous_model: requestedModel,
          model,
        });
      }
      try {
        const userContentForGeneral = imageDataUrls.length > 0
          ? ([{ type: 'text' as const, text: userModelText }, ...imageDataUrls.map((url) => ({ type: 'image_url' as const, image_url: { url } }))])
          : userModelText;
        const buildGeneralRequest = (): ChatCompletionParams => ({
          model,
          messages: [
            ...historyForModel.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content: userContentForGeneral },
          ],
          modalities: wantsImageGeneration ? ['image', 'text'] : undefined,
          image_config: wantsImageGeneration
            ? {
              aspect_ratio: resolveImageGenerationAspectRatio(trimmedContent) ?? '1:1',
              image_size: '1K',
            }
            : undefined,
          temperature: 0.5,
          max_tokens: 2048,
          reasoning: resolveOpenRouterReasoningConfig(model),
          provider: resolveOpenRouterProviderPreferences(model, 0),
        });
        const requestGeneralCompletion = async () => {
          try {
            return await openRouterClient.chatCompletion(buildGeneralRequest(), {
              timeoutMs: GENERAL_CHAT_OPENROUTER_TIMEOUT_MS,
            });
          } catch (error) {
            if (wantsImageGeneration) {
              throw error;
            }
            if (!shouldTryOpenRouterRuntimeFallback(error, model)) {
              throw error;
            }

            const fallbackModel = resolveOpenRouterRuntimeFallbackModel(model, attemptedGeneralModelIds);
            if (!fallbackModel) {
              throw error;
            }

            const previousModel = model;
            attemptedGeneralModelIds.add(fallbackModel);
            model = fallbackModel;
            logger.warn({
              chatId,
              userId,
              previousModel,
              fallbackModel,
              err: error,
            }, 'Retrying general chat request with fallback model');
            emitChatEvent('chat.run.status', {
              mode: 'general',
              status: 'model_fallback',
              label: 'Переключаю модель',
              detail: `Модель ${previousModel} не ответила через OpenRouter, повторяю запрос через ${fallbackModel}.`,
              previous_model: previousModel,
              model: fallbackModel,
            });

            return openRouterClient.chatCompletion(buildGeneralRequest(), {
              timeoutMs: GENERAL_CHAT_OPENROUTER_TIMEOUT_MS,
            });
          }
        };
        let response = await requestGeneralCompletion();
        completedGeneralModel = model;
        let assistantMessage = response.choices?.[0]?.message;
        let generatedImageUrls = extractOpenRouterGeneratedImageUrls(assistantMessage);
        if (wantsImageGeneration && generatedImageUrls.length === 0) {
          for (const fallbackModel of OPENROUTER_IMAGE_GENERATION_FALLBACK_MODELS) {
            const normalizedFallbackModel = normalizeOpenRouterModelId(fallbackModel);
            if (!normalizedFallbackModel || attemptedGeneralModelIds.has(normalizedFallbackModel)) {
              continue;
            }

            const previousModel = model;
            attemptedGeneralModelIds.add(normalizedFallbackModel);
            model = normalizedFallbackModel;
            logger.warn({
              chatId,
              userId,
              previousModel,
              fallbackModel: normalizedFallbackModel,
              responseModel: response.model,
              finishReason: response.choices?.[0]?.finish_reason,
              usage: response.usage,
            }, 'Image generation response did not contain an image, retrying with fallback model');
            emitChatEvent('chat.run.status', {
              mode: 'general',
              status: 'image_model_fallback',
              label: 'Повторяю генерацию изображения',
              detail: `Модель ${previousModel} не вернула файл изображения, повторяю через ${normalizedFallbackModel}.`,
              previous_model: previousModel,
              model: normalizedFallbackModel,
            });

            try {
              response = await openRouterClient.chatCompletion(buildGeneralRequest(), {
                timeoutMs: GENERAL_CHAT_OPENROUTER_TIMEOUT_MS,
              });
              completedGeneralModel = model;
              assistantMessage = response.choices?.[0]?.message;
              generatedImageUrls = extractOpenRouterGeneratedImageUrls(assistantMessage);
              if (generatedImageUrls.length > 0) {
                break;
              }
            } catch (fallbackError) {
              model = previousModel;
              completedGeneralModel = previousModel;
              logger.error({
                chatId,
                userId,
                previousModel,
                fallbackModel: normalizedFallbackModel,
                err: fallbackError,
              }, 'Image generation fallback model failed');
            }
          }
        }
        latencyMs = Date.now() - startedAt;
        const rawAssistant = extractOpenRouterMessageText(assistantMessage);
        assistantGeneratedImageArtifacts = await materializeGeneratedImagesFromDataUrls(generatedImageUrls);
        assistantText = rawAssistant
          ? rawAssistant
          : (assistantGeneratedImageArtifacts.length > 0 ? 'Изображение сгенерировано.' : '(пустой ответ)');
        if (wantsImageGeneration && assistantGeneratedImageArtifacts.length === 0) {
          assistantText = rawAssistant
            ? `${rawAssistant}\n\nOpenRouter не вернул файл изображения. Попробуйте повторить запрос или уточнить описание.`
            : `OpenRouter не вернул файл изображения через ${model}. Попробуйте повторить запрос или уточнить описание.`;
        }
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
          generated_images: assistantGeneratedImageArtifacts.length,
          label: wantsImageGeneration
            ? (assistantGeneratedImageArtifacts.length > 0 ? 'OpenRouter сгенерировал изображение' : 'OpenRouter не вернул изображение')
            : 'OpenRouter вернул ответ',
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
  }

  const normalizedAssistant = normalizeAssistantChatPayload(assistantText, usagePayload);
  assistantText = normalizedAssistant.content || assistantText;
  usagePayload = attachUsdToRubRate(normalizedAssistant.usage, usdToRubRate);
  if (completedGeneralModel) {
    usagePayload = {
      ...(usagePayload ?? {}),
      model: typeof usagePayload?.model === 'string' ? usagePayload.model : completedGeneralModel,
    };
  }

  const providerCost = Number(
    typeof usagePayload?.estimated_cost === 'string'
      ? usagePayload.estimated_cost
      : (typeof usagePayload?.estimated_cost === 'number' ? usagePayload.estimated_cost : 0),
  );
  const usageModel = typeof usagePayload?.model === 'string'
    ? usagePayload.model
    : (completedGeneralModel ?? chat.model_external_id ?? DEFAULT_GENERAL_MODEL);
  const pricingQuote = providerCost > 0
    ? await calculateCustomerChargeForUsage({
      provider_cost_usd: providerCost,
      model_external_id: usageModel,
      user_role: userRole,
      user_id: userId,
    })
    : null;
  const chargedCost = pricingQuote?.customer_charge_usd ?? providerCost;
  if (usagePayload && pricingQuote) {
    usagePayload = {
      ...usagePayload,
      provider_cost: pricingQuote.provider_cost_usd.toFixed(6),
      pricing_margin_usd: pricingQuote.margin_usd.toFixed(6),
      pricing_markup_multiplier: pricingQuote.effective_markup_multiplier,
      pricing_policy_snapshot: pricingQuote.policy_snapshot,
    };
  }
  const chargeResult = chargedCost > 0
    ? await chargeUserBalanceForUsage({
      user_id: userId,
      amount_usd: chargedCost,
      type: chat.mode === 'agent' ? 'agent_run_usage' : 'chat_usage',
      description: chat.mode === 'agent'
        ? `Списание за агентный чат ${chat.title === 'Новый чат' ? compactTitle(trimmedContent || 'Вложение') : chat.title}`
        : `Списание за чат ${chat.title === 'Новый чат' ? compactTitle(trimmedContent || 'Вложение') : chat.title}`,
    })
    : null;

  if (usagePayload && chargeResult?.charged_amount_usd) {
    usagePayload = {
      ...usagePayload,
      charged_cost: chargeResult.charged_amount_usd,
      balance_after_usd: chargeResult.balance_usd,
      charge_transaction_ids: chargeResult.transaction_id ? [chargeResult.transaction_id] : undefined,
    };
  }

  const [assistantRow] = await db.insert(chatConversationMessages).values({
    conversation_id: chatId,
    role: 'assistant',
    content_text: assistantText,
    run_id: runId,
    usage_json: usagePayload ?? null,
    latency_ms: latencyMs ?? null,
  }).returning();
  let assistantGeneratedFiles: ChatGeneratedFileMeta[] = [];
  if (assistantGeneratedImageArtifacts.length > 0) {
    assistantGeneratedFiles = await persistGeneratedFilesForMessage({
      conversationId: chatId,
      messageId: assistantRow.id,
      userId,
      runId,
      files: assistantGeneratedImageArtifacts,
    });
    usagePayload = attachGeneratedFilesToUsage(usagePayload, assistantGeneratedFiles);
    if (usagePayload) {
      await db.update(chatConversationMessages)
        .set({ usage_json: usagePayload })
        .where(eq(chatConversationMessages.id, assistantRow.id));
    }
  }
  const isDefaultTitle = chat.title === 'Новый чат';
  const nextTitle = isDefaultTitle ? compactTitle(trimmedContent || 'Вложение') : chat.title;
  await db.update(chatConversations).set({
    title: nextTitle,
    model_external_id: chat.mode === 'general'
      ? (generalChatModelToPersist ?? completedGeneralModel ?? usageModel ?? chat.model_external_id ?? DEFAULT_GENERAL_MODEL)
      : chat.model_external_id,
    last_message_at: new Date(),
    updated_at: new Date(),
  }).where(eq(chatConversations.id, chatId));
  emitChatEvent('chat.message.completed', {
    run_id: runId,
    mode: chat.mode,
    label: 'Ответ сохранён в чате',
    charged_cost: chargeResult?.charged_amount_usd,
    balance_after_usd: chargeResult?.balance_usd,
  });

  return {
    processing: false,
    pending_run: null,
    user_message: persistedUserMessage,
    assistant_message: {
      id: assistantRow.id,
      role: 'assistant' as const,
      content: assistantRow.content_text,
      run_id: assistantRow.run_id ?? null,
      usage: usagePayload ?? ((assistantRow.usage_json as Record<string, unknown> | null) ?? null),
      generated_files: assistantGeneratedFiles,
      project_run_count: assistantRow.project_run_count ?? 0,
      latency_ms: assistantRow.latency_ms ?? null,
      created_at: toIso(assistantRow.created_at),
    },
    chat: {
      id: chat.id,
      title: nextTitle,
      mode: chat.mode,
      agent_id: chat.agent_id ?? null,
      model_external_id: chat.mode === 'general'
        ? (generalChatModelToPersist ?? completedGeneralModel ?? usageModel ?? chat.model_external_id ?? null)
        : (chat.model_external_id ?? null),
      share_token: chat.share_token ?? null,
    },
  };
}

export async function getSharedChatById(token: string, viewerUserId?: string | null, viewerKey?: string | null) {
  const chat = await getConversationForSharedViewer(token, viewerUserId);
  await registerConversationView(chat, viewerUserId, viewerKey);

  const messages = await getConversationMessages(chat.id, { sharedToken: token });
  const pending_run = await getConversationRuntimeState(chat, messages);
  let agentName: string | null = null;
  let ownerName: string | null = null;
  let ownerUsername: string | null = null;

  if (chat.agent_id) {
    const [agent] = await db.select({ name: agents.name }).from(agents).where(eq(agents.id, chat.agent_id)).limit(1);
    agentName = agent?.name ?? null;
  }

  const [owner] = await db
    .select({
      username: users.username,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, chat.user_id))
    .limit(1);

  if (owner) {
    ownerName = formatAuthorName(owner);
    ownerUsername = owner.username ?? null;
  }

  return {
    chat: {
      id: chat.id,
      owner_user_id: chat.user_id,
      owner_name: ownerName,
      owner_username: ownerUsername,
      is_owner: chat.user_id === viewerUserId,
      title: chat.title,
      mode: chat.mode,
      agent_name: agentName,
    },
    pending_run,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      usage: m.usage,
      attachments: m.attachments,
      generated_files: m.generated_files,
      project_run_count: m.project_run_count,
      latency_ms: m.latency_ms,
      created_at: m.created_at,
      })),
    };
}

export async function exportChatBundle(chatId: string, userId: string): Promise<ChatTransferBundleFile> {
  const chat = await getConversationForUser(chatId, userId);
  const messages = await getConversationMessages(chat.id);
  const payload = await buildChatTransferBundlePayload(chat, messages);
  return {
    filename: buildChatTransferFilename(chat.title),
    payload,
  };
}

export async function exportSharedChatBundle(
  token: string,
  viewerUserId?: string | null,
  _viewerKey?: string | null,
): Promise<ChatTransferBundleFile> {
  const chat = await getConversationForSharedViewer(token, viewerUserId);
  const messages = await getConversationMessages(chat.id);
  const payload = await buildChatTransferBundlePayload(chat, messages);
  return {
    filename: buildChatTransferFilename(chat.title),
    payload,
  };
}

export async function importChatBundle(
  userId: string,
  file: Express.Multer.File,
  userRole?: string,
): Promise<ConversationListItem> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.buffer.toString('utf8'));
  } catch {
    throw new AppError(400, 'INVALID_CHAT_BUNDLE', 'Не удалось прочитать файл переноса чата');
  }

  const payload = (parsed && typeof parsed === 'object')
    ? (('data' in (parsed as Record<string, unknown>))
      ? ((parsed as { data?: unknown }).data ?? null)
      : parsed)
    : null;

  if (!payload || typeof payload !== 'object') {
    throw new AppError(400, 'INVALID_CHAT_BUNDLE', 'Файл переноса чата имеет неверный формат');
  }

  const bundle = payload as Partial<ChatTransferBundlePayload>;
  const rawMessages = Array.isArray(bundle.messages) ? bundle.messages : [];
  if (rawMessages.length === 0) {
    throw new AppError(400, 'INVALID_CHAT_BUNDLE', 'В файле переноса нет сообщений');
  }

  const messages: ChatTransferMessage[] = rawMessages
    .filter((item) => Boolean(item && typeof item === 'object'))
    .map((item): ChatTransferMessage => {
      const record = item as Partial<ChatTransferMessage>;
      return {
        role: record.role === 'assistant' ? 'assistant' : 'user',
        content: typeof record.content === 'string' ? record.content : '',
        usage: record.usage && typeof record.usage === 'object' ? (record.usage as Record<string, unknown>) : null,
        project_run_count: typeof record.project_run_count === 'number' ? record.project_run_count : null,
        latency_ms: typeof record.latency_ms === 'number' ? record.latency_ms : null,
        created_at: typeof record.created_at === 'string' ? record.created_at : new Date().toISOString(),
      };
    })
    .filter((item) => item.content.trim().length > 0 || item.role === 'assistant');

  if (messages.length === 0) {
    throw new AppError(400, 'INVALID_CHAT_BUNDLE', 'В файле переноса нет валидных сообщений');
  }

  const rawAttachments = Array.isArray(bundle.attachments) ? bundle.attachments : [];
  const attachmentMetaMap = new Map<string, ChatAttachmentMeta>();

  for (const item of rawAttachments) {
    if (!item || typeof item !== 'object') continue;
    const attachment = item as Partial<ChatTransferAttachment>;
    const sourceFilename = typeof attachment.filename === 'string' ? attachment.filename.trim() : '';
    const originalName = typeof attachment.original_name === 'string' ? attachment.original_name.trim() : '';
    const dataBase64 = typeof attachment.data_base64 === 'string' ? attachment.data_base64.trim() : '';
    if (!sourceFilename || !dataBase64) continue;

    let buffer: Buffer;
    try {
      buffer = Buffer.from(dataBase64, 'base64');
    } catch {
      continue;
    }

    const ext = getExtensionForImportedAttachment({
      filename: sourceFilename,
      original_name: originalName || sourceFilename,
      mime_type: typeof attachment.mime_type === 'string' ? attachment.mime_type : 'application/octet-stream',
      kind: attachment.kind === 'image' || attachment.kind === 'text' ? attachment.kind : 'file',
      size: typeof attachment.size === 'number' ? attachment.size : buffer.length,
      data_base64: dataBase64,
    });
    const filename = `${uuidv4()}${ext}`;
    await writeFile(safeAttachmentPath(filename), buffer);

    const mime = typeof attachment.mime_type === 'string' && attachment.mime_type.trim()
      ? attachment.mime_type.trim()
      : getAttachmentMimeType(filename);
    const kind: ChatAttachmentMeta['kind'] = attachment.kind === 'image' || attachment.kind === 'text' || attachment.kind === 'file'
      ? attachment.kind
      : (isImageMime(mime) ? 'image' : (isTextMime(mime) ? 'text' : 'file'));
    const meta: ChatAttachmentMeta = {
      filename,
      original_name: originalName || sourceFilename,
      mime_type: mime,
      size: buffer.length,
      kind,
      url: `/uploads/chat/${filename}`,
    };

    if (kind === 'text') {
      try {
        const compact = buffer.toString('utf8').replace(/\r\n/g, '\n').trim();
        if (compact.length > 0) {
          meta.text_preview = compact.slice(0, 400);
        }
      } catch {
      }
    }

    attachmentMetaMap.set(sourceFilename, meta);
  }

  const remappedMessages = messages.map((message) => {
    if (!message.usage) return message;
    const usageCopy: Record<string, unknown> = { ...message.usage };
    const usageAttachments = extractUsageAttachments(message.usage);
    if (usageAttachments.length > 0) {
      usageCopy.attachments = usageAttachments
        .map((attachment) => attachmentMetaMap.get(attachment.filename) ?? null)
        .filter((attachment): attachment is ChatAttachmentMeta => Boolean(attachment));
    }
    return {
      ...message,
      usage: stripGeneratedFilesFromUsage(usageCopy),
    };
  });

  const bundleTitle = typeof bundle.chat?.title === 'string' && bundle.chat.title.trim()
    ? bundle.chat.title.trim()
    : 'Импортированный чат';
  const bundleMode: ChatMode = bundle.chat?.mode === 'agent' ? 'agent' : 'general';
  const bundleAgentName = typeof bundle.chat?.agent_name === 'string' ? bundle.chat.agent_name.trim() || null : null;
  const bundleAgentModel = typeof bundle.chat?.agent_model_external_id === 'string'
    ? bundle.chat.agent_model_external_id.trim() || null
    : null;
  const bundleModel = typeof bundle.chat?.model_external_id === 'string'
    ? bundle.chat.model_external_id.trim() || null
    : null;

  let nextMode: ChatMode = bundleMode;
  let agentId: string | null = null;
  let modelExternalId: string | null = null;

  if (bundleMode === 'agent') {
    agentId = await findImportTargetAgent(userId, userRole, bundleAgentName, bundleAgentModel);
    if (!agentId) {
      nextMode = 'general';
      modelExternalId = deriveImportedGeneralModel(remappedMessages, bundleModel ?? bundleAgentModel);
    }
  } else {
    modelExternalId = deriveImportedGeneralModel(remappedMessages, bundleModel);
  }

  const shareToken = uuidv4().replace(/-/g, '').slice(0, 16);
  const createdAtFallback = new Date();
  const orderedMessages = remappedMessages
    .map((message, index) => ({
      ...message,
      createdAtDate: sanitizeImportedDate(
        message.created_at,
        new Date(createdAtFallback.getTime() + index * 1000),
      ),
    }))
    .sort((a, b) => a.createdAtDate.getTime() - b.createdAtDate.getTime());

  const lastMessageAt = orderedMessages[orderedMessages.length - 1]?.createdAtDate ?? createdAtFallback;
  const importedToolIds = nextMode === 'general' ? await mergeAutoChatToolIds([]) : [];

  const [chat] = await db.insert(chatConversations).values({
    user_id: userId,
    agent_id: agentId,
    mode: nextMode,
    title: bundleTitle.slice(0, 500),
    model_external_id: nextMode === 'general' ? (modelExternalId ?? DEFAULT_GENERAL_MODEL) : null,
    system_prompt: null,
    access: 'private',
    access_identifiers: [],
    share_token: shareToken,
    settings_json: buildChatSettingsJson(null, {
      tool_ids: importedToolIds,
      tool_agent_id: null,
    }),
    last_message_at: lastMessageAt,
    created_at: createdAtFallback,
    updated_at: new Date(),
  }).returning();

  if (orderedMessages.length > 0) {
    await db.insert(chatConversationMessages).values(
      orderedMessages.map((message) => ({
        conversation_id: chat.id,
        role: message.role,
        content_text: message.content,
        run_id: null,
        usage_json: message.usage ?? null,
        project_run_count: message.project_run_count ?? 0,
        latency_ms: message.latency_ms ?? null,
        created_at: message.createdAtDate,
      })),
    );
  }

  if (nextMode === 'general' && importedToolIds.length > 0) {
    const toolAgentId = await ensureChatToolRuntimeAgent(
      { id: chat.id, title: chat.title },
      userId,
      importedToolIds,
      chat.model_external_id ?? DEFAULT_GENERAL_MODEL,
      chat.system_prompt,
    );

    await db.update(chatConversations)
      .set({
        settings_json: buildChatSettingsJson(chat.settings_json, {
          tool_ids: importedToolIds,
          tool_agent_id: toolAgentId,
        }),
        updated_at: new Date(),
      })
      .where(eq(chatConversations.id, chat.id));
  }

  const agentMeta = chat.mode === 'agent'
    ? await getAgentChatMeta(chat.agent_id ?? null)
    : null;
  const effectiveModelLabel = chat.mode === 'agent'
    ? (agentMeta?.agent_model_label ?? null)
    : getModelDisplayLabel(chat.model_external_id ?? null);

  return {
    id: chat.id,
    title: chat.title,
    note: extractChatNote(chat.settings_json),
    mode: chat.mode,
    agent_id: chat.agent_id ?? null,
    agent_name: agentMeta?.agent_name ?? null,
    agent_model_external_id: agentMeta?.agent_model_external_id ?? null,
    agent_model_label: agentMeta?.agent_model_label ?? null,
    effective_model_label: effectiveModelLabel,
    model_external_id: chat.model_external_id ?? null,
    access: chat.access,
    access_identifiers: normalizeAccessIdentifiers(chat.access_identifiers),
    share_token: chat.share_token ?? null,
    message_count: orderedMessages.length,
    last_message_preview: orderedMessages[orderedMessages.length - 1]?.content.slice(0, 160) ?? null,
    pending_run: null,
    pinned_at: chat.pinned_at ? toIso(chat.pinned_at) : null,
    last_message_at: toIso(chat.last_message_at),
    created_at: toIso(chat.created_at),
    updated_at: toIso(chat.updated_at),
    has_active_deployment: false,
  };
}

export async function listGalleryPreviews(limit = 24, viewerUserId?: string | null): Promise<GalleryPreviewItem[]> {
  const usdToRubRate = await getUsdToRubRate();
  const galleryLimit = Math.max(1, Math.min(limit, 120));
  const chunkSize = Math.max(60, Math.min(galleryLimit * 5, 300));
  const selectedRows: Array<{
    message_id: string;
    chat_id: string;
    chat_title: string;
    share_token: string | null;
    owner_user_id: string;
    chat_model_external_id: string | null;
    total_view_count: number;
    unique_view_count: number;
    author_email: string;
    author_username: string | null;
    author_name_raw: string | null;
    content_text: string;
    usage_json: Record<string, unknown> | null;
    preview_view_count: number;
    project_run_count: number;
    created_at: Date;
  }> = [];
  const selectedChatIds = new Set<string>();
  let offset = 0;

  const getGalleryItemKind = (report?: CodingReport | null): GalleryItemKind | null => {
    const preview = report?.preview;
    const project = report?.project;
    const hasPreview = Boolean(preview && (preview.type === 'html' || preview.type === 'url'));
    const hasProject = Boolean(project && project.runtime && Array.isArray(project.files) && project.files.length > 0);

    if (hasPreview && hasProject) return 'hybrid';
    if (hasProject) return 'project';
    if (hasPreview) return 'preview';
    return null;
  };

  while (selectedRows.length < galleryLimit) {
    const rows = await db
      .select({
        message_id: chatConversationMessages.id,
        chat_id: chatConversations.id,
        chat_title: chatConversations.title,
        share_token: chatConversations.share_token,
        owner_user_id: chatConversations.user_id,
        chat_model_external_id: chatConversations.model_external_id,
        total_view_count: chatConversations.total_view_count,
        unique_view_count: chatConversations.unique_view_count,
        author_email: users.email,
        author_username: users.username,
        author_name_raw: users.name,
        content_text: chatConversationMessages.content_text,
        usage_json: chatConversationMessages.usage_json,
        preview_view_count: chatConversationMessages.preview_view_count,
        project_run_count: chatConversationMessages.project_run_count,
        created_at: chatConversationMessages.created_at,
      })
      .from(chatConversationMessages)
      .innerJoin(chatConversations, eq(chatConversations.id, chatConversationMessages.conversation_id))
      .innerJoin(users, eq(users.id, chatConversations.user_id))
      .where(and(
        eq(chatConversationMessages.role, 'assistant'),
        eq(chatConversations.access, 'public'),
        eq(chatConversations.is_clone, false),
      ))
      .orderBy(desc(chatConversationMessages.created_at))
      .limit(chunkSize)
      .offset(offset);

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      if (selectedChatIds.has(row.chat_id)) {
        continue;
      }

      const rawUsage = (row.usage_json as Record<string, unknown> | null) ?? null;
      const normalized = normalizeAssistantChatPayload(row.content_text, rawUsage);
      const kind = getGalleryItemKind(normalized.codingReport);

      if (!kind) {
        continue;
      }

      selectedRows.push({
        ...row,
        usage_json: rawUsage,
      });
      selectedChatIds.add(row.chat_id);

      if (selectedRows.length >= galleryLimit) {
        break;
      }
    }

    offset += rows.length;
  }

  const chatIds = [...new Set(selectedRows.map((row) => row.chat_id))];
  const chatModelFallback = new Map(selectedRows.map((row) => [row.chat_id, row.chat_model_external_id ?? null]));
  const chatTotals = new Map<string, {
    usd_cost: number;
    model_costs: Map<string, number>;
  }>();
  const chatReactions = new Map<string, {
    reaction_counts: Record<ChatReactionType, number>;
    my_reaction: ChatReactionType | null;
  }>();

  if (chatIds.length > 0) {
    const [usageRows, messageCountRows, dailyViewRows] = await Promise.all([
      db
        .select({
          conversation_id: chatConversationMessages.conversation_id,
          usage_json: chatConversationMessages.usage_json,
        })
        .from(chatConversationMessages)
        .where(and(
          inArray(chatConversationMessages.conversation_id, chatIds),
          eq(chatConversationMessages.role, 'assistant'),
        )),
      db
        .select({
          conversation_id: chatConversationMessages.conversation_id,
          count: sql<number>`count(*)::int`,
        })
        .from(chatConversationMessages)
        .where(inArray(chatConversationMessages.conversation_id, chatIds))
        .groupBy(chatConversationMessages.conversation_id),
      db
        .select({
          conversation_id: chatConversationDailyViews.conversation_id,
          day: chatConversationDailyViews.day,
          total_views: chatConversationDailyViews.total_views,
        })
        .from(chatConversationDailyViews)
        .where(inArray(chatConversationDailyViews.conversation_id, chatIds)),
    ]);

    const messageCountMap = new Map(messageCountRows.map((row) => [row.conversation_id, row.count]));
    const recentViewCounts = new Map<string, { day: number; week: number; month: number }>();
    const now = new Date();
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const weekAgoUtc = todayUtc - (6 * 24 * 60 * 60 * 1000);
    const monthAgoUtc = todayUtc - (29 * 24 * 60 * 60 * 1000);

    for (const row of dailyViewRows) {
      const dayMs = Date.parse(`${row.day}T00:00:00.000Z`);
      if (!Number.isFinite(dayMs)) continue;

      const existing = recentViewCounts.get(row.conversation_id) ?? { day: 0, week: 0, month: 0 };
      if (dayMs >= todayUtc) existing.day += row.total_views ?? 0;
      if (dayMs >= weekAgoUtc) existing.week += row.total_views ?? 0;
      if (dayMs >= monthAgoUtc) existing.month += row.total_views ?? 0;
      recentViewCounts.set(row.conversation_id, existing);
    }

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

    const reactionRows = await db
      .select({
        conversation_id: chatConversationReactions.conversation_id,
        reaction_type: chatConversationReactions.reaction_type,
        user_id: chatConversationReactions.user_id,
      })
      .from(chatConversationReactions)
      .where(inArray(chatConversationReactions.conversation_id, chatIds));

    for (const row of reactionRows) {
      const existing = chatReactions.get(row.conversation_id) ?? {
        reaction_counts: emptyReactionCounts(),
        my_reaction: null,
      };
      const reactionType = row.reaction_type as ChatReactionType;
      if (CHAT_REACTION_TYPES.includes(reactionType)) {
        existing.reaction_counts[reactionType] += 1;
        if (viewerUserId && row.user_id === viewerUserId) {
          existing.my_reaction = reactionType;
        }
      }
      chatReactions.set(row.conversation_id, existing);
    }

    for (const row of selectedRows) {
      const recentViews = recentViewCounts.get(row.chat_id) ?? { day: 0, week: 0, month: 0 };
      (row as typeof row & {
        recent_view_count_day?: number;
        recent_view_count_week?: number;
        recent_view_count_month?: number;
        message_count?: number;
      }).recent_view_count_day = recentViews.day;
      (row as typeof row & {
        recent_view_count_day?: number;
        recent_view_count_week?: number;
        recent_view_count_month?: number;
        message_count?: number;
      }).recent_view_count_week = recentViews.week;
      (row as typeof row & {
        recent_view_count_day?: number;
        recent_view_count_week?: number;
        recent_view_count_month?: number;
        message_count?: number;
      }).recent_view_count_month = recentViews.month;
      (row as typeof row & {
        recent_view_count_day?: number;
        recent_view_count_week?: number;
        recent_view_count_month?: number;
        message_count?: number;
      }).message_count = messageCountMap.get(row.chat_id) ?? 0;
    }
  }

  const items: GalleryPreviewItem[] = [];

  for (const row of selectedRows) {
    const shareToken = await ensureChatShareToken(row.chat_id, row.share_token);
    const rawUsage = (row.usage_json as Record<string, unknown> | null) ?? null;
    const normalized = normalizeAssistantChatPayload(row.content_text, rawUsage);
    const preview = normalized.codingReport?.preview;
    const project = normalized.codingReport?.project;
    const kind = getGalleryItemKind(normalized.codingReport);
    const totals = chatTotals.get(row.chat_id);
    const dominantModel = totals
      ? [...totals.model_costs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      : (row.chat_model_external_id ?? null);
    const reactions = chatReactions.get(row.chat_id) ?? {
      reaction_counts: emptyReactionCounts(),
      my_reaction: null,
    };

    if (!kind) {
      continue;
    }

    const hasTrackedConversationViews = (row.total_view_count ?? 0) > 0 || (row.unique_view_count ?? 0) > 0;
    const uniqueViewCount = hasTrackedConversationViews
      ? (row.unique_view_count ?? 0)
      : (row.preview_view_count ?? 0);
    const totalViewCount = (row.total_view_count ?? 0) > 0
      ? (row.total_view_count ?? 0)
      : (row.preview_view_count ?? 0);

    items.push({
      message_id: row.message_id,
      chat_id: row.chat_id,
      chat_title: row.chat_title,
      chat_url: `/shared/chats/${shareToken}`,
      is_owner: Boolean(viewerUserId && row.owner_user_id === viewerUserId),
      kind,
      preview_title: preview?.title?.trim() || null,
      preview_type: preview?.type === 'html' || preview?.type === 'url' ? preview.type : null,
      preview_url: preview?.type === 'html'
        ? `/api/shared/chats/${shareToken}/messages/${row.message_id}/preview`
        : (preview?.url ?? null),
      preview_html: preview?.type === 'html' ? (preview.html ?? null) : null,
      project_title: project?.title?.trim() || null,
      project_runtime: project?.runtime ?? null,
      project_entrypoint: project?.entrypoint?.trim() || null,
      project_file_count: Array.isArray(project?.files) ? project.files.length : 0,
      project_run_count: row.project_run_count ?? 0,
      author_name: formatAuthorName({
        email: row.author_email,
        username: row.author_username,
        name: row.author_name_raw,
      }),
      author_username: row.author_username,
      view_count: uniqueViewCount,
      unique_view_count: uniqueViewCount,
      total_view_count: totalViewCount,
      recent_view_count_day: (row as typeof row & { recent_view_count_day?: number }).recent_view_count_day ?? 0,
      recent_view_count_week: (row as typeof row & { recent_view_count_week?: number }).recent_view_count_week ?? 0,
      recent_view_count_month: (row as typeof row & { recent_view_count_month?: number }).recent_view_count_month ?? 0,
      message_count: (row as typeof row & { message_count?: number }).message_count ?? 0,
      reaction_counts: reactions.reaction_counts,
      my_reaction: reactions.my_reaction,
      created_at: toIso(row.created_at),
      total_usd_cost: totals?.usd_cost ?? 0,
      total_rub_cost: (totals?.usd_cost ?? 0) * usdToRubRate,
      model: dominantModel,
    });
  }

  const dedupedItems: GalleryPreviewItem[] = [];
  const seenChatIds = new Set<string>();

  for (const item of items.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))) {
    if (seenChatIds.has(item.chat_id)) {
      continue;
    }
    seenChatIds.add(item.chat_id);
    dedupedItems.push(item);
  }

  return dedupedItems.slice(0, galleryLimit);
}

export async function listGalleryTextChats(
  limit = 8,
  viewerUserId?: string | null,
  sortByInput: unknown = 'newest',
): Promise<GalleryTextChatItem[]> {
  const galleryLimit = Math.max(1, Math.min(limit, 120));
  const sortBy = resolveGalleryTextChatSort(sortByInput);

  const candidateRows = await db
    .select({
      chat_id: chatConversations.id,
      chat_title: chatConversations.title,
      share_token: chatConversations.share_token,
      owner_user_id: chatConversations.user_id,
      author_email: users.email,
      author_username: users.username,
      author_name_raw: users.name,
      total_view_count: chatConversations.total_view_count,
      unique_view_count: chatConversations.unique_view_count,
      chat_model_external_id: chatConversations.model_external_id,
      created_at: chatConversations.created_at,
      latest_assistant_content_text: sql<string | null>`(
        select ${chatConversationMessages.content_text}
        from ${chatConversationMessages}
        where ${chatConversationMessages.conversation_id} = ${chatConversations.id}
          and ${chatConversationMessages.role} = 'assistant'
        order by ${chatConversationMessages.created_at} desc
        limit 1
      )`,
      latest_assistant_usage_json: sql<Record<string, unknown> | null>`(
        select ${chatConversationMessages.usage_json}
        from ${chatConversationMessages}
        where ${chatConversationMessages.conversation_id} = ${chatConversations.id}
          and ${chatConversationMessages.role} = 'assistant'
        order by ${chatConversationMessages.created_at} desc
        limit 1
      )`,
      latest_assistant_created_at: sql<Date | null>`(
        select ${chatConversationMessages.created_at}
        from ${chatConversationMessages}
        where ${chatConversationMessages.conversation_id} = ${chatConversations.id}
          and ${chatConversationMessages.role} = 'assistant'
        order by ${chatConversationMessages.created_at} desc
        limit 1
      )`,
    })
    .from(chatConversations)
    .innerJoin(users, eq(users.id, chatConversations.user_id))
    .where(and(
      eq(chatConversations.access, 'public'),
      eq(chatConversations.is_clone, false),
    ));

  const getGalleryItemKind = (report?: CodingReport | null): GalleryItemKind | null => {
    const preview = report?.preview;
    const project = report?.project;
    const hasPreview = Boolean(preview && (preview.type === 'html' || preview.type === 'url'));
    const hasProject = Boolean(project && project.runtime && Array.isArray(project.files) && project.files.length > 0);

    if (hasPreview && hasProject) return 'hybrid';
    if (hasProject) return 'project';
    if (hasPreview) return 'preview';
    return null;
  };

  const textChatCandidates = candidateRows
    .map((row) => {
      const rawText = row.latest_assistant_content_text?.trim() ?? '';
      if (!rawText) return null;

      const rawUsage = (row.latest_assistant_usage_json as Record<string, unknown> | null) ?? null;
      const normalized = normalizeAssistantChatPayload(rawText, rawUsage);

      if (getGalleryItemKind(normalized.codingReport)) {
        return null;
      }

      const textPreview = compactTextPreview(normalized.content || rawText);
      if (textPreview.length < 80) {
        return null;
      }

      return {
        ...row,
        rawUsage,
        text_preview: textPreview,
        latest_created_at: row.latest_assistant_created_at ?? row.created_at,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const chatIds = textChatCandidates.map((row) => row.chat_id);
  if (chatIds.length === 0) {
    return [];
  }

  const [messageCountRows, usageRows, dailyViewRows] = await Promise.all([
    db
      .select({
        conversation_id: chatConversationMessages.conversation_id,
        count: sql<number>`count(*)::int`,
      })
      .from(chatConversationMessages)
      .where(inArray(chatConversationMessages.conversation_id, chatIds))
      .groupBy(chatConversationMessages.conversation_id),
    db
      .select({
        conversation_id: chatConversationMessages.conversation_id,
        usage_json: chatConversationMessages.usage_json,
      })
      .from(chatConversationMessages)
      .where(and(
        inArray(chatConversationMessages.conversation_id, chatIds),
        eq(chatConversationMessages.role, 'assistant'),
      )),
    db
      .select({
        conversation_id: chatConversationDailyViews.conversation_id,
        day: chatConversationDailyViews.day,
        total_views: chatConversationDailyViews.total_views,
      })
      .from(chatConversationDailyViews)
      .where(inArray(chatConversationDailyViews.conversation_id, chatIds)),
  ]);

  const messageCountMap = new Map(messageCountRows.map((row) => [row.conversation_id, row.count]));
  const usageTotalsMap = new Map<string, { usd_cost: number; model_costs: Map<string, number> }>();
  for (const row of usageRows) {
    const rawUsage = (row.usage_json as Record<string, unknown> | null) ?? null;
    const usage = recalculateUsageCost(rawUsage);
    if (!usage) continue;

    const promptTokens = toNumberOrNull(usage.prompt_tokens) ?? 0;
    const completionTokens = toNumberOrNull(usage.completion_tokens) ?? 0;
    const model = (
      typeof usage.model === 'string'
      && usage.model.trim().length > 0
        ? usage.model.trim()
        : textChatCandidates.find((candidate) => candidate.chat_id === row.conversation_id)?.chat_model_external_id
    ) || DEFAULT_GENERAL_MODEL;
    const usdCost = Number(estimateCost(model, promptTokens, completionTokens));

    const existing = usageTotalsMap.get(row.conversation_id) ?? {
      usd_cost: 0,
      model_costs: new Map<string, number>(),
    };
    existing.usd_cost += usdCost;
    existing.model_costs.set(model, (existing.model_costs.get(model) ?? 0) + usdCost);
    usageTotalsMap.set(row.conversation_id, existing);
  }
  const recentViewCounts = new Map<string, { day: number; week: number; month: number }>();
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const weekAgoUtc = todayUtc - (6 * 24 * 60 * 60 * 1000);
  const monthAgoUtc = todayUtc - (29 * 24 * 60 * 60 * 1000);

  for (const row of dailyViewRows) {
    const dayMs = Date.parse(`${row.day}T00:00:00.000Z`);
    if (!Number.isFinite(dayMs)) continue;

    const existing = recentViewCounts.get(row.conversation_id) ?? { day: 0, week: 0, month: 0 };
    if (dayMs >= todayUtc) existing.day += row.total_views ?? 0;
    if (dayMs >= weekAgoUtc) existing.week += row.total_views ?? 0;
    if (dayMs >= monthAgoUtc) existing.month += row.total_views ?? 0;
    recentViewCounts.set(row.conversation_id, existing);
  }

  const items = await Promise.all(textChatCandidates.map(async (row) => {
    const shareToken = await ensureChatShareToken(row.chat_id, row.share_token);
    const recentViews = recentViewCounts.get(row.chat_id) ?? { day: 0, week: 0, month: 0 };
    const usageTotals = usageTotalsMap.get(row.chat_id);
    const dominantModel = usageTotals
      ? [...usageTotals.model_costs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      : null;
    return {
      chat_id: row.chat_id,
      chat_title: row.chat_title,
      chat_url: `/shared/chats/${shareToken}`,
      is_owner: Boolean(viewerUserId && row.owner_user_id === viewerUserId),
      author_name: formatAuthorName({
        email: row.author_email,
        username: row.author_username,
        name: row.author_name_raw,
      }),
      author_username: row.author_username,
      text_preview: row.text_preview,
      created_at: toIso(row.created_at),
      unique_view_count: row.unique_view_count ?? 0,
      total_view_count: row.total_view_count ?? 0,
      recent_view_count_day: recentViews.day,
      recent_view_count_week: recentViews.week,
      recent_view_count_month: recentViews.month,
      message_count: messageCountMap.get(row.chat_id) ?? 0,
      total_usd_cost: usageTotals?.usd_cost ?? 0,
      model: dominantModel ?? row.chat_model_external_id ?? null,
    };
  }));

  const sortedItems = items.sort((a, b) => {
    switch (sortBy) {
      case 'oldest':
        return Date.parse(a.created_at) - Date.parse(b.created_at);
      case 'views_day':
        return b.recent_view_count_day - a.recent_view_count_day || Date.parse(b.created_at) - Date.parse(a.created_at);
      case 'views_week':
        return b.recent_view_count_week - a.recent_view_count_week || Date.parse(b.created_at) - Date.parse(a.created_at);
      case 'views_month':
        return b.recent_view_count_month - a.recent_view_count_month || Date.parse(b.created_at) - Date.parse(a.created_at);
      case 'views_all':
        return b.total_view_count - a.total_view_count || Date.parse(b.created_at) - Date.parse(a.created_at);
      case 'message_count':
        return b.message_count - a.message_count || Date.parse(b.created_at) - Date.parse(a.created_at);
      case 'total_cost':
        return b.total_usd_cost - a.total_usd_cost || Date.parse(b.created_at) - Date.parse(a.created_at);
      case 'newest':
      default:
        return Date.parse(b.created_at) - Date.parse(a.created_at);
    }
  });

  return sortedItems.slice(0, galleryLimit);
}

export async function setGalleryPreviewReaction(chatId: string, userId: string, reactionType: ChatReactionType) {
  const chat = await getConversationById(chatId);
  if (chat.access !== 'public') {
    throw new AppError(403, 'FORBIDDEN', 'Реакции доступны только для общих чатов');
  }

  const now = new Date();
  await db.insert(chatConversationReactions)
    .values({
      conversation_id: chat.id,
      user_id: userId,
      reaction_type: reactionType,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [chatConversationReactions.conversation_id, chatConversationReactions.user_id],
      set: {
        reaction_type: reactionType,
        updated_at: now,
      },
    });

  return getGalleryReactionState(chat.id, userId);
}

export async function deleteGalleryPreviewReaction(chatId: string, userId: string) {
  const chat = await getConversationById(chatId);
  if (chat.access !== 'public') {
    throw new AppError(403, 'FORBIDDEN', 'Реакции доступны только для общих чатов');
  }

  await db.delete(chatConversationReactions)
    .where(and(
      eq(chatConversationReactions.conversation_id, chat.id),
      eq(chatConversationReactions.user_id, userId),
    ));

  return getGalleryReactionState(chat.id, userId);
}
