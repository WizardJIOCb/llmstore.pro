import { eq, sql } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { env } from '../../config/env.js';
import { desc } from 'drizzle-orm';
import argon2 from 'argon2';
import {
  users,
  authAccounts,
  aliceSkillLinks,
  aliceLinkCodes,
  aliceUserSettings,
  telegramLinkCodes,
  telegramLinks,
  balanceTransactions,
  emailVerificationTokens,
} from '../../db/schema/index.js';
import { AppError, ConflictError, NotFoundError } from '../../middleware/error-handler.js';
import { ROLE_LIMITS } from '@llmstore/shared';
import type { UserRole, UserLimits } from '@llmstore/shared';
import type {
  UserProfile,
  PublicUserProfile,
  LinkedAccount,
  UserUsageSummary,
  AgentUsageSummary,
  BalanceHistoryItem,
  ProfileLeaderboard,
  ProfileLeaderboardEntry,
  ProfileLeaderboardSort,
  AliceLinkCodeDto,
  TelegramLinkCodeDto,
} from '@llmstore/shared/types';
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

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function generateAliceLinkCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateTelegramLinkCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function getActiveAliceLinkCode(userId: string): Promise<AliceLinkCodeDto | null> {
  const now = new Date();
  const rows = await db
    .select({
      code: aliceLinkCodes.code,
      expires_at: aliceLinkCodes.expires_at,
      consumed_at: aliceLinkCodes.consumed_at,
    })
    .from(aliceLinkCodes)
    .where(eq(aliceLinkCodes.user_id, userId))
    .orderBy(desc(aliceLinkCodes.created_at))
    .limit(5);

  const active = rows.find((row) => !row.consumed_at && row.expires_at > now);
  if (!active) return null;

  return {
    code: active.code,
    expires_at: active.expires_at.toISOString(),
  };
}

