import { eq, sql } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  users,
  authAccounts,
  balanceTransactions,
  emailVerificationTokens,
} from '../../db/schema/index.js';
import { AppError, ConflictError, NotFoundError } from '../../middleware/error-handler.js';
import { ROLE_LIMITS } from '@llmstore/shared';
import type {
  UserProfile,
  PublicUserProfile,
  LinkedAccount,
  UserUsageSummary,
  AgentUsageSummary,
  UserLimits,
  BalanceHistoryItem,
  ProfileLeaderboard,
  ProfileLeaderboardEntry,
  ProfileLeaderboardSort,
} from '@llmstore/shared';
import type { UserRole } from '@llmstore/shared';
import { getUsdToRubRate } from '../../lib/app-settings.js';

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
  if (type === 'admin_credit') return 'Пополнение администратором';
  if (type === 'admin_debit') return 'Списание администратором';
  if (type === 'topup') return 'Пополнение баланса';
  return `Операция: ${type}`;
}

const PROFILE_LEADERBOARD_SORTS: Record<ProfileLeaderboardSort, string> = {
  tokens: 'total_tokens',
  cost: 'total_cost_usd',
  chats: 'chats_count',
  messages: 'messages_count',
};

function buildProfileLeaderboardMetricSql(sortBy: ProfileLeaderboardSort) {
  return sql.raw(PROFILE_LEADERBOARD_SORTS[sortBy] ?? PROFILE_LEADERBOARD_SORTS.tokens);
}

