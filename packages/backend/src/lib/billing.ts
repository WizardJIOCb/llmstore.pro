import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { balanceTransactions, users } from '../db/schema/index.js';
import { NotFoundError } from '../middleware/error-handler.js';

export async function chargeUserBalanceForUsage(input: {
  user_id: string;
  amount_usd: number;
  type: 'chat_usage' | 'agent_run_usage';
  description: string;
}) {
  const normalizedAmount = Number(input.amount_usd);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    return null;
  }

  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: users.id, balance_usd: users.balance_usd })
      .from(users)
      .where(eq(users.id, input.user_id))
      .limit(1);

    if (!user) {
      throw new NotFoundError('Пользователь не найден');
    }

    const currentBalance = Number(user.balance_usd);
    const newBalance = currentBalance - normalizedAmount;
    const txAmount = -normalizedAmount;

    await tx
      .update(users)
      .set({ balance_usd: String(newBalance.toFixed(4)) })
      .where(eq(users.id, input.user_id));

    const [balanceTx] = await tx
      .insert(balanceTransactions)
      .values({
        user_id: input.user_id,
        amount: String(txAmount.toFixed(4)),
        balance_after: String(newBalance.toFixed(4)),
        type: input.type,
        description: input.description,
        performed_by: null,
      })
      .returning();

    return {
      balance_usd: newBalance.toFixed(4),
      transaction_id: balanceTx.id,
    };
  });
}
