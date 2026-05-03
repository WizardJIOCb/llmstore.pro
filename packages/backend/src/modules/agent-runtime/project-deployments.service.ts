import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import type { Request } from 'express';
import { appendFile, mkdir, readFile, rm, writeFile } from 'fs/promises';
import net from 'net';
import path from 'path';
import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { env } from '../../config/env.js';
import { UPLOADS_DIR } from '../../config/upload.js';
import { users } from '../../db/schema/auth.js';
import { agents, agentVersions } from '../../db/schema/agents.js';
import { usageLedger } from '../../db/schema/analytics.js';
import { agentRuns, chatConversations, chatConversationMessages, chatProjectDeployments } from '../../db/schema/runtime.js';
import { AppError, NotFoundError } from '../../middleware/error-handler.js';
import { logger } from '../../lib/logger.js';
import { getUsdToRubRate } from '../../lib/app-settings.js';
import { extractProjectBundleFromMessageRecord, startRun, type CodingReportProject } from './runtime.service.js';
import {
  buildProjectServicesEnvForDeployment,
  getProjectServiceSpecsFromProject,
  listProjectServicesForDeployment,
  syncProjectServicesForDeployment,
  type ProjectServiceRecord,
} from './project-services.service.js';

const PROJECT_DEPLOY_HTTP_READY_TIMEOUT_MS = 15_000;
const PROJECT_DEPLOY_HTTP_PROBE_INTERVAL_MS = 500;
const PROJECT_DEPLOY_OUTPUT_LIMIT = 24_000;
const PROJECT_DEPLOYMENTS_DIR = path.join(UPLOADS_DIR, 'project-deployments');
const DEFAULT_DEPLOYMENT_AGENT_MODEL = 'google/gemini-2.0-flash-001';
const WEBHOOK_PROXY_FALLBACK_PATHS = ['/webhook', '/', '/api/webhook', '/telegram/webhook', '/telegram'];

export type ProjectDeploymentStatus = 'deploying' | 'running' | 'stopped' | 'failed';

export interface ProjectDeploymentRecord {
  id: string;
  status: ProjectDeploymentStatus;
  title: string;
  runtime: 'node' | 'python';
  entrypoint: string | null;
  env: Record<string, string>;
  services: ProjectServiceRecord[];
  webhook_url: string;
  linked_agent_id: string | null;
  linked_agent_name: string | null;
  linked_agent_model_external_id: string | null;
  model_external_id: string | null;
  effective_model_external_id: string | null;
  effective_model_source: 'deployment' | 'agent' | 'recent_run' | 'default' | null;
  runtime_model_external_id: string | null;
  agent_run_url: string | null;
  last_error: string | null;
  last_exit_code: number | null;
  last_signal: string | null;
  live_stdout: string;
  live_stderr: string;
  run_stats: {
    total_runs: number;
    completed_runs: number;
    failed_runs: number;
    total_prompt_tokens: number;
    total_completion_tokens: number;
    total_tokens: number;
    total_cost_usd: number;
    total_cost_rub: number;
    last_run_at: string | null;
  };
  recent_runs: Array<{
    id: string;
    status: string;
    input_summary: string | null;
    output_summary: string | null;
    error_message: string | null;
    latency_ms: number | null;
    started_at: string;
    completed_at: string | null;
    total_tokens: number;
    estimated_cost_usd: number;
  }>;
  created_at: string;
  updated_at: string;
  last_started_at: string | null;
  last_stopped_at: string | null;
}

export interface AdminProjectDeploymentRecord extends ProjectDeploymentRecord {
  conversation_id: string;
  message_id: string;
  owner_user_id: string;
  owner_name: string | null;
  owner_username: string | null;
  owner_email: string;
  chat_title: string;
  chat_share_token: string | null;
}

interface AdminProjectDeploymentsQuery {
  search?: string;
  status?: string;
}

interface DeploymentRuntime {
  child: ReturnType<typeof spawn>;
  port: number;
  workspaceDir: string;
  stdout: string;
  stderr: string;
  desiredStop: boolean;
}

interface DeploymentUpsertInput {
  env?: Record<string, string>;
  linked_agent_id?: string | null;
  model_external_id?: string | null;
  set_telegram_webhook?: boolean;
}

export interface DeploymentControlInput extends DeploymentUpsertInput {
  action: 'start' | 'stop' | 'update_settings';
}

interface DeploymentAgentRunInput {
  message: string;
}

const deploymentRuntimes = new Map<string, DeploymentRuntime>();
const deploymentStartLocks = new Map<string, Promise<void>>();

function trimOutput(value: string): string {
  if (value.length <= PROJECT_DEPLOY_OUTPUT_LIMIT) return value;
  return `${value.slice(0, PROJECT_DEPLOY_OUTPUT_LIMIT)}\n...[truncated]`;
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function getRuntimeModelExternalId(runtimeConfig?: Record<string, unknown> | null): string | null {
  const value = runtimeConfig?.model_external_id;
  return typeof value === 'string' ? (value.trim() || null) : null;
}

function normalizeDeploymentModelExternalId(modelId?: string | null): string | null {
  return typeof modelId === 'string' ? (modelId.trim() || null) : null;
}

function resolveDeploymentModelInfo(input: {
  linked_agent_id: string | null;
  deployment_model_external_id: string | null;
  linked_agent_model_external_id: string | null;
  latest_run_model_external_id: string | null;
}): {
  savedModelExternalId: string | null;
  linkedAgentModelExternalId: string | null;
  effectiveModelExternalId: string | null;
  effectiveModelSource: 'deployment' | 'agent' | 'recent_run' | 'default' | null;
} {
  const savedModelExternalId = normalizeDeploymentModelExternalId(input.deployment_model_external_id);
  const linkedAgentModelExternalId = normalizeDeploymentModelExternalId(input.linked_agent_model_external_id);
  const latestRunModelExternalId = normalizeDeploymentModelExternalId(input.latest_run_model_external_id);

  if (!input.linked_agent_id) {
    return {
      savedModelExternalId,
      linkedAgentModelExternalId,
      effectiveModelExternalId: null,
      effectiveModelSource: null,
    };
  }

  if (savedModelExternalId) {
    return {
      savedModelExternalId,
      linkedAgentModelExternalId,
      effectiveModelExternalId: savedModelExternalId,
      effectiveModelSource: 'deployment',
    };
  }

  if (linkedAgentModelExternalId) {
    return {
      savedModelExternalId,
      linkedAgentModelExternalId,
      effectiveModelExternalId: linkedAgentModelExternalId,
      effectiveModelSource: 'agent',
    };
  }

  if (latestRunModelExternalId) {
    return {
      savedModelExternalId,
      linkedAgentModelExternalId,
      effectiveModelExternalId: latestRunModelExternalId,
      effectiveModelSource: 'recent_run',
    };
  }

  return {
    savedModelExternalId,
    linkedAgentModelExternalId,
    effectiveModelExternalId: DEFAULT_DEPLOYMENT_AGENT_MODEL,
    effectiveModelSource: 'default',
  };
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
  if (project.runtime !== 'node' && project.runtime !== 'python') {
    throw new AppError(400, 'PROJECT_RUNTIME_UNSUPPORTED', 'Deploy пока поддерживает только Node.js и Python HTTP-проекты');
  }

  const entrypoint = pickProjectEntrypoint(project);
  if (!entrypoint) {
    throw new AppError(400, 'PROJECT_ENTRYPOINT_REQUIRED', 'Для deploy нужен entrypoint проекта');
  }

  if (project.runtime === 'python') {
    return { command: 'python3', args: [entrypoint], entrypoint };
  }

  return { command: 'node', args: [entrypoint], entrypoint };
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

async function waitForHttpReadiness(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const candidates = ['/api/health', '/health', '/'];

  while (Date.now() < deadline) {
    for (const pathname of candidates) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
          signal: AbortSignal.timeout(1200),
          redirect: 'manual',
        });
        if (response.status >= 200 && response.status < 500) {
          return;
        }
      } catch {
        // Poll until deadline.
      }
    }

    await new Promise((resolve) => setTimeout(resolve, PROJECT_DEPLOY_HTTP_PROBE_INTERVAL_MS));
  }

  throw new AppError(504, 'PROJECT_DEPLOY_TIMEOUT', 'Проект не поднял HTTP endpoint в отведённый таймаут');
}

