import { randomBytes } from 'crypto';
import { mkdir } from 'fs/promises';
import path from 'path';
import { and, eq } from 'drizzle-orm';
import mysql from 'mysql2/promise';
import postgres from 'postgres';
import { db } from '../../config/database.js';
import { env } from '../../config/env.js';
import { chatProjectDeploymentServices } from '../../db/schema/runtime.js';
import { AppError } from '../../middleware/error-handler.js';
import { logger } from '../../lib/logger.js';
import type { CodingReportProject } from './runtime.service.js';

export type ProjectServiceKind = 'postgres' | 'mysql' | 'redis' | 'sqlite' | 'queue';
export type ProjectServiceMode = 'managed' | 'workspace' | 'external';
export type ProjectServiceStatus = 'pending' | 'ready' | 'failed' | 'manual';

export interface ProjectServiceSpec {
  service_key: string;
  kind: ProjectServiceKind;
  label: string;
  mode: ProjectServiceMode;
  engine?: string | null;
  env_prefix?: string | null;
  config?: Record<string, unknown>;
}

export interface ProjectServiceRecord {
  id: string;
  deployment_id: string;
  service_key: string;
  kind: ProjectServiceKind;
  label: string;
  mode: ProjectServiceMode;
  engine: string | null;
  env_prefix: string;
  status: ProjectServiceStatus;
  env: Record<string, string>;
  config: Record<string, unknown>;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

const SUPPORTED_SERVICE_KINDS: ProjectServiceKind[] = ['postgres', 'mysql', 'redis', 'sqlite', 'queue'];

function clampText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function normalizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function normalizeEnvMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, rawValue]) => [key.trim(), typeof rawValue === 'string' ? rawValue.trim() : ''] as const)
      .filter(([key, rawValue]) => key.length > 0 && rawValue.length > 0),
  );
}

function normalizeEnvPrefix(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
    .slice(0, 24);
}

function normalizeIdentifier(value: string, fallback: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return (normalized || fallback).slice(0, 48);
}

function buildServiceKey(kind: ProjectServiceKind, envPrefix: string): string {
  return envPrefix ? `${kind}:${envPrefix.toLowerCase()}` : kind;
}

function prefixedEnv(prefix: string, envMap: Record<string, string>): Record<string, string> {
  if (!prefix) return envMap;

  return Object.fromEntries(
    Object.entries(envMap).map(([key, value]) => [`${prefix}_${key}`, value] as const),
  );
}

