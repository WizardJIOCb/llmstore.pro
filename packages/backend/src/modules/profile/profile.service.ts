import { eq, sql } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  users,
  authAccounts,
  balanceTransactions,
} from '../../db/schema/index.js';
import { AppError, ConflictError, NotFoundError } from '../../middleware/error-handler.js';
import { ROLE_LIMITS, USD_TO_RUB_RATE } from '@llmstore/shared';
import type {
  UserProfile,
  LinkedAccount,
  UserUsageSummary,
  AgentUsageSummary,
  UserLimits,
  BalanceHistoryItem,
} from '@llmstore/shared';
import type { UserRole } from '@llmstore/shared';

function toFixedAmount(value: number, scale = 4): string {
  return value.toFixed(scale);
}

function toNumberOrZero(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

function txTypeTitle(type: string, description: string | null): string {
  if (description && description.trim().length > 0) return description.trim();
  if (type === 'signup_bonus') return 'Стартовый бонус';
  if (type === 'admin_adjustment') return 'Корректировка администратором';
  if (type === 'topup') return 'Пополнение баланса';
  return `Операция: ${type}`;
}

async function getBalanceHistory(userId: string): Promise<BalanceHistoryItem[]> {
  const [txRows, chatUsageRows, runUsageRows] = await Promise.all([
    db.select({
      id: balanceTransactions.id,
      created_at: balanceTransactions.created_at,
      type: balanceTransactions.type,
      description: balanceTransactions.description,
      amount: balanceTransactions.amount,
    })
      .from(balanceTransactions)
      .where(eq(balanceTransactions.user_id, userId)),
    db.execute<{
      id: string;
      created_at: Date;
      chat_title: string;
      model: string | null;
      total_tokens: string;
      estimated_cost: string;
    }>(sql`
      SELECT
        ccm.id,
        ccm.created_at,
        cc.title AS chat_title,
        COALESCE(ccm.usage_json->>'model', cc.model_external_id) AS model,
        COALESCE(NULLIF(ccm.usage_json->>'total_tokens', '')::numeric, 0)::text AS total_tokens,
        COALESCE(NULLIF(ccm.usage_json->>'estimated_cost', '')::numeric, 0)::text AS estimated_cost
      FROM chat_conversation_messages ccm
      INNER JOIN chat_conversations cc ON cc.id = ccm.conversation_id
      WHERE cc.user_id = ${userId}
        AND ccm.role = 'assistant'
        AND ccm.usage_json IS NOT NULL
    `),
    db.execute<{
      id: string;
      created_at: Date;
      agent_name: string;
      model: string | null;
      total_tokens: number;
      estimated_cost: string;
    }>(sql`
      SELECT
        ul.id,
        ar.started_at AS created_at,
        COALESCE(a.name, 'Удаленный агент') AS agent_name,
        ul.model_external_id AS model,
        COALESCE(ul.total_tokens, ul.prompt_tokens + ul.completion_tokens, 0) AS total_tokens,
        COALESCE(ul.estimated_cost, 0)::text AS estimated_cost
      FROM usage_ledger ul
      INNER JOIN agent_runs ar ON ar.id = ul.run_id
      LEFT JOIN agents a ON a.id = ar.agent_id
      WHERE ar.user_id = ${userId}
        AND NOT EXISTS (
          SELECT 1
          FROM chat_conversation_messages ccm
          WHERE ccm.run_id = ar.id
        )
    `),
  ]);

  const txHistory: BalanceHistoryItem[] = txRows.map((tx) => {
    const amount = toNumberOrZero(tx.amount);
    const direction: BalanceHistoryItem['direction'] = amount >= 0 ? 'credit' : 'debit';
    const category: BalanceHistoryItem['category'] = amount >= 0 ? 'topup' : 'writeoff';
    return {
      id: tx.id,
      created_at: toIso(tx.created_at),
      title: txTypeTitle(tx.type, tx.description),
      event_type: tx.type,
      category,
      direction,
      amount_usd: toFixedAmount(Math.abs(amount)),
      tokens: 0,
      model: null,
    };
  });

  const chatUsageHistory: BalanceHistoryItem[] = chatUsageRows.map((row): BalanceHistoryItem => {
    const estimatedCost = Math.max(0, toNumberOrZero(row.estimated_cost));
    return {
      id: `chat-${row.id}`,
      created_at: toIso(row.created_at),
      title: `Чат: ${row.chat_title || 'Без названия'}`,
      event_type: 'chat_usage',
      category: 'writeoff' as const,
      direction: 'debit' as const,
      amount_usd: toFixedAmount(estimatedCost),
      tokens: Math.max(0, Math.trunc(toNumberOrZero(row.total_tokens))),
      model: row.model,
    };
  }).filter((item) => Number(item.amount_usd) > 0 || item.tokens > 0);

  const runUsageHistory: BalanceHistoryItem[] = runUsageRows.map((row): BalanceHistoryItem => {
    const estimatedCost = Math.max(0, toNumberOrZero(row.estimated_cost));
    return {
      id: `run-${row.id}`,
      created_at: toIso(row.created_at),
      title: `Агент: ${row.agent_name || 'Без названия'}`,
      event_type: 'agent_run_usage',
      category: 'writeoff' as const,
      direction: 'debit' as const,
      amount_usd: toFixedAmount(estimatedCost),
      tokens: Math.max(0, Math.trunc(toNumberOrZero(row.total_tokens))),
      model: row.model,
    };
  }).filter((item) => Number(item.amount_usd) > 0 || item.tokens > 0);

  return [...txHistory, ...chatUsageHistory, ...runUsageHistory]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export async function getProfile(userId: string): Promise<UserProfile> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new NotFoundError('Пользователь не найден');
  }

  const [accounts, usageRows, balanceHistory] = await Promise.all([
    db.select({
      provider: authAccounts.provider,
      provider_account_id: authAccounts.provider_account_id,
      created_at: authAccounts.created_at,
    })
      .from(authAccounts)
      .where(eq(authAccounts.user_id, userId)),
    db.execute<{
      agent_id: string;
      agent_name: string;
      total_runs: string;
      total_tokens: string;
      total_cost: string;
    }>(sql`
      SELECT
        ar.agent_id,
        COALESCE(a.name, 'Удаленный агент') AS agent_name,
        COUNT(ar.id) AS total_runs,
        COALESCE(SUM(ul.prompt_tokens + ul.completion_tokens), 0) AS total_tokens,
        COALESCE(SUM(ul.estimated_cost::numeric), 0) AS total_cost
      FROM agent_runs ar
      LEFT JOIN usage_ledger ul ON ul.run_id = ar.id
      LEFT JOIN agents a ON a.id = ar.agent_id
      WHERE ar.user_id = ${userId}
      GROUP BY ar.agent_id, a.name
      ORDER BY total_cost DESC
    `),
    getBalanceHistory(userId),
  ]);

  const linked_accounts: LinkedAccount[] = accounts.map((a) => ({
    provider: a.provider,
    provider_account_id: a.provider_account_id,
    created_at: a.created_at.toISOString(),
  }));

  const perAgent: AgentUsageSummary[] = usageRows.map((r) => ({
    agent_id: r.agent_id,
    agent_name: r.agent_name,
    total_runs: Number(r.total_runs),
    total_tokens: Number(r.total_tokens),
    total_cost: String(r.total_cost),
  }));

  const totalRuns = perAgent.reduce((s, a) => s + a.total_runs, 0);
  const totalTokens = perAgent.reduce((s, a) => s + a.total_tokens, 0);
  const totalCost = perAgent.reduce((s, a) => s + Number(a.total_cost), 0);

  const usage: UserUsageSummary = {
    total_runs: totalRuns,
    total_tokens: totalTokens,
    total_cost_usd: totalCost.toFixed(6),
    per_agent: perAgent,
  };

  const balanceUsd = Number(user.balance_usd);
  const balanceRub = (balanceUsd * USD_TO_RUB_RATE).toFixed(2);

  const limits: UserLimits = ROLE_LIMITS[user.role as UserRole] ?? ROLE_LIMITS.user;

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    avatar_url: user.avatar_url,
    role: user.role as UserRole,
    status: user.status as UserProfile['status'],
    created_at: user.created_at.toISOString(),
    balance_usd: String(user.balance_usd),
    balance_rub: balanceRub,
    linked_accounts,
    usage,
    balance_history: balanceHistory,
    limits,
  };
}

