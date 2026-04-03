import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import type { Request } from 'express';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import net from 'net';
import path from 'path';
import { and, eq } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { env } from '../../config/env.js';
import { UPLOADS_DIR } from '../../config/upload.js';
import { agents } from '../../db/schema/agents.js';
import { chatConversations, chatConversationMessages, chatProjectDeployments } from '../../db/schema/runtime.js';
import { AppError, NotFoundError } from '../../middleware/error-handler.js';
import { logger } from '../../lib/logger.js';
import { extractProjectBundleFromMessageRecord, startRun, type CodingReportProject } from './runtime.service.js';

const PROJECT_DEPLOY_HTTP_READY_TIMEOUT_MS = 15_000;
const PROJECT_DEPLOY_HTTP_PROBE_INTERVAL_MS = 500;
const PROJECT_DEPLOY_OUTPUT_LIMIT = 24_000;
const PROJECT_DEPLOYMENTS_DIR = path.join(UPLOADS_DIR, 'project-deployments');

export type ProjectDeploymentStatus = 'deploying' | 'running' | 'stopped' | 'failed';

export interface ProjectDeploymentRecord {
  id: string;
  status: ProjectDeploymentStatus;
  title: string;
  runtime: 'node' | 'python';
  entrypoint: string | null;
  env: Record<string, string>;
  webhook_url: string;
  linked_agent_id: string | null;
  linked_agent_name: string | null;
  agent_run_url: string | null;
  last_error: string | null;
  last_exit_code: number | null;
  last_signal: string | null;
  live_stdout: string;
  live_stderr: string;
  created_at: string;
  updated_at: string;
  last_started_at: string | null;
  last_stopped_at: string | null;
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
  set_telegram_webhook?: boolean;
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
    })
    .from(chatProjectDeployments)
    .leftJoin(agents, eq(agents.id, chatProjectDeployments.linked_agent_id))
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

function toProjectDeploymentRecord(
  row: Awaited<ReturnType<typeof getDeploymentWithAgentMeta>>,
): ProjectDeploymentRecord {
  const runtime = row.runtime === 'python' ? 'python' : 'node';
  const live = deploymentRuntimes.get(row.id);

  return {
    id: row.id,
    status: (row.status as ProjectDeploymentStatus) ?? 'stopped',
    title: row.title,
    runtime,
    entrypoint: row.entrypoint ?? null,
    env: normalizeDeploymentEnv(row.env_json),
    webhook_url: buildWebhookUrl(row.public_token),
    linked_agent_id: row.linked_agent_id ?? null,
    linked_agent_name: row.linked_agent_name ?? null,
    agent_run_url: row.linked_agent_id ? buildAgentRunUrl(row.public_token) : null,
    last_error: row.last_error ?? null,
    last_exit_code: row.last_exit_code ?? null,
    last_signal: row.last_signal ?? null,
    live_stdout: live?.stdout ?? '',
    live_stderr: live?.stderr ?? '',
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
    await materializeProjectFiles(project, workspaceDir);
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
        ...normalizeDeploymentEnv(row.env_json),
      },
    });
    runtime.child = child;
    deploymentRuntimes.set(deploymentId, runtime);

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      runtime.stdout = trimOutput(`${runtime.stdout}${chunk}`);
    });
    child.stderr?.on('data', (chunk: string) => {
      runtime.stderr = trimOutput(`${runtime.stderr}${chunk}`);
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

async function ensureRuntimeForWebhook(publicToken: string): Promise<DeploymentRuntime> {
  const deployment = await getDeploymentByToken(publicToken);
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

  return toProjectDeploymentRecord(await getDeploymentWithAgentMeta(row.id, userId));
}

export async function upsertChatMessageProjectDeployment(
  chatId: string,
  messageId: string,
  userId: string,
  input: DeploymentUpsertInput,
): Promise<ProjectDeploymentRecord> {
  const project = await ensureOwnedProjectMessage(chatId, messageId, userId);
  const normalizedEnv = normalizeDeploymentEnv(input.env);
  const linkedAgentId = input.linked_agent_id?.trim() || null;

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
      title: (project.title?.trim() || 'Project deployment').slice(0, 255),
      runtime: project.runtime,
      entrypoint,
      env_json: normalizedEnv,
      status: 'deploying',
    });
  }

  await startDeploymentInternal(deploymentId, userId);
  if (input.set_telegram_webhook) {
    await installTelegramWebhookForDeployment(deploymentId, userId, normalizedEnv);
  }
  return toProjectDeploymentRecord(await getDeploymentWithAgentMeta(deploymentId, userId));
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
  return toProjectDeploymentRecord(await getDeploymentWithAgentMeta(deployment.id, userId));
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
  return toProjectDeploymentRecord(await getDeploymentWithAgentMeta(deployment.id, userId));
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
  return toProjectDeploymentRecord(await getDeploymentWithAgentMeta(deployment.id, userId));
}

export async function proxyProjectDeploymentWebhook(
  publicToken: string,
  req: Request,
): Promise<{ status: number; headers: Headers; body: Buffer }> {
  const runtime = await ensureRuntimeForWebhook(publicToken);
  const suffix = typeof req.params[0] === 'string' ? req.params[0] : '';
  const search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const targetUrl = `http://127.0.0.1:${runtime.port}/webhook${suffix || ''}${search}`;

  const response = await fetch(targetUrl, {
    method: req.method,
    headers: buildProxyHeaders(req),
    body: buildProxyBody(req),
    redirect: 'manual',
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
    model_external_id: null,
  }, {
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
  const runtime = deploymentRuntimes.get(deployment.id);
  if (runtime) {
    return { stdout: runtime.stdout, stderr: runtime.stderr };
  }

  const workspaceDir = getDeploymentWorkspaceDir(deployment.id);
  let stdout = '';
  let stderr = '';
  try {
    stdout = await readFile(path.join(workspaceDir, 'stdout.log'), 'utf8');
  } catch {
    // noop
  }
  try {
    stderr = await readFile(path.join(workspaceDir, 'stderr.log'), 'utf8');
  } catch {
    // noop
  }
  return { stdout: trimOutput(stdout), stderr: trimOutput(stderr) };
}