async function stopChildProcess(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.killed || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 600));
  if (child.exitCode === null) {
    child.kill('SIGKILL');
  }
}

function sanitizeEnvValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\r\n/g, '\n');
  return normalized.length <= 4000 ? normalized : normalized.slice(0, 4000);
}

function normalizeDeploymentEnv(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const normalized: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const envKey = key.trim().toUpperCase();
    if (!/^[A-Z_][A-Z0-9_]{0,63}$/.test(envKey)) continue;
    const envValue = sanitizeEnvValue(rawValue);
    if (envValue == null) continue;
    normalized[envKey] = envValue;
    if (Object.keys(normalized).length >= 32) break;
  }

  return normalized;
}

async function ensureLinkedAgentIsVisible(agentId: string, userId: string): Promise<{ id: string; name: string | null }> {
  const [agent] = await db
    .select({
      id: agents.id,
      name: agents.name,
      owner_user_id: agents.owner_user_id,
      visibility: agents.visibility,
      status: agents.status,
      current_version_id: agents.current_version_id,
    })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent || agent.status !== 'active' || !agent.current_version_id) {
    throw new AppError(400, 'LINKED_AGENT_UNAVAILABLE', 'Выбранный агент сейчас недоступен');
  }

  if (agent.visibility !== 'public' && agent.owner_user_id !== userId) {
    throw new AppError(403, 'FORBIDDEN', 'Этот агент недоступен для привязки к webhook-проекту');
  }

  return { id: agent.id, name: agent.name ?? null };
}

async function ensureOwnedProjectMessage(chatId: string, messageId: string, userId: string) {
  const [row] = await db
    .select({
      conversation_id: chatConversationMessages.conversation_id,
      role: chatConversationMessages.role,
      user_id: chatConversations.user_id,
      content_text: chatConversationMessages.content_text,
      usage_json: chatConversationMessages.usage_json,
    })
    .from(chatConversationMessages)
    .innerJoin(chatConversations, eq(chatConversations.id, chatConversationMessages.conversation_id))
    .where(and(
      eq(chatConversationMessages.id, messageId),
      eq(chatConversationMessages.conversation_id, chatId),
      eq(chatConversations.user_id, userId),
    ))
    .limit(1);

  if (!row || row.role !== 'assistant') {
    throw new NotFoundError('Project bundle not found');
  }

  const project = extractProjectBundleFromMessageRecord({
    content_text: row.content_text,
    usage_json: row.usage_json as Record<string, unknown> | null,
  });

  if (project.runtime !== 'node' && project.runtime !== 'python') {
    throw new AppError(400, 'PROJECT_RUNTIME_UNSUPPORTED', 'Deploy сейчас поддерживает только Node.js и Python HTTP-проекты');
  }

  return project;
}

function getDeploymentWorkspaceDir(deploymentId: string): string {
  return path.join(PROJECT_DEPLOYMENTS_DIR, deploymentId, 'workspace');
}

function getDeploymentDir(deploymentId: string): string {
  return path.join(PROJECT_DEPLOYMENTS_DIR, deploymentId);
}

function getDeploymentLogPath(deploymentId: string, stream: 'stdout' | 'stderr'): string {
  return path.join(getDeploymentDir(deploymentId), `${stream}.log`);
}

function buildWebhookUrl(publicToken: string): string {
  return new URL(`/api/project-deployments/${publicToken}/webhook`, env.BACKEND_URL).toString();
}

function buildAgentRunUrl(publicToken: string): string {
  return new URL(`/api/project-deployments/${publicToken}/agent-run`, env.BACKEND_URL).toString();
}