export async function updateProfile(
  userId: string,
  input: { name?: string; username?: string },
): Promise<UserProfile> {
  if (input.username) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, input.username))
      .limit(1);
    if (existing.length > 0 && existing[0].id !== userId) {
      throw new ConflictError('Этот логин уже занят');
    }
  }

  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) updateData.name = input.name || null;
  if (input.username !== undefined) updateData.username = input.username || null;

  if (Object.keys(updateData).length > 0) {
    await db.update(users).set(updateData).where(eq(users.id, userId));
  }

  return getProfile(userId);
}

export async function unlinkAccount(userId: string, provider: string): Promise<void> {
  const [user] = await db
    .select({ password_hash: users.password_hash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw new NotFoundError('Пользователь не найден');

  const otherAccounts = await db
    .select({ id: authAccounts.id })
    .from(authAccounts)
    .where(
      sql`${authAccounts.user_id} = ${userId} AND ${authAccounts.provider} != ${provider}`,
    );

  const hasPassword = !!user.password_hash;
  const hasOtherOAuth = otherAccounts.length > 0;

  if (!hasPassword && !hasOtherOAuth) {
    throw new AppError(400, 'CANNOT_UNLINK', 'Невозможно отвязать единственный способ входа. Сначала установите пароль или привяжите другой аккаунт.');
  }

  await db
    .delete(authAccounts)
    .where(
      sql`${authAccounts.user_id} = ${userId} AND ${authAccounts.provider} = ${provider}`,
    );
}