function toRecord(
  row: typeof chatProjectDeploymentServices.$inferSelect,
): ProjectServiceRecord {
  return {
    id: row.id,
    deployment_id: row.deployment_id,
    service_key: row.service_key,
    kind: row.kind as ProjectServiceKind,
    label: row.label,
    mode: row.mode as ProjectServiceMode,
    engine: row.engine ?? null,
    env_prefix: row.env_prefix ?? '',
    status: (row.status as ProjectServiceStatus) ?? 'pending',
    env: normalizeEnvMap(row.env_json),
    config: normalizeObject(row.config_json),
    last_error: row.last_error ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function buildRandomPassword(length = 24): string {
  return randomBytes(length)
    .toString('base64')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, length);
}

function getBasePostgresUrl(): URL {
  return new URL(env.DATABASE_URL);
}

function getPostgresAdminUrl(): URL {
  const adminUrl = new URL(env.DATABASE_URL);
  adminUrl.pathname = '/postgres';
  return adminUrl;
}

function getMysqlAdminUrl(): URL | null {
  const raw = env.MYSQL_ADMIN_URL.trim();
  if (!raw) return null;

  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function buildMysqlHostPort(url: URL): { host: string; port: number } {
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
  };
}

async function updateServiceRow(
  serviceId: string,
  patch: Partial<typeof chatProjectDeploymentServices.$inferInsert>,
): Promise<typeof chatProjectDeploymentServices.$inferSelect> {
  const [row] = await db.update(chatProjectDeploymentServices)
    .set({
      ...patch,
      updated_at: new Date(),
    })
    .where(eq(chatProjectDeploymentServices.id, serviceId))
    .returning();

  if (!row) {
    throw new AppError(404, 'PROJECT_SERVICE_NOT_FOUND', 'Сервис deployment не найден');
  }

  return row;
}

async function provisionManagedPostgres(
  row: typeof chatProjectDeploymentServices.$inferSelect,
): Promise<typeof chatProjectDeploymentServices.$inferSelect> {
  if (normalizeEnvMap(row.env_json).DATABASE_URL) {
    if (row.status !== 'ready') {
      return updateServiceRow(row.id, { status: 'ready', last_error: null });
    }
    return row;
  }

  const adminUrl = getPostgresAdminUrl();
  const runtimeUrl = getBasePostgresUrl();
  const deploymentSlug = normalizeIdentifier(row.deployment_id.slice(0, 12), 'deployment');
  const prefixSlug = normalizeIdentifier(row.env_prefix || row.kind, row.kind);
  const dbName = normalizeIdentifier(`app_${deploymentSlug}_${prefixSlug}`, `app_${deploymentSlug}`);
  const dbUser = normalizeIdentifier(`usr_${deploymentSlug}_${prefixSlug}`, `usr_${deploymentSlug}`);
  const dbPassword = buildRandomPassword(32);
  const sql = postgres(adminUrl.toString(), { max: 1 });

  try {
    const roleExists = await sql<{ exists: boolean }[]>`
      select exists(select 1 from pg_roles where rolname = ${dbUser}) as exists
    `;
    if (!roleExists[0]?.exists) {
      await sql.unsafe(`CREATE ROLE "${dbUser}" LOGIN PASSWORD '${dbPassword}'`);
    }

    const databaseExists = await sql<{ exists: boolean }[]>`
      select exists(select 1 from pg_database where datname = ${dbName}) as exists
    `;
    if (!databaseExists[0]?.exists) {
      await sql.unsafe(`CREATE DATABASE "${dbName}" OWNER "${dbUser}"`);
    }

    runtimeUrl.username = dbUser;
    runtimeUrl.password = dbPassword;
    runtimeUrl.pathname = `/${dbName}`;

    const envMap = prefixedEnv(row.env_prefix, {
      DATABASE_URL: runtimeUrl.toString(),
      PGHOST: runtimeUrl.hostname,
      PGPORT: runtimeUrl.port || '5432',
      PGDATABASE: dbName,
      PGUSER: dbUser,
      PGPASSWORD: dbPassword,
    });

    return await updateServiceRow(row.id, {
      status: 'ready',
      env_json: envMap,
      last_error: null,
    });
  } catch (error) {
    logger.error({ err: error, serviceId: row.id }, 'Failed to provision managed postgres service');
    return await updateServiceRow(row.id, {
      status: 'failed',
      last_error: error instanceof Error ? error.message : 'Не удалось подготовить PostgreSQL',
    });
  } finally {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }
}

async function provisionWorkspaceSqlite(
  row: typeof chatProjectDeploymentServices.$inferSelect,
  workspaceDir: string,
): Promise<typeof chatProjectDeploymentServices.$inferSelect> {
  const dataDir = path.join(workspaceDir, '.llmstore-data');
  const prefixSlug = normalizeIdentifier(row.env_prefix || row.kind, row.kind);
  const filePath = path.join(dataDir, `${prefixSlug || 'app'}.sqlite`);

  await mkdir(dataDir, { recursive: true });

  return await updateServiceRow(row.id, {
    status: 'ready',
    env_json: prefixedEnv(row.env_prefix, {
      DATABASE_URL: `file:${filePath}`,
      SQLITE_PATH: filePath,
    }),
    last_error: null,
  });
}

async function provisionManagedRedis(
  row: typeof chatProjectDeploymentServices.$inferSelect,
): Promise<typeof chatProjectDeploymentServices.$inferSelect> {
  const deploymentSlug = normalizeIdentifier(row.deployment_id.slice(0, 12), 'deployment');
  const prefixSlug = normalizeIdentifier(row.env_prefix || row.kind, row.kind);
  const namespace = `llmstore:${deploymentSlug}:${prefixSlug}`;

  return await updateServiceRow(row.id, {
    status: 'ready',
    env_json: prefixedEnv(row.env_prefix, {
      REDIS_URL: env.REDIS_URL,
      REDIS_PREFIX: `${namespace}:`,
    }),
    last_error: null,
  });
}

async function provisionManagedQueue(
  row: typeof chatProjectDeploymentServices.$inferSelect,
): Promise<typeof chatProjectDeploymentServices.$inferSelect> {
  const deploymentSlug = normalizeIdentifier(row.deployment_id.slice(0, 12), 'deployment');
  const prefixSlug = normalizeIdentifier(row.env_prefix || row.kind, row.kind);
  const namespace = `llmstore:${deploymentSlug}:${prefixSlug}:queue`;

  return await updateServiceRow(row.id, {
    status: 'ready',
    env_json: prefixedEnv(row.env_prefix, {
      QUEUE_DRIVER: 'redis',
      QUEUE_REDIS_URL: env.REDIS_URL,
      QUEUE_PREFIX: `${namespace}:`,
    }),
    last_error: null,
  });
}

async function provisionManagedMysql(
  row: typeof chatProjectDeploymentServices.$inferSelect,
): Promise<typeof chatProjectDeploymentServices.$inferSelect> {
  if (normalizeEnvMap(row.env_json).DATABASE_URL) {
    if (row.status !== 'ready') {
      return updateServiceRow(row.id, { status: 'ready', last_error: null });
    }
    return row;
  }

  const adminUrl = getMysqlAdminUrl();
  if (!adminUrl) {
    return await updateServiceRow(row.id, {
      status: 'manual',
      last_error: 'Для MySQL нужен MYSQL_ADMIN_URL. Пока используйте external/manual режим или добавьте admin URL.',
    });
  }

  const deploymentSlug = normalizeIdentifier(row.deployment_id.slice(0, 12), 'deployment');
  const prefixSlug = normalizeIdentifier(row.env_prefix || row.kind, row.kind);
  const dbName = normalizeIdentifier(`app_${deploymentSlug}_${prefixSlug}`, `app_${deploymentSlug}`);
  const dbUser = normalizeIdentifier(`usr_${deploymentSlug}_${prefixSlug}`, `usr_${deploymentSlug}`);
  const dbPassword = buildRandomPassword(32);
  const { host, port } = buildMysqlHostPort(adminUrl);
  const adminDb = adminUrl.pathname.replace(/^\//, '') || 'mysql';

  let connection: mysql.Connection | null = null;

  try {
    connection = await mysql.createConnection({
      host,
      port,
      user: decodeURIComponent(adminUrl.username),
      password: decodeURIComponent(adminUrl.password),
      database: adminDb,
      multipleStatements: false,
    });

    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    await connection.query(`CREATE USER IF NOT EXISTS '${dbUser}'@'%' IDENTIFIED BY '${dbPassword}'`);
    await connection.query(`ALTER USER '${dbUser}'@'%' IDENTIFIED BY '${dbPassword}'`);
    await connection.query(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'%'`);
    await connection.query('FLUSH PRIVILEGES');

    const runtimeUrl = new URL(adminUrl.toString());
    runtimeUrl.username = dbUser;
    runtimeUrl.password = dbPassword;
    runtimeUrl.pathname = `/${dbName}`;

    const envMap = prefixedEnv(row.env_prefix, {
      DATABASE_URL: runtimeUrl.toString(),
      MYSQL_HOST: host,
      MYSQL_PORT: String(port),
      MYSQL_DATABASE: dbName,
      MYSQL_USER: dbUser,
      MYSQL_PASSWORD: dbPassword,
    });

    return await updateServiceRow(row.id, {
      status: 'ready',
      env_json: envMap,
      last_error: null,
    });
  } catch (error) {
    logger.error({ err: error, serviceId: row.id }, 'Failed to provision managed mysql service');
    return await updateServiceRow(row.id, {
      status: 'failed',
      last_error: error instanceof Error ? error.message : 'Не удалось подготовить MySQL',
    });
  } finally {
    await connection?.end().catch(() => undefined);
  }
}

async function provisionServiceRow(
  row: typeof chatProjectDeploymentServices.$inferSelect,
  workspaceDir: string,
): Promise<typeof chatProjectDeploymentServices.$inferSelect> {
  const mode = (row.mode as ProjectServiceMode) ?? 'managed';
  const kind = row.kind as ProjectServiceKind;

  if (mode === 'external') {
    return await updateServiceRow(row.id, {
      status: normalizeEnvMap(row.env_json) && Object.keys(normalizeEnvMap(row.env_json)).length > 0 ? 'ready' : 'manual',
      last_error: null,
    });
  }

  if (kind === 'sqlite') {
    return provisionWorkspaceSqlite(row, workspaceDir);
  }

  if (kind === 'postgres') {
    return provisionManagedPostgres(row);
  }

  if (kind === 'redis') {
    return provisionManagedRedis(row);
  }

  if (kind === 'queue') {
    return provisionManagedQueue(row);
  }

  return provisionManagedMysql(row);
}

export function getProjectServiceSpecsFromProject(project: CodingReportProject): ProjectServiceSpec[] {
  const rawServices = Array.isArray(project.stack?.services) ? project.stack.services : [];
  const normalized: ProjectServiceSpec[] = [];
  const seen = new Set<string>();

  for (const rawService of rawServices) {
    const kind = SUPPORTED_SERVICE_KINDS.includes(rawService.kind) ? rawService.kind : null;
    if (!kind) continue;

    const envPrefix = normalizeEnvPrefix(rawService.env_prefix);
    const serviceKey = buildServiceKey(kind, envPrefix);
    if (seen.has(serviceKey)) continue;
    seen.add(serviceKey);

    normalized.push({
      service_key: serviceKey,
      kind,
      label: clampText(rawService.label, 160) || kind.toUpperCase(),
      mode: rawService.mode === 'workspace' || rawService.mode === 'external' || rawService.mode === 'managed'
        ? rawService.mode
        : kind === 'sqlite'
          ? 'workspace'
          : 'managed',
      engine: clampText(rawService.engine, 64) ?? null,
      env_prefix: envPrefix,
      config: normalizeObject(rawService.config),
    });
  }

  return normalized;
}

export async function syncProjectServicesForDeployment(
  deploymentId: string,
  userId: string,
  specs: ProjectServiceSpec[],
): Promise<ProjectServiceRecord[]> {
  const existing = await db
    .select()
    .from(chatProjectDeploymentServices)
    .where(and(
      eq(chatProjectDeploymentServices.deployment_id, deploymentId),
      eq(chatProjectDeploymentServices.user_id, userId),
    ));

  const existingByKey = new Map(existing.map((row) => [row.service_key, row] as const));

  for (const spec of specs) {
    const row = existingByKey.get(spec.service_key);
    if (!row) {
      await db.insert(chatProjectDeploymentServices).values({
        deployment_id: deploymentId,
        user_id: userId,
        service_key: spec.service_key,
        kind: spec.kind,
        label: spec.label,
        mode: spec.mode,
        engine: spec.engine ?? null,
        env_prefix: spec.env_prefix ?? '',
        status: 'pending',
        config_json: spec.config ?? {},
        env_json: {},
      });
      continue;
    }

    await updateServiceRow(row.id, {
      kind: spec.kind,
      label: spec.label,
      mode: spec.mode,
      engine: spec.engine ?? null,
      env_prefix: spec.env_prefix ?? '',
      config_json: spec.config ?? {},
    });
  }

  const staleRows = existing.filter((row) => !specs.some((spec) => spec.service_key === row.service_key));
  for (const staleRow of staleRows) {
    await db.delete(chatProjectDeploymentServices)
      .where(eq(chatProjectDeploymentServices.id, staleRow.id));
  }

  return listProjectServicesForDeployment(deploymentId, userId);
}

export async function listProjectServicesForDeployment(
  deploymentId: string,
  userId: string,
): Promise<ProjectServiceRecord[]> {
  const rows = await db
    .select()
    .from(chatProjectDeploymentServices)
    .where(and(
      eq(chatProjectDeploymentServices.deployment_id, deploymentId),
      eq(chatProjectDeploymentServices.user_id, userId),
    ));

  return rows.map(toRecord);
}

export async function buildProjectServicesEnvForDeployment(
  deploymentId: string,
  userId: string,
  workspaceDir: string,
): Promise<{ env: Record<string, string>; services: ProjectServiceRecord[] }> {
  const rows = await db
    .select()
    .from(chatProjectDeploymentServices)
    .where(and(
      eq(chatProjectDeploymentServices.deployment_id, deploymentId),
      eq(chatProjectDeploymentServices.user_id, userId),
    ));

  const provisionedRows = [];
  for (const row of rows) {
    provisionedRows.push(await provisionServiceRow(row, workspaceDir));
  }

  const services = provisionedRows.map(toRecord);
  const envMap = Object.assign({}, ...services.map((service) => service.env));
  return { env: envMap, services };
}