async function materializeProjectFiles(project: CodingReportProject, workspaceDir: string): Promise<void> {
  await rm(workspaceDir, { recursive: true, force: true }).catch(() => undefined);
  await mkdir(workspaceDir, { recursive: true });

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

async function resetDeploymentLogs(deploymentId: string): Promise<void> {
  await mkdir(getDeploymentDir(deploymentId), { recursive: true });
  await Promise.all([
    writeFile(getDeploymentLogPath(deploymentId, 'stdout'), '', 'utf8'),
    writeFile(getDeploymentLogPath(deploymentId, 'stderr'), '', 'utf8'),
  ]);
}

function persistDeploymentLogChunk(
  deploymentId: string,
  stream: 'stdout' | 'stderr',
  chunk: string,
): void {
  void appendFile(getDeploymentLogPath(deploymentId, stream), chunk, 'utf8').catch((error) => {
    logger.warn({ err: error, deploymentId, stream }, 'Failed to persist deployment log chunk');
  });
}

async function readDeploymentLogsForId(
  deploymentId: string,
): Promise<{ stdout: string; stderr: string }> {
  const runtime = deploymentRuntimes.get(deploymentId);
  if (runtime) {
    return { stdout: runtime.stdout, stderr: runtime.stderr };
  }

  let stdout = '';
  let stderr = '';
  try {
    stdout = await readFile(getDeploymentLogPath(deploymentId, 'stdout'), 'utf8');
  } catch {
    // noop
  }
  try {
    stderr = await readFile(getDeploymentLogPath(deploymentId, 'stderr'), 'utf8');
  } catch {
    // noop
  }

  return { stdout: trimOutput(stdout), stderr: trimOutput(stderr) };
}

async function updateDeploymentState(
  deploymentId: string,
  patch: Partial<typeof chatProjectDeployments.$inferInsert>,
) {
  const [row] = await db.update(chatProjectDeployments)
    .set({ ...patch, updated_at: new Date() })
    .where(eq(chatProjectDeployments.id, deploymentId))
    .returning();

  return row ?? null;
}

async function getDeploymentWithAgentMeta(deploymentId: string, userId: string) {
  const [row] = await db
    .select({
      id: chatProjectDeployments.id,
      conversation_id: chatProjectDeployments.conversation_id,
      message_id: chatProjectDeployments.message_id,
      user_id: chatProjectDeployments.user_id,
      linked_agent_id: chatProjectDeployments.linked_agent_id,
      model_external_id: chatProjectDeployments.model_external_id,
      title: chatProjectDeployments.title,
      runtime: chatProjectDeployments.runtime,
      entrypoint: chatProjectDeployments.entrypoint,
      public_token: chatProjectDeployments.public_token,
      deployment_secret: chatProjectDeployments.deployment_secret,
      env_json: chatProjectDeployments.env_json,
      status: chatProjectDeployments.status,
      last_error: chatProjectDeployments.last_error,
      last_exit_code: chatProjectDeployments.last_exit_code,
      last_signal: chatProjectDeployments.last_signal,
      last_started_at: chatProjectDeployments.last_started_at,
      last_stopped_at: chatProjectDeployments.last_stopped_at,
      created_at: chatProjectDeployments.created_at,
      updated_at: chatProjectDeployments.updated_at,
      linked_agent_name: agents.name,
      agent_runtime_config: agentVersions.runtime_config,
    })
    .from(chatProjectDeployments)
    .leftJoin(agents, eq(agents.id, chatProjectDeployments.linked_agent_id))
    .leftJoin(agentVersions, eq(agentVersions.id, agents.current_version_id))
    .where(and(
      eq(chatProjectDeployments.id, deploymentId),
      eq(chatProjectDeployments.user_id, userId),
    ))
    .limit(1);

  if (!row) {
    throw new NotFoundError('Deployment not found');
  }

  return row;
}

async function getDeploymentWithAdminMeta(deploymentId: string) {
  const [row] = await db
    .select({
      id: chatProjectDeployments.id,
      conversation_id: chatProjectDeployments.conversation_id,
      message_id: chatProjectDeployments.message_id,
      user_id: chatProjectDeployments.user_id,
      linked_agent_id: chatProjectDeployments.linked_agent_id,
      model_external_id: chatProjectDeployments.model_external_id,
      title: chatProjectDeployments.title,
      runtime: chatProjectDeployments.runtime,
      entrypoint: chatProjectDeployments.entrypoint,
      public_token: chatProjectDeployments.public_token,
      deployment_secret: chatProjectDeployments.deployment_secret,
      env_json: chatProjectDeployments.env_json,
      status: chatProjectDeployments.status,
      last_error: chatProjectDeployments.last_error,
      last_exit_code: chatProjectDeployments.last_exit_code,
      last_signal: chatProjectDeployments.last_signal,
      last_started_at: chatProjectDeployments.last_started_at,
      last_stopped_at: chatProjectDeployments.last_stopped_at,
      created_at: chatProjectDeployments.created_at,
      updated_at: chatProjectDeployments.updated_at,
      linked_agent_name: agents.name,
      agent_runtime_config: agentVersions.runtime_config,
      owner_name: users.name,
      owner_username: users.username,
      owner_email: users.email,
      chat_title: chatConversations.title,
      chat_share_token: chatConversations.share_token,
    })
    .from(chatProjectDeployments)
    .innerJoin(chatConversations, eq(chatConversations.id, chatProjectDeployments.conversation_id))
    .innerJoin(users, eq(users.id, chatProjectDeployments.user_id))
    .leftJoin(agents, eq(agents.id, chatProjectDeployments.linked_agent_id))
    .leftJoin(agentVersions, eq(agentVersions.id, agents.current_version_id))
    .where(eq(chatProjectDeployments.id, deploymentId))
    .limit(1);

  if (!row) {
    throw new NotFoundError('Deployment not found');
  }

  return row;
}

async function getDeploymentRunInsights(
  deploymentId: string,
): Promise<ProjectDeploymentRecord['run_stats'] & {
  latest_model_external_id: string | null;
  recent_runs: ProjectDeploymentRecord['recent_runs'];
}> {
  const usdToRubRate = await getUsdToRubRate();

  const [statsRow] = await db
    .select({
      total_runs: sql<number>`count(${agentRuns.id})::int`,
      completed_runs: sql<number>`count(*) filter (where ${agentRuns.status} = 'completed')::int`,
      failed_runs: sql<number>`count(*) filter (where ${agentRuns.status} = 'failed')::int`,
      total_prompt_tokens: sql<number>`coalesce(sum(${usageLedger.prompt_tokens}), 0)::int`,
      total_completion_tokens: sql<number>`coalesce(sum(${usageLedger.completion_tokens}), 0)::int`,
      total_tokens: sql<number>`coalesce(sum(${usageLedger.total_tokens}), 0)::int`,
      total_cost_usd: sql<string>`coalesce(sum(${usageLedger.estimated_cost}::numeric), 0)`,
      last_run_at: sql<string | Date | null>`max(${agentRuns.started_at})`,
    })
    .from(agentRuns)
    .leftJoin(usageLedger, eq(usageLedger.run_id, agentRuns.id))
    .where(eq(agentRuns.deployment_id, deploymentId));

  const recentRows = await db
    .select({
      id: agentRuns.id,
      status: agentRuns.status,
      input_summary: agentRuns.input_summary,
      output_summary: agentRuns.output_summary,
      error_message: agentRuns.error_message,
      latency_ms: agentRuns.latency_ms,
      started_at: agentRuns.started_at,
      completed_at: agentRuns.completed_at,
      model_external_id: usageLedger.model_external_id,
      total_tokens: sql<number>`coalesce(${usageLedger.total_tokens}, 0)::int`,
      estimated_cost_usd: sql<string>`coalesce(${usageLedger.estimated_cost}::numeric, 0)`,
    })
    .from(agentRuns)
    .leftJoin(usageLedger, eq(usageLedger.run_id, agentRuns.id))
    .where(eq(agentRuns.deployment_id, deploymentId))
    .orderBy(desc(agentRuns.started_at))
    .limit(8);

  const totalCostUsd = Number(statsRow?.total_cost_usd ?? 0);

  return {
    total_runs: statsRow?.total_runs ?? 0,
    completed_runs: statsRow?.completed_runs ?? 0,
    failed_runs: statsRow?.failed_runs ?? 0,
    total_prompt_tokens: statsRow?.total_prompt_tokens ?? 0,
    total_completion_tokens: statsRow?.total_completion_tokens ?? 0,
    total_tokens: statsRow?.total_tokens ?? 0,
    total_cost_usd: totalCostUsd,
    total_cost_rub: totalCostUsd * usdToRubRate,
    last_run_at: toIsoString(statsRow?.last_run_at),
    latest_model_external_id:
      recentRows.find((row) => typeof row.model_external_id === 'string' && row.model_external_id.trim().length > 0)?.model_external_id
      ?? null,
    recent_runs: recentRows.map((row) => ({
      id: row.id,
      status: row.status,
      input_summary: row.input_summary ?? null,
      output_summary: row.output_summary ?? null,
      error_message: row.error_message ?? null,
      latency_ms: row.latency_ms ?? null,
      started_at: toIsoString(row.started_at) ?? new Date(0).toISOString(),
      completed_at: toIsoString(row.completed_at),
      total_tokens: row.total_tokens ?? 0,
      estimated_cost_usd: Number(row.estimated_cost_usd ?? 0),
    })),
  };
}

async function toProjectDeploymentRecord(
  row: Awaited<ReturnType<typeof getDeploymentWithAgentMeta>>,
): Promise<ProjectDeploymentRecord> {
  const runtime = row.runtime === 'python' ? 'python' : 'node';
  const logs = await readDeploymentLogsForId(row.id);
  const services = await listProjectServicesForDeployment(row.id, row.user_id);
  const insights = await getDeploymentRunInsights(row.id);
  const modelInfo = resolveDeploymentModelInfo({
    linked_agent_id: row.linked_agent_id ?? null,
    deployment_model_external_id: row.model_external_id ?? null,
    linked_agent_model_external_id: getRuntimeModelExternalId(row.agent_runtime_config as Record<string, unknown> | null),
    latest_run_model_external_id: insights.latest_model_external_id,
  });

  return {
    id: row.id,
    status: (row.status as ProjectDeploymentStatus) ?? 'stopped',
    title: row.title,
    runtime,
    entrypoint: row.entrypoint ?? null,
    env: normalizeDeploymentEnv(row.env_json),
    services,
    webhook_url: buildWebhookUrl(row.public_token),
    linked_agent_id: row.linked_agent_id ?? null,
    linked_agent_name: row.linked_agent_name ?? null,
    linked_agent_model_external_id: modelInfo.linkedAgentModelExternalId,
    model_external_id: modelInfo.savedModelExternalId,
    effective_model_external_id: modelInfo.effectiveModelExternalId,
    effective_model_source: modelInfo.effectiveModelSource,
    runtime_model_external_id: modelInfo.effectiveModelExternalId,
    agent_run_url: row.linked_agent_id ? buildAgentRunUrl(row.public_token) : null,
    last_error: row.last_error ?? null,
    last_exit_code: row.last_exit_code ?? null,
    last_signal: row.last_signal ?? null,
    live_stdout: logs.stdout,
    live_stderr: logs.stderr,
    run_stats: {
      total_runs: insights.total_runs,
      completed_runs: insights.completed_runs,
      failed_runs: insights.failed_runs,
      total_prompt_tokens: insights.total_prompt_tokens,
      total_completion_tokens: insights.total_completion_tokens,
      total_tokens: insights.total_tokens,
      total_cost_usd: insights.total_cost_usd,
      total_cost_rub: insights.total_cost_rub,
      last_run_at: insights.last_run_at,
    },
    recent_runs: insights.recent_runs,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    last_started_at: row.last_started_at?.toISOString() ?? null,
    last_stopped_at: row.last_stopped_at?.toISOString() ?? null,
  };
}

async function toAdminProjectDeploymentRecord(
  row: Awaited<ReturnType<typeof getDeploymentWithAdminMeta>>,
): Promise<AdminProjectDeploymentRecord> {
  const runtime = row.runtime === 'python' ? 'python' : 'node';
  const logs = await readDeploymentLogsForId(row.id);
  const services = await listProjectServicesForDeployment(row.id, row.user_id);
  const insights = await getDeploymentRunInsights(row.id);
  const modelInfo = resolveDeploymentModelInfo({
    linked_agent_id: row.linked_agent_id ?? null,
    deployment_model_external_id: row.model_external_id ?? null,
    linked_agent_model_external_id: getRuntimeModelExternalId(row.agent_runtime_config as Record<string, unknown> | null),
    latest_run_model_external_id: insights.latest_model_external_id,
  });

  return {
    id: row.id,
    conversation_id: row.conversation_id,
    message_id: row.message_id,
    owner_user_id: row.user_id,
    owner_name: row.owner_name ?? null,
    owner_username: row.owner_username ?? null,
    owner_email: row.owner_email,
    chat_title: row.chat_title,
    chat_share_token: row.chat_share_token ?? null,
    status: (row.status as ProjectDeploymentStatus) ?? 'stopped',
    title: row.title,
    runtime,
    entrypoint: row.entrypoint ?? null,
    env: normalizeDeploymentEnv(row.env_json),
    services,
    webhook_url: buildWebhookUrl(row.public_token),
    linked_agent_id: row.linked_agent_id ?? null,
    linked_agent_name: row.linked_agent_name ?? null,
    linked_agent_model_external_id: modelInfo.linkedAgentModelExternalId,
    model_external_id: modelInfo.savedModelExternalId,
    effective_model_external_id: modelInfo.effectiveModelExternalId,
    effective_model_source: modelInfo.effectiveModelSource,
    runtime_model_external_id: modelInfo.effectiveModelExternalId,
    agent_run_url: row.linked_agent_id ? buildAgentRunUrl(row.public_token) : null,
    last_error: row.last_error ?? null,
    last_exit_code: row.last_exit_code ?? null,
    last_signal: row.last_signal ?? null,
    live_stdout: logs.stdout,
    live_stderr: logs.stderr,
    run_stats: {
      total_runs: insights.total_runs,
      completed_runs: insights.completed_runs,
      failed_runs: insights.failed_runs,
      total_prompt_tokens: insights.total_prompt_tokens,
      total_completion_tokens: insights.total_completion_tokens,
      total_tokens: insights.total_tokens,
      total_cost_usd: insights.total_cost_usd,
      total_cost_rub: insights.total_cost_rub,
      last_run_at: insights.last_run_at,
    },
    recent_runs: insights.recent_runs,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    last_started_at: row.last_started_at?.toISOString() ?? null,
    last_stopped_at: row.last_stopped_at?.toISOString() ?? null,
  };
}

async function installTelegramWebhookForDeployment(
  deploymentId: string,
  userId: string,
  envVars: Record<string, string>,
): Promise<void> {
  const row = await getDeploymentWithAgentMeta(deploymentId, userId);
  const token = envVars.TELEGRAM_BOT_TOKEN?.trim();
  const secretToken = envVars.TELEGRAM_SECRET_TOKEN?.trim();

  if (!token) {
    throw new AppError(400, 'TELEGRAM_BOT_TOKEN_REQUIRED', 'Чтобы сразу установить webhook, добавьте TELEGRAM_BOT_TOKEN в env');
  }

  if (secretToken && !/^[A-Za-z0-9_-]{1,256}$/.test(secretToken)) {
    throw new AppError(400, 'TELEGRAM_SECRET_TOKEN_INVALID', 'TELEGRAM_SECRET_TOKEN должен содержать только буквы, цифры, _, - и быть длиной до 256 символов');
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      url: buildWebhookUrl(row.public_token),
      ...(secretToken ? { secret_token: secretToken } : {}),
    }),
  });

  let payload: Record<string, unknown> | null = null;
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    // noop
  }

  const ok = payload?.ok === true;
  if (!response.ok || !ok) {
    const description = typeof payload?.description === 'string' ? payload.description : null;
    throw new AppError(
      502,
      'TELEGRAM_SET_WEBHOOK_FAILED',
      description ?? 'Telegram не принял setWebhook для этого deployment',
    );
  }
}

