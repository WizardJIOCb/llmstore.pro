import { eq, sql } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { users, authAccounts } from '../../db/schema/index.js';
import { AppError, ConflictError, NotFoundError } from '../../middleware/error-handler.js';
import { ROLE_LIMITS, USD_TO_RUB_RATE } from '@llmstore/shared';
import type { UserProfile, LinkedAccount, UserUsageSummary, AgentUsageSummary, UserLimits } from '@llmstore/shared';
import type { UserRole } from '@llmstore/shared';

export async function getProfile(userId: string): Promise<UserProfile> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new NotFoundError('Пользователь не найден');
  }

  // Linked accounts
  const accounts = await db
    .select({
      provider: authAccounts.provider,
      provider_account_id: authAccounts.provider_account_id,
      created_at: authAccounts.created_at,
    })
    .from(authAccounts)
    .where(eq(authAccounts.user_id, userId));

  const linked_accounts: LinkedAccount[] = accounts.map((a) => ({
    provider: a.provider,
    provider_account_id: a.provider_account_id,
    created_at: a.created_at.toISOString(),
  }));

  // Usage stats aggregation
  const usageRows = await db.execute<{
    agent_id: string;
    agent_name: string;
    total_runs: string;
    total_tokens: string;
    total_cost: string;
  }>(sql`
    SELECT
      ar.agent_id,
      COALESCE(a.name, 'Удалённый агент') AS agent_name,
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
  // Check that user has another auth method
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