async function getActiveTelegramLinkCode(userId: string): Promise<TelegramLinkCodeDto | null> {
  const now = new Date();
  const rows = await db
    .select({
      code: telegramLinkCodes.code,
      expires_at: telegramLinkCodes.expires_at,
      consumed_at: telegramLinkCodes.consumed_at,
    })
    .from(telegramLinkCodes)
    .where(eq(telegramLinkCodes.user_id, userId))
    .orderBy(desc(telegramLinkCodes.created_at))
    .limit(5);

  const active = rows.find((row) => !row.consumed_at && row.expires_at > now);
  if (!active) return null;

  return {
    code: active.code,
    expires_at: active.expires_at.toISOString(),
  };
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
    sort_position: number | string;
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
    position: Math.max(1, Math.trunc(toNumberOrZero(row.sort_position))),
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
      chat_id: string;
      chat_title: string;
      model: string | null;
      total_tokens: string;
      estimated_cost: string;
    }>(sql`
      SELECT
        ccm.id,
        ccm.created_at,
        cc.id AS chat_id,
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
      chat_id: null,
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
      chat_id: row.chat_id,
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
      chat_id: null,
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
  page = 1,
  limit = 50,
): Promise<ProfileLeaderboard> {
  const normalizedSort = PROFILE_LEADERBOARD_SORTS[sortBy] ? sortBy : 'tokens';
  const metricSql = buildProfileLeaderboardMetricSql(normalizedSort);
  const normalizedPage = Math.max(1, Math.trunc(page) || 1);
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

  const [currentUserRows, totalRows] = await Promise.all([
    db.execute<{
      rank: number | string;
      sort_position: number | string;
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
        sort_position,
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

  const totalUsers = Math.max(0, Math.trunc(toNumberOrZero(totalRows[0]?.total_users ?? 0)));
  const totalPages = Math.max(1, Math.ceil(totalUsers / normalizedLimit));
  const currentPage = Math.min(normalizedPage, totalPages);
  const offset = (currentPage - 1) * normalizedLimit;

  const topRows = await db.execute<{
      rank: number | string;
      sort_position: number | string;
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
        sort_position,
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
      OFFSET ${offset}
    `);

  return {
    sort_by: normalizedSort,
    page: currentPage,
    per_page: normalizedLimit,
    total_pages: totalPages,
    total_users: totalUsers,
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

  const [accounts, usage, balanceHistory, pendingVerificationTokens, aliceLinks, aliceSettings, aliceLinkCode, telegramLink, telegramLinkCode] = await Promise.all([
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
    db
      .select({
        linked_at: aliceSkillLinks.linked_at,
        last_seen_at: aliceSkillLinks.last_seen_at,
        linked_skill_user_id: aliceSkillLinks.yandex_skill_user_id,
        application_id: aliceSkillLinks.yandex_application_id,
      })
      .from(aliceSkillLinks)
      .where(eq(aliceSkillLinks.user_id, userId))
      .orderBy(desc(aliceSkillLinks.linked_at)),
    db
      .select({
        is_enabled: aliceUserSettings.is_enabled,
        default_target_type: aliceUserSettings.default_target_type,
        default_chat_id: aliceUserSettings.default_chat_id,
        default_agent_id: aliceUserSettings.default_agent_id,
        default_model_external_id: aliceUserSettings.default_model_external_id,
        save_messages: aliceUserSettings.save_messages,
        tts_mode: aliceUserSettings.tts_mode,
        max_tts_chars: aliceUserSettings.max_tts_chars,
      })
      .from(aliceUserSettings)
      .where(eq(aliceUserSettings.user_id, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    getActiveAliceLinkCode(userId),
    db
      .select({
        linked_at: telegramLinks.linked_at,
        last_seen_at: telegramLinks.last_seen_at,
        telegram_user_id: telegramLinks.telegram_user_id,
        telegram_chat_id: telegramLinks.telegram_chat_id,
        telegram_username: telegramLinks.telegram_username,
        telegram_first_name: telegramLinks.telegram_first_name,
        telegram_last_name: telegramLinks.telegram_last_name,
        notify_on_task_completed: telegramLinks.notify_on_task_completed,
        notify_on_task_failed: telegramLinks.notify_on_task_failed,
        notify_on_landing_ready: telegramLinks.notify_on_landing_ready,
      })
      .from(telegramLinks)
      .where(eq(telegramLinks.user_id, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    getActiveTelegramLinkCode(userId),
  ]);

  const linked_accounts: LinkedAccount[] = accounts.map((a: {
    provider: string;
    provider_account_id: string;
    created_at: Date;
  }) => ({
    provider: a.provider,
    provider_account_id: a.provider_account_id,
    created_at: a.created_at.toISOString(),
  }));

  const usdToRubRate = await getUsdToRubRate();
  const balanceUsd = Number(user.balance_usd);
  const balanceRub = (balanceUsd * usdToRubRate).toFixed(2);

  const limits: UserLimits = ROLE_LIMITS[user.role as UserRole] ?? ROLE_LIMITS.user;
  const primaryAliceLink = aliceLinks[0] ?? null;
  const aliceProfile = primaryAliceLink || aliceSettings || aliceLinkCode ? {
    settings: {
      is_enabled: aliceSettings?.is_enabled ?? true,
      default_target_type: aliceSettings?.default_target_type ?? 'general_chat',
      default_chat_id: aliceSettings?.default_chat_id ?? null,
      default_agent_id: aliceSettings?.default_agent_id ?? null,
      default_model_external_id: aliceSettings?.default_model_external_id ?? null,
      save_messages: aliceSettings?.save_messages ?? true,
      tts_mode: aliceSettings?.tts_mode ?? 'brief',
      max_tts_chars: aliceSettings?.max_tts_chars ?? 900,
    },
    status: {
      is_linked: aliceLinks.length > 0,
      linked_at: primaryAliceLink?.linked_at ? primaryAliceLink.linked_at.toISOString() : null,
      last_seen_at: primaryAliceLink?.last_seen_at ? primaryAliceLink.last_seen_at.toISOString() : null,
      linked_skill_user_id: primaryAliceLink?.linked_skill_user_id ?? null,
    },
    links: aliceLinks.map((link) => ({
      linked_skill_user_id: link.linked_skill_user_id,
      linked_at: link.linked_at.toISOString(),
      last_seen_at: link.last_seen_at ? link.last_seen_at.toISOString() : null,
      application_id: link.application_id ?? null,
    })),
    link_code: aliceLinkCode,
  } : null;
  const telegramDisplayName = telegramLink
    ? [telegramLink.telegram_first_name, telegramLink.telegram_last_name].filter(Boolean).join(' ').trim() || null
    : null;
  const telegramBotUsername = env.TELEGRAM_BOT_USERNAME?.trim()
    ? env.TELEGRAM_BOT_USERNAME.trim().replace(/^@+/, '')
    : null;
  const telegramProfile = telegramLink || telegramLinkCode ? {
    settings: {
      notify_on_task_completed: telegramLink?.notify_on_task_completed ?? true,
      notify_on_task_failed: telegramLink?.notify_on_task_failed ?? true,
      notify_on_landing_ready: telegramLink?.notify_on_landing_ready ?? true,
    },
    status: {
      is_linked: Boolean(telegramLink),
      linked_at: telegramLink?.linked_at ? telegramLink.linked_at.toISOString() : null,
      last_seen_at: telegramLink?.last_seen_at ? telegramLink.last_seen_at.toISOString() : null,
      telegram_user_id: telegramLink?.telegram_user_id ?? null,
      telegram_chat_id: telegramLink?.telegram_chat_id ?? null,
      telegram_username: telegramLink?.telegram_username ?? null,
      telegram_display_name: telegramDisplayName,
    },
    bot_username: telegramBotUsername,
    link_code: telegramLinkCode,
  } : null;

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
    has_password: Boolean(user.password_hash),
    balance_usd: String(user.balance_usd),
    balance_rub: balanceRub,
    usd_to_rub_rate: usdToRubRate,
    linked_accounts,
    alice: aliceProfile,
    telegram: telegramProfile,
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
  input: { name?: string },
): Promise<UserProfile> {
  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) updateData.name = input.name || null;

  if (Object.keys(updateData).length > 0) {
    await db.update(users).set(updateData).where(eq(users.id, userId));
  }

  return getProfile(userId);
}

export async function createAliceLinkCode(userId: string): Promise<AliceLinkCodeDto> {
  const active = await getActiveAliceLinkCode(userId);
  if (active) return active;

  const now = new Date();
  const expiresAt = addMinutes(now, 15);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateAliceLinkCode();
    try {
      await db.insert(aliceLinkCodes).values({
        user_id: userId,
        code,
        expires_at: expiresAt,
      });

      return {
        code,
        expires_at: expiresAt.toISOString(),
      };
    } catch {
      continue;
    }
  }

  throw new AppError(500, 'ALICE_LINK_CODE_CREATE_FAILED', 'Не удалось создать код привязки Алисы');
}

export async function createTelegramLinkCode(userId: string): Promise<TelegramLinkCodeDto> {
  const active = await getActiveTelegramLinkCode(userId);
  if (active) return active;

  const now = new Date();
  const expiresAt = addMinutes(now, 15);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateTelegramLinkCode();
    try {
      await db.insert(telegramLinkCodes).values({
        user_id: userId,
        code,
        expires_at: expiresAt,
      });

      return {
        code,
        expires_at: expiresAt.toISOString(),
      };
    } catch {
      continue;
    }
  }

  throw new AppError(500, 'TELEGRAM_LINK_CODE_CREATE_FAILED', 'Не удалось создать код привязки Telegram');
}

export async function changePassword(
  userId: string,
  input: { current_password?: string; new_password: string },
): Promise<{ success: true; has_password: true }> {
  const [user] = await db
    .select({
      id: users.id,
      password_hash: users.password_hash,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new NotFoundError('Пользователь не найден');
  }

  if (user.password_hash) {
    if (!input.current_password) {
      throw new AppError(400, 'CURRENT_PASSWORD_REQUIRED', 'Укажите текущий пароль');
    }

    const isCurrentPasswordValid = await argon2.verify(user.password_hash, input.current_password);
    if (!isCurrentPasswordValid) {
      throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Текущий пароль указан неверно');
    }

    const isSamePassword = await argon2.verify(user.password_hash, input.new_password);
    if (isSamePassword) {
      throw new AppError(400, 'PASSWORD_UNCHANGED', 'Новый пароль должен отличаться от текущего');
    }
  }

  const password_hash = await argon2.hash(input.new_password);

  await db
    .update(users)
    .set({ password_hash })
    .where(eq(users.id, userId));

  return { success: true, has_password: true };
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