async function installTelegramWebhookForDeploymentIfConfigured(
  deploymentId: string,
  userId: string,
  envVars: Record<string, string>,
): Promise<boolean> {
  if (!envVars.TELEGRAM_BOT_TOKEN?.trim()) {
    return false;
  }

  await installTelegramWebhookForDeployment(deploymentId, userId, envVars);
  return true;
}

async function startDeploymentInternal(deploymentId: string, userId: string): Promise<void> {
  const existingLock = deploymentStartLocks.get(deploymentId);
  if (existingLock) {
    await existingLock;
    return;
  }

  const startPromise = (async () => {
    const row = await getDeploymentWithAgentMeta(deploymentId, userId);
    const project = await ensureOwnedProjectMessage(row.conversation_id, row.message_id, userId);
    const { command, args, entrypoint } = detectProjectCommand(project);

    const existingRuntime = deploymentRuntimes.get(deploymentId);
    if (existingRuntime) {
      existingRuntime.desiredStop = true;
      await stopChildProcess(existingRuntime.child).catch(() => undefined);
      deploymentRuntimes.delete(deploymentId);
    }

    await updateDeploymentState(deploymentId, {
      status: 'deploying',
      entrypoint,
      last_error: null,
      last_exit_code: null,
      last_signal: null,
    });

    const workspaceDir = getDeploymentWorkspaceDir(deploymentId);
    await resetDeploymentLogs(deploymentId);
    await materializeProjectFiles(project, workspaceDir);
    const { env: serviceEnv } = await buildProjectServicesEnvForDeployment(deploymentId, userId, workspaceDir);
    const port = await reserveTcpPort();

    const runtime: DeploymentRuntime = {
      child: null as unknown as ReturnType<typeof spawn>,
      port,
      workspaceDir,
      stdout: '',
      stderr: '',
      desiredStop: false,
    };

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
        PUBLIC_WEBHOOK_URL: buildWebhookUrl(row.public_token),
        LLMSTORE_BACKEND_URL: env.BACKEND_URL,
        LLMSTORE_DEPLOYMENT_ID: deploymentId,
        LLMSTORE_DEPLOYMENT_TOKEN: row.public_token,
        LLMSTORE_DEPLOYMENT_SECRET: row.deployment_secret,
        LLMSTORE_LINKED_AGENT_ID: row.linked_agent_id ?? '',
        LLMSTORE_AGENT_RUN_URL: row.linked_agent_id ? buildAgentRunUrl(row.public_token) : '',
        ...serviceEnv,
        ...normalizeDeploymentEnv(row.env_json),
      },
    });
    runtime.child = child;
    deploymentRuntimes.set(deploymentId, runtime);

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      runtime.stdout = trimOutput(`${runtime.stdout}${chunk}`);
      persistDeploymentLogChunk(deploymentId, 'stdout', chunk);
    });
    child.stderr?.on('data', (chunk: string) => {
      runtime.stderr = trimOutput(`${runtime.stderr}${chunk}`);
      persistDeploymentLogChunk(deploymentId, 'stderr', chunk);
    });

    child.once('exit', async (exitCode, signal) => {
      deploymentRuntimes.delete(deploymentId);
      const combinedError = trimOutput([runtime.stderr, runtime.stdout].filter(Boolean).join('\n\n')).trim();
      await updateDeploymentState(deploymentId, {
        status: runtime.desiredStop ? 'stopped' : 'failed',
        last_error: combinedError || null,
        last_exit_code: exitCode ?? null,
        last_signal: signal ?? null,
        last_stopped_at: new Date(),
      }).catch((error) => {
        logger.error({ err: error, deploymentId }, 'Failed to persist deployment exit state');
      });
    });

    child.once('error', async (error) => {
      deploymentRuntimes.delete(deploymentId);
      await updateDeploymentState(deploymentId, {
        status: 'failed',
        last_error: trimOutput(`${runtime.stderr}\n${String(error)}`.trim()) || String(error),
        last_stopped_at: new Date(),
      }).catch((persistError) => {
        logger.error({ err: persistError, deploymentId }, 'Failed to persist deployment spawn error');
      });
    });

    try {
      await waitForHttpReadiness(port, PROJECT_DEPLOY_HTTP_READY_TIMEOUT_MS);
      await updateDeploymentState(deploymentId, {
        status: 'running',
        entrypoint,
        last_error: null,
        last_exit_code: null,
        last_signal: null,
        last_started_at: new Date(),
      });
    } catch (error) {
      runtime.desiredStop = true;
      await stopChildProcess(child).catch(() => undefined);
      const errorMessage = error instanceof Error ? error.message : 'Проект не смог подняться';
      await updateDeploymentState(deploymentId, {
        status: 'failed',
        entrypoint,
        last_error: trimOutput([errorMessage, runtime.stderr, runtime.stdout].filter(Boolean).join('\n\n')),
        last_stopped_at: new Date(),
      });
      throw error;
    }
  })();

  deploymentStartLocks.set(deploymentId, startPromise);
  try {
    await startPromise;
  } finally {
    deploymentStartLocks.delete(deploymentId);
  }
}