function mapProfileLeaderboardEntry(
  row: {
    rank: number | string;
    user_id: string;
    username: string | null;
    name: string | null;
    avatar_url: string | null;
    total_tokens: number | string;
    total_cost_usd: number | string;
    chats_count: number | string;
    messages_count: number | string;
    is_current_user: boolean;
  },
  userId: string,
): ProfileLeaderboardEntry {
  return {
    rank: Math.max(1, Math.trunc(toNumberOrZero(row.rank))),
    user_id: row.user_id,
    username: row.username,
    name: row.name,
    avatar_url: row.avatar_url,
    total_tokens: Math.max(0, Math.trunc(toNumberOrZero(row.total_tokens))),
    total_cost_usd: toFixedAmount(Math.max(0, toNumberOrZero(row.total_cost_usd)), 6),
    chats_count: Math.max(0, Math.trunc(toNumberOrZero(row.chats_count))),
    messages_count: Math.max(0, Math.trunc(toNumberOrZero(row.messages_count))),
    is_current_user: row.is_current_user || row.user_id === userId,
  };
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

  const txHistory: BalanceHistoryItem[] = txRows
    .filter((tx) => tx.type !== 'chat_usage' && tx.type !== 'agent_run_usage')
    .map((tx) => {
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

async function getUserUsageSummary(userId: string): Promise<UserUsageSummary> {
  const usageRows = await db.execute<{
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
  `);

  const perAgent: AgentUsageSummary[] = usageRows.map((r) => ({
    agent_id: r.agent_id,
    agent_name: r.agent_name,
    total_runs: Number(r.total_runs),
    total_tokens: Number(r.total_tokens),
    total_cost: String(r.total_cost),
  }));

  const totalRuns = perAgent.reduce((sum, agent) => sum + agent.total_runs, 0);
  const totalTokens = perAgent.reduce((sum, agent) => sum + agent.total_tokens, 0);
  const totalCost = perAgent.reduce((sum, agent) => sum + Number(agent.total_cost), 0);

  return {
    total_runs: totalRuns,
    total_tokens: totalTokens,
    total_cost_usd: totalCost.toFixed(6),
    per_agent: perAgent,
  };
}

export async function getProfileLeaderboard(
  userId: string,
  sortBy: ProfileLeaderboardSort = 'tokens',
  limit = 50,
): Promise<ProfileLeaderboard> {
  const normalizedSort = PROFILE_LEADERBOARD_SORTS[sortBy] ? sortBy : 'tokens';
  const metricSql = buildProfileLeaderboardMetricSql(normalizedSort);
  const normalizedLimit = Math.min(Math.max(Math.trunc(limit) || 50, 5), 100);

  const leaderboardCte = sql`
    WITH chat_counts AS (
      SELECT
        cc.user_id,
        COUNT(*)::int AS chats_count
      FROM chat_conversations cc
      GROUP BY cc.user_id
    ),
    message_counts AS (
      SELECT
        cc.user_id,
        COUNT(*)::int AS messages_count
      FROM chat_conversation_messages ccm
      INNER JOIN chat_conversations cc ON cc.id = ccm.conversation_id
      GROUP BY cc.user_id
    ),
    usage_stats AS (
      SELECT
        cc.user_id,
        COALESCE(SUM(
          COALESCE(
            NULLIF(ccm.usage_json->>'total_tokens', '')::numeric,
            COALESCE(ul.total_tokens, ul.prompt_tokens + ul.completion_tokens, 0),
            0
          )
        ), 0) AS total_tokens,
        COALESCE(SUM(
          COALESCE(
            NULLIF(ccm.usage_json->>'estimated_cost', '')::numeric,
            COALESCE(ul.estimated_cost, 0),
            0
          )
        ), 0) AS total_cost_usd
      FROM chat_conversation_messages ccm
      INNER JOIN chat_conversations cc ON cc.id = ccm.conversation_id
      LEFT JOIN usage_ledger ul ON ul.run_id = ccm.run_id
      WHERE ccm.role = 'assistant'
        AND (ccm.usage_json IS NOT NULL OR ccm.run_id IS NOT NULL)
      GROUP BY cc.user_id
    ),
    leaderboard_base AS (
      SELECT
        u.id AS user_id,
        u.username,
        u.name,
        u.avatar_url,
        COALESCE(us.total_tokens, 0) AS total_tokens,
        COALESCE(us.total_cost_usd, 0) AS total_cost_usd,
        COALESCE(ch.chats_count, 0) AS chats_count,
        COALESCE(mc.messages_count, 0) AS messages_count
      FROM users u
      LEFT JOIN usage_stats us ON us.user_id = u.id
      LEFT JOIN chat_counts ch ON ch.user_id = u.id
      LEFT JOIN message_counts mc ON mc.user_id = u.id
      WHERE u.status = 'active'
    ),
    leaderboard_users AS (
      SELECT *
      FROM leaderboard_base
      WHERE total_tokens > 0
        OR total_cost_usd > 0
        OR chats_count > 0
        OR messages_count > 0
    ),
    ranked AS (
      SELECT
        RANK() OVER (ORDER BY ${metricSql} DESC) AS rank,
        ROW_NUMBER() OVER (
          ORDER BY
            ${metricSql} DESC,
            total_tokens DESC,
            total_cost_usd DESC,
            chats_count DESC,
            messages_count DESC,
            COALESCE(username, name, user_id::text) ASC
        ) AS sort_position,
        user_id,
        username,
        name,
        avatar_url,
        total_tokens,
        total_cost_usd,
        chats_count,
        messages_count
      FROM leaderboard_users
    )
  `;

  const [topRows, currentUserRows, totalRows] = await Promise.all([
    db.execute<{
      rank: number | string;
      user_id: string;
      username: string | null;
      name: string | null;
      avatar_url: string | null;
      total_tokens: number | string;
      total_cost_usd: number | string;
      chats_count: number | string;
      messages_count: number | string;
      is_current_user: boolean;
    }>(sql`
      ${leaderboardCte}
      SELECT
        rank,
        user_id,
        username,
        name,
        avatar_url,
        total_tokens,
        total_cost_usd,
        chats_count,
        messages_count,
        user_id = ${userId} AS is_current_user
      FROM ranked
      ORDER BY sort_position
      LIMIT ${normalizedLimit}
    `),
    db.execute<{
      rank: number | string;
      user_id: string;
      username: string | null;
      name: string | null;
      avatar_url: string | null;
      total_tokens: number | string;
      total_cost_usd: number | string;
      chats_count: number | string;
      messages_count: number | string;
      is_current_user: boolean;
    }>(sql`
      ${leaderboardCte}
      SELECT
        rank,
        user_id,
        username,
        name,
        avatar_url,
        total_tokens,
        total_cost_usd,
        chats_count,
        messages_count,
        true AS is_current_user
      FROM ranked
      WHERE user_id = ${userId}
      LIMIT 1
    `),
    db.execute<{ total_users: number | string }>(sql`
      ${leaderboardCte}
      SELECT COUNT(*) AS total_users
      FROM ranked
    `),
  ]);

  return {
    sort_by: normalizedSort,
    total_users: Math.max(0, Math.trunc(toNumberOrZero(totalRows[0]?.total_users ?? 0))),
    current_user: currentUserRows[0] ? mapProfileLeaderboardEntry(currentUserRows[0], userId) : null,
    entries: topRows.map((row) => mapProfileLeaderboardEntry(row, userId)),
  };
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

  const [accounts, usage, balanceHistory, pendingVerificationTokens] = await Promise.all([
    db.select({
      provider: authAccounts.provider,
      provider_account_id: authAccounts.provider_account_id,
      created_at: authAccounts.created_at,
    })
      .from(authAccounts)
      .where(eq(authAccounts.user_id, userId)),
    getUserUsageSummary(userId),
    getBalanceHistory(userId),
    db
      .select({ id: emailVerificationTokens.id })
      .from(emailVerificationTokens)
      .where(sql`${emailVerificationTokens.user_id} = ${userId} AND ${emailVerificationTokens.used_at} IS NULL AND ${emailVerificationTokens.expires_at} > now()`)
      .limit(1),
  ]);

  const linked_accounts: LinkedAccount[] = accounts.map((a) => ({
    provider: a.provider,
    provider_account_id: a.provider_account_id,
    created_at: a.created_at.toISOString(),
  }));

  const usdToRubRate = await getUsdToRubRate();
  const balanceUsd = Number(user.balance_usd);
  const balanceRub = (balanceUsd * usdToRubRate).toFixed(2);

  const limits: UserLimits = ROLE_LIMITS[user.role as UserRole] ?? ROLE_LIMITS.user;

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    avatar_url: user.avatar_url,
    role: user.role as UserRole,
    status: user.status as UserProfile['status'],
    email_verified_at: user.email_verified_at?.toISOString() ?? null,
    created_at: user.created_at.toISOString(),
    has_pending_email_verification: pendingVerificationTokens.length > 0,
    balance_usd: String(user.balance_usd),
    balance_rub: balanceRub,
    usd_to_rub_rate: usdToRubRate,
    linked_accounts,
    alice: null,
    usage,
    balance_history: balanceHistory,
    limits,
  };
}

export async function getPublicProfileByUsername(username: string): Promise<PublicUserProfile> {
  const normalized = username.trim().replace(/^@+/, '').toLowerCase();
  if (!normalized) {
    throw new NotFoundError('Пользователь не найден');
  }

  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      avatar_url: users.avatar_url,
      role: users.role,
      status: users.status,
      created_at: users.created_at,
    })
    .from(users)
    .where(sql`lower(${users.username}) = ${normalized}`)
    .limit(1);

  if (!user || !user.username || user.status !== 'active') {
    throw new NotFoundError('Пользователь не найден');
  }

  const [usage, usdToRubRate] = await Promise.all([
    getUserUsageSummary(user.id),
    getUsdToRubRate(),
  ]);

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    avatar_url: user.avatar_url,
    role: user.role as UserRole,
    created_at: user.created_at.toISOString(),
    usd_to_rub_rate: usdToRubRate,
    usage,
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