async function stopDeploymentInternal(deploymentId: string, userId: string): Promise<void> {
  await getDeploymentWithAgentMeta(deploymentId, userId);
  const runtime = deploymentRuntimes.get(deploymentId);
  if (runtime) {
    runtime.desiredStop = true;
    await stopChildProcess(runtime.child).catch(() => undefined);
    deploymentRuntimes.delete(deploymentId);
  }

  await updateDeploymentState(deploymentId, {
    status: 'stopped',
    last_stopped_at: new Date(),
  });
}

async function getDeploymentByToken(publicToken: string) {
  const [row] = await db
    .select({
      id: chatProjectDeployments.id,
      user_id: chatProjectDeployments.user_id,
      linked_agent_id: chatProjectDeployments.linked_agent_id,
      model_external_id: chatProjectDeployments.model_external_id,
      title: chatProjectDeployments.title,
      runtime: chatProjectDeployments.runtime,
      entrypoint: chatProjectDeployments.entrypoint,
      public_token: chatProjectDeployments.public_token,
      deployment_secret: chatProjectDeployments.deployment_secret,
      env_json: chatProjectDeployments.env_json,
      status: chatProjectDeployments.status,
      last_error: chatProjectDeployments.last_error,
      last_exit_code: chatProjectDeployments.last_exit_code,
      last_signal: chatProjectDeployments.last_signal,
      last_started_at: chatProjectDeployments.last_started_at,
      last_stopped_at: chatProjectDeployments.last_stopped_at,
      created_at: chatProjectDeployments.created_at,
      updated_at: chatProjectDeployments.updated_at,
      conversation_id: chatProjectDeployments.conversation_id,
      message_id: chatProjectDeployments.message_id,
    })
    .from(chatProjectDeployments)
    .where(eq(chatProjectDeployments.public_token, publicToken))
    .limit(1);

  if (!row) {
    throw new NotFoundError('Deployment not found');
  }

  return row;
}

type DeploymentByTokenRow = Awaited<ReturnType<typeof getDeploymentByToken>>;

async function ensureRuntimeForDeployment(deployment: DeploymentByTokenRow): Promise<DeploymentRuntime> {
  if (deployment.status === 'stopped') {
    throw new AppError(503, 'DEPLOYMENT_STOPPED', 'Webhook-project остановлен');
  }

  let runtime = deploymentRuntimes.get(deployment.id);
  if (runtime && runtime.child.exitCode === null) {
    return runtime;
  }

  await startDeploymentInternal(deployment.id, deployment.user_id);
  runtime = deploymentRuntimes.get(deployment.id);
  if (!runtime) {
    throw new AppError(503, 'DEPLOYMENT_NOT_RUNNING', 'Не удалось поднять webhook-проект');
  }

  return runtime;
}

async function ensureRuntimeForWebhook(publicToken: string): Promise<DeploymentRuntime> {
  return ensureRuntimeForDeployment(await getDeploymentByToken(publicToken));
}

function buildProxyBody(req: Request): BodyInit | undefined {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return undefined;
  }

  if (req.body == null) return undefined;
  if (typeof req.body === 'string' || req.body instanceof Buffer) {
    return req.body;
  }

  return JSON.stringify(req.body);
}

function buildProxyHeaders(req: Request): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    const lowered = key.toLowerCase();
    if (['host', 'content-length', 'connection', 'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-host'].includes(lowered)) {
      continue;
    }

    if (Array.isArray(value)) {
      headers.set(key, value.join(', '));
    } else if (typeof value === 'string') {
      headers.set(key, value);
    }
  }

  if (!headers.has('content-type') && req.body && typeof req.body === 'object') {
    headers.set('content-type', 'application/json');
  }

  return headers;
}

function shouldReturnWebhookInfo(req: Request, suffix: string): boolean {
  return (req.method === 'GET' || req.method === 'HEAD') && !suffix;
}

function buildProxyTargetUrl(port: number, pathname: string, suffix: string, search: string): string {
  const normalizedPathname = pathname === '/' ? '/' : pathname.replace(/\/+$/g, '');
  const normalizedSuffix = suffix.startsWith('/') ? suffix : (suffix ? `/${suffix}` : '');
  const pathWithSuffix = normalizedPathname === '/'
    ? normalizedSuffix || '/'
    : `${normalizedPathname}${normalizedSuffix}`;

  return `http://127.0.0.1:${port}${pathWithSuffix}${search}`;
}

function buildJsonProxyResponse(status: number, body: unknown): { status: number; headers: Headers; body: Buffer } {
  const headers = new Headers();
  headers.set('content-type', 'application/json; charset=utf-8');
  return {
    status,
    headers,
    body: Buffer.from(JSON.stringify(body), 'utf8'),
  };
}

function getSingleHeader(req: Request, headerName: string): string {
  const value = req.headers[headerName.toLowerCase()];
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0] ?? '';
  return '';
}

function getTelegramUpdateId(req: Request): number | null {
  const body = req.body;
  if (!body || typeof body !== 'object' || Buffer.isBuffer(body) || Array.isArray(body)) {
    return null;
  }

  const updateId = (body as Record<string, unknown>).update_id;
  return typeof updateId === 'number' && Number.isFinite(updateId) ? updateId : null;
}

function isTelegramWebhookRequest(req: Request, deployment: DeploymentByTokenRow): boolean {
  if (req.method !== 'POST') return false;
  const deploymentEnv = normalizeDeploymentEnv(deployment.env_json);
  return Boolean(deploymentEnv.TELEGRAM_BOT_TOKEN && getTelegramUpdateId(req) != null);
}

function validateTelegramWebhookSecret(req: Request, deployment: DeploymentByTokenRow): boolean {
  const deploymentEnv = normalizeDeploymentEnv(deployment.env_json);
  const expectedSecret = deploymentEnv.TELEGRAM_SECRET_TOKEN?.trim();
  if (!expectedSecret) return true;
  return getSingleHeader(req, 'x-telegram-bot-api-secret-token') === expectedSecret;
}

async function fetchProjectDeploymentWebhook(
  runtime: DeploymentRuntime,
  request: {
    method: string;
    headers: Headers;
    body: BodyInit | undefined;
    suffix: string;
    search: string;
  },
): Promise<Response> {
  let response: Response | null = null;

  for (const pathname of WEBHOOK_PROXY_FALLBACK_PATHS) {
    response = await fetch(buildProxyTargetUrl(runtime.port, pathname, request.suffix, request.search), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'manual',
    });

    if (response.status !== 404 && response.status !== 405) {
      break;
    }
  }

  if (!response) {
    throw new AppError(502, 'WEBHOOK_PROXY_FAILED', 'Не удалось проксировать webhook в deployment');
  }

  return response;
}

async function forwardProjectDeploymentWebhookInBackground(
  deployment: DeploymentByTokenRow,
  request: {
    method: string;
    headers: Headers;
    body: BodyInit | undefined;
    suffix: string;
    search: string;
    updateId: number | null;
  },
): Promise<void> {
  const runtime = await ensureRuntimeForDeployment(deployment);
  const response = await fetchProjectDeploymentWebhook(runtime, request);
  const body = Buffer.from(await response.arrayBuffer()).toString('utf8').slice(0, 2000);

  if (!response.ok) {
    logger.warn({
      deploymentId: deployment.id,
      updateId: request.updateId,
      status: response.status,
      body,
    }, 'Background Telegram webhook handling returned non-2xx status');
  }
}

export async function getChatMessageProjectDeployment(
  chatId: string,
  messageId: string,
  userId: string,
): Promise<ProjectDeploymentRecord | null> {
  await ensureOwnedProjectMessage(chatId, messageId, userId);

  const [row] = await db
    .select({ id: chatProjectDeployments.id })
    .from(chatProjectDeployments)
    .where(and(
      eq(chatProjectDeployments.conversation_id, chatId),
      eq(chatProjectDeployments.message_id, messageId),
      eq(chatProjectDeployments.user_id, userId),
    ))
    .limit(1);

  if (!row) {
    return null;
  }

  return await toProjectDeploymentRecord(await getDeploymentWithAgentMeta(row.id, userId));
}

export async function upsertChatMessageProjectDeployment(
  chatId: string,
  messageId: string,
  userId: string,
  input: DeploymentUpsertInput,
): Promise<ProjectDeploymentRecord> {
  const project = await ensureOwnedProjectMessage(chatId, messageId, userId);
  const normalizedEnv = normalizeDeploymentEnv(input.env);
  const projectServiceSpecs = getProjectServiceSpecsFromProject(project);
  const linkedAgentId = input.linked_agent_id?.trim() || null;
  const modelExternalId = normalizeDeploymentModelExternalId(input.model_external_id);

  if (linkedAgentId) {
    await ensureLinkedAgentIsVisible(linkedAgentId, userId);
  }

  const { entrypoint } = detectProjectCommand(project);

  const [existing] = await db
    .select({ id: chatProjectDeployments.id })
    .from(chatProjectDeployments)
    .where(and(
      eq(chatProjectDeployments.conversation_id, chatId),
      eq(chatProjectDeployments.message_id, messageId),
      eq(chatProjectDeployments.user_id, userId),
    ))
    .limit(1);

  const deploymentId = existing?.id ?? randomUUID();
  if (!existing) {
    await db.insert(chatProjectDeployments).values({
      id: deploymentId,
      conversation_id: chatId,
      message_id: messageId,
      user_id: userId,
      linked_agent_id: linkedAgentId,
      model_external_id: modelExternalId,
      title: (project.title?.trim() || 'Project deployment').slice(0, 255),
      runtime: project.runtime,
      entrypoint,
      public_token: randomUUID().replace(/-/g, ''),
      deployment_secret: randomUUID().replace(/-/g, ''),
      env_json: normalizedEnv,
      status: 'deploying',
    });
  } else {
    await updateDeploymentState(existing.id, {
      linked_agent_id: linkedAgentId,
      model_external_id: modelExternalId,
      title: (project.title?.trim() || 'Project deployment').slice(0, 255),
      runtime: project.runtime,
      entrypoint,
      env_json: normalizedEnv,
      status: 'deploying',
    });
  }

  await syncProjectServicesForDeployment(deploymentId, userId, projectServiceSpecs);
  await startDeploymentInternal(deploymentId, userId);
  if (input.set_telegram_webhook) {
    await installTelegramWebhookForDeployment(deploymentId, userId, normalizedEnv);
  }
  return await toProjectDeploymentRecord(await getDeploymentWithAgentMeta(deploymentId, userId));
}

export async function startChatMessageProjectDeployment(
  chatId: string,
  messageId: string,
  userId: string,
): Promise<ProjectDeploymentRecord> {
  const deployment = await getChatMessageProjectDeployment(chatId, messageId, userId);
  if (!deployment) {
    throw new NotFoundError('Deployment not found');
  }

  await startDeploymentInternal(deployment.id, userId);
  await installTelegramWebhookForDeploymentIfConfigured(deployment.id, userId, deployment.env);
  return await toProjectDeploymentRecord(await getDeploymentWithAgentMeta(deployment.id, userId));
}

export async function reinstallTelegramWebhookForChatMessageProjectDeployment(
  chatId: string,
  messageId: string,
  userId: string,
): Promise<ProjectDeploymentRecord> {
  const deployment = await getChatMessageProjectDeployment(chatId, messageId, userId);
  if (!deployment) {
    throw new NotFoundError('Deployment not found');
  }

  await installTelegramWebhookForDeployment(deployment.id, userId, deployment.env);
  return await toProjectDeploymentRecord(await getDeploymentWithAgentMeta(deployment.id, userId));
}

export async function stopChatMessageProjectDeployment(
  chatId: string,
  messageId: string,
  userId: string,
): Promise<ProjectDeploymentRecord> {
  const deployment = await getChatMessageProjectDeployment(chatId, messageId, userId);
  if (!deployment) {
    throw new NotFoundError('Deployment not found');
  }

  await stopDeploymentInternal(deployment.id, userId);
  return await toProjectDeploymentRecord(await getDeploymentWithAgentMeta(deployment.id, userId));
}

export async function controlChatMessageProjectDeployment(
  chatId: string,
  messageId: string,
  userId: string,
  input: DeploymentControlInput,
): Promise<ProjectDeploymentRecord> {
  if (input.action === 'update_settings') {
    return upsertChatMessageProjectDeployment(chatId, messageId, userId, input);
  }

  const deployment = await getChatMessageProjectDeployment(chatId, messageId, userId);

  if (input.action === 'start') {
    if (!deployment) {
      return upsertChatMessageProjectDeployment(chatId, messageId, userId, input);
    }

    await startDeploymentInternal(deployment.id, userId);
    await installTelegramWebhookForDeploymentIfConfigured(
      deployment.id,
      userId,
      Object.keys(input.env ?? {}).length > 0 ? normalizeDeploymentEnv(input.env) : deployment.env,
    );
    return await toProjectDeploymentRecord(await getDeploymentWithAgentMeta(deployment.id, userId));
  }

  if (!deployment) {
    throw new NotFoundError('Deployment not found');
  }

  await stopDeploymentInternal(deployment.id, userId);
  return await toProjectDeploymentRecord(await getDeploymentWithAgentMeta(deployment.id, userId));
}

export async function proxyProjectDeploymentWebhook(
  publicToken: string,
  req: Request,
): Promise<{ status: number; headers: Headers; body: Buffer }> {
  const suffix = typeof req.params[0] === 'string' ? req.params[0] : '';
  const search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const deployment = await getDeploymentByToken(publicToken);

  if (shouldReturnWebhookInfo(req, suffix)) {
    return buildJsonProxyResponse(200, {
      ok: true,
      type: 'llmstore_project_deployment_webhook',
      deployment_id: deployment.id,
      status: deployment.status,
      title: deployment.title,
      message: 'Webhook URL is active. Telegram sends POST requests to this URL; opening it in a browser uses GET and does not call the bot.',
    });
  }

  const headers = buildProxyHeaders(req);
  const body = buildProxyBody(req);
  const updateId = getTelegramUpdateId(req);

  if (isTelegramWebhookRequest(req, deployment)) {
    if (!validateTelegramWebhookSecret(req, deployment)) {
      return buildJsonProxyResponse(403, {
        ok: false,
        error: 'TELEGRAM_SECRET_INVALID',
      });
    }

    if (deployment.status === 'stopped') {
      return buildJsonProxyResponse(200, {
        ok: true,
        ignored: true,
        status: deployment.status,
      });
    }

    void forwardProjectDeploymentWebhookInBackground(deployment, {
      method: req.method,
      headers,
      body,
      suffix,
      search,
      updateId,
    }).catch((error) => {
      logger.error({
        err: error,
        deploymentId: deployment.id,
        updateId,
      }, 'Failed to handle Telegram webhook in background');
    });

    return buildJsonProxyResponse(200, {
      ok: true,
      accepted: true,
    });
  }

  const runtime = await ensureRuntimeForWebhook(publicToken);
  const response = await fetchProjectDeploymentWebhook(runtime, {
    method: req.method,
    headers,
    body,
    suffix,
    search,
  });

  return {
    status: response.status,
    headers: response.headers,
    body: Buffer.from(await response.arrayBuffer()),
  };
}

export async function runLinkedAgentForProjectDeployment(
  publicToken: string,
  secret: string | undefined,
  input: DeploymentAgentRunInput,
): Promise<{ text: string; run_id: string; usage: Record<string, unknown> | null }> {
  const deployment = await getDeploymentByToken(publicToken);

  if (!deployment.linked_agent_id) {
    throw new AppError(400, 'DEPLOYMENT_AGENT_NOT_CONFIGURED', 'У этого deployment не привязан агент');
  }

  if (!secret || secret !== deployment.deployment_secret) {
    throw new AppError(403, 'FORBIDDEN', 'Неверный deployment secret');
  }

  const message = input.message.trim();
  if (!message) {
    throw new AppError(400, 'VALIDATION_ERROR', 'message обязателен');
  }

  const result = await startRun(deployment.linked_agent_id, deployment.user_id, {
    messages: [{ role: 'user', content: message }],
    model_external_id: deployment.model_external_id ?? null,
  }, {
    deployment_id: deployment.id,
    sync_to_chats: false,
    charge_usage: true,
  });

  if (result.status !== 'completed') {
    throw new AppError(502, 'DEPLOYMENT_AGENT_FAILED', result.error_message ?? 'Связанный агент не смог обработать запрос');
  }

  return {
    text: result.output || '',
    run_id: result.run_id,
    usage: result.usage ? (result.usage as unknown as Record<string, unknown>) : null,
  };
}

export async function readProjectDeploymentForUser(
  chatId: string,
  messageId: string,
  userId: string,
): Promise<ProjectDeploymentRecord | null> {
  return getChatMessageProjectDeployment(chatId, messageId, userId);
}

export async function readProjectDeploymentLogs(
  publicToken: string,
): Promise<{ stdout: string; stderr: string }> {
  const deployment = await getDeploymentByToken(publicToken);
  return readDeploymentLogsForId(deployment.id);
}

export async function listProjectDeploymentsForAdmin(
  query: AdminProjectDeploymentsQuery = {},
): Promise<{ items: AdminProjectDeploymentRecord[]; total: number }> {
  const conditions: SQL[] = [];

  if (query.status && query.status !== 'all') {
    conditions.push(eq(chatProjectDeployments.status, query.status));
  }

  if (query.search?.trim()) {
    const term = `%${query.search.trim()}%`;
    conditions.push(or(
      ilike(chatProjectDeployments.title, term),
      ilike(chatProjectDeployments.runtime, term),
      ilike(chatProjectDeployments.entrypoint, term),
      ilike(chatConversations.title, term),
      ilike(users.email, term),
      ilike(users.username, term),
      ilike(users.name, term),
      ilike(agents.name, term),
    )!);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({ id: chatProjectDeployments.id })
    .from(chatProjectDeployments)
    .innerJoin(chatConversations, eq(chatConversations.id, chatProjectDeployments.conversation_id))
    .innerJoin(users, eq(users.id, chatProjectDeployments.user_id))
    .leftJoin(agents, eq(agents.id, chatProjectDeployments.linked_agent_id))
    .where(where)
    .orderBy(desc(chatProjectDeployments.updated_at));

  const items = await Promise.all(
    rows.map(async ({ id }) => toAdminProjectDeploymentRecord(await getDeploymentWithAdminMeta(id))),
  );

  return {
    items,
    total: items.length,
  };
}

export async function startProjectDeploymentAsAdmin(deploymentId: string): Promise<AdminProjectDeploymentRecord> {
  const deployment = await getDeploymentWithAdminMeta(deploymentId);
  await startDeploymentInternal(deployment.id, deployment.user_id);
  await installTelegramWebhookForDeploymentIfConfigured(
    deployment.id,
    deployment.user_id,
    normalizeDeploymentEnv(deployment.env_json),
  );
  return toAdminProjectDeploymentRecord(await getDeploymentWithAdminMeta(deployment.id));
}

export async function stopProjectDeploymentAsAdmin(deploymentId: string): Promise<AdminProjectDeploymentRecord> {
  const deployment = await getDeploymentWithAdminMeta(deploymentId);
  await stopDeploymentInternal(deployment.id, deployment.user_id);
  return toAdminProjectDeploymentRecord(await getDeploymentWithAdminMeta(deployment.id));
}
