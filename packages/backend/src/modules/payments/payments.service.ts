import axios from 'axios';
import { randomUUID } from 'crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { env } from '../../config/env.js';
import { getUsdToRubRate } from '../../lib/app-settings.js';
import { logger } from '../../lib/logger.js';
import { AppError, NotFoundError } from '../../middleware/error-handler.js';
import { balanceTopups, balanceTransactions, users } from '../../db/schema/index.js';

const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3';
const DEFAULT_PRESET_AMOUNTS_RUB = [100, 500, 1000, 3000, 5000, 10000];
const PROCESSING_STATUSES = new Set(['pending', 'waiting_for_capture']);

type YooKassaPayment = {
  id: string;
  status: string;
  paid?: boolean;
  amount: {
    value: string;
    currency: string;
  };
  confirmation?: {
    type?: string;
    confirmation_url?: string;
  };
  description?: string | null;
  metadata?: Record<string, string>;
  created_at?: string;
  captured_at?: string;
  canceled_at?: string;
  cancellation_details?: Record<string, unknown>;
  test?: boolean;
};

type YooKassaReceipt = {
  customer: {
    email: string;
  };
  items: Array<{
    description: string;
    quantity: string;
    amount: {
      value: string;
      currency: 'RUB';
    };
    vat_code: number;
    payment_mode: 'full_prepayment';
    payment_subject: 'service';
  }>;
};

type TopUpStatus =
  | 'pending'
  | 'waiting_for_capture'
  | 'succeeded'
  | 'canceled'
  | 'creation_failed';

function isYooKassaConfigured() {
  return Boolean(env.YOOKASSA_SHOP_ID && env.YOOKASSA_SECRET_KEY);
}

function assertYooKassaConfigured() {
  if (!isYooKassaConfigured()) {
    throw new AppError(503, 'PAYMENTS_UNAVAILABLE', 'Пополнение через YooKassa ещё не настроено');
  }
}

function roundRubAmount(value: number) {
  return Number(value.toFixed(2));
}

function roundUsdAmount(value: number) {
  return Number(value.toFixed(4));
}

function normalizeRubAmount(input: number) {
  const amount = Number(input);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError(400, 'INVALID_TOPUP_AMOUNT', 'Некорректная сумма пополнения');
  }

  const rounded = roundRubAmount(amount);
  if (rounded < env.YOOKASSA_TOPUP_MIN_RUB || rounded > env.YOOKASSA_TOPUP_MAX_RUB) {
    throw new AppError(
      400,
      'INVALID_TOPUP_AMOUNT',
      `Сумма пополнения должна быть от ${env.YOOKASSA_TOPUP_MIN_RUB} до ${env.YOOKASSA_TOPUP_MAX_RUB} ₽`,
    );
  }

  return rounded;
}

function buildReturnUrl(topupId: string) {
  const url = new URL('/profile', env.FRONTEND_URL);
  url.searchParams.set('topup', 'return');
  url.searchParams.set('topup_id', topupId);
  return url.toString();
}

function buildYooKassaReceipt(userEmail: string, amountRub: number): YooKassaReceipt {
  return {
    customer: {
      email: userEmail,
    },
    items: [
      {
        description: 'Пополнение внутреннего баланса LLMStore.pro',
        quantity: '1.00',
        amount: {
          value: amountRub.toFixed(2),
          currency: 'RUB',
        },
        vat_code: env.YOOKASSA_RECEIPT_VAT_CODE,
        payment_mode: 'full_prepayment',
        payment_subject: 'service',
      },
    ],
  };
}

function getTopUpDescription(amountRub: number) {
  const description = `Пополнение баланса llmstore.pro на ${amountRub.toFixed(2)} RUB`;
  return description.slice(0, 128);
}

function getYooKassaAuthHeader() {
  const encoded = Buffer.from(`${env.YOOKASSA_SHOP_ID}:${env.YOOKASSA_SECRET_KEY}`).toString('base64');
  return `Basic ${encoded}`;
}

function serializeUnknownError(err: unknown): Record<string, unknown> {
  if (axios.isAxiosError(err)) {
    return {
      message: err.message,
      status: err.response?.status ?? null,
      data: err.response?.data ?? null,
    };
  }
  if (err instanceof Error) {
    return { message: err.message };
  }
  return { message: 'Unknown error' };
}

async function requestYooKassa<T>(options: {
  method: 'get' | 'post';
  path: string;
  data?: Record<string, unknown>;
  idempotenceKey?: string;
}): Promise<T> {
  assertYooKassaConfigured();

  const headers: Record<string, string> = {
    Authorization: getYooKassaAuthHeader(),
    'Content-Type': 'application/json',
  };

  if (options.idempotenceKey) {
    headers['Idempotence-Key'] = options.idempotenceKey;
  }

  const response = await axios.request<T>({
    url: `${YOOKASSA_API_URL}${options.path}`,
    method: options.method,
    headers,
    data: options.data,
    timeout: 20_000,
  });

  return response.data;
}

function formatTopUp(row: typeof balanceTopups.$inferSelect) {
  return {
    id: row.id,
    provider: row.provider,
    status: row.status as TopUpStatus | string,
    amount_rub: String(row.amount_rub),
    amount_usd: String(row.amount_usd),
    usd_to_rub_rate: String(row.usd_to_rub_rate),
    confirmation_url: row.confirmation_url,
    return_url: row.return_url,
    provider_payment_id: row.provider_payment_id,
    paid_at: row.paid_at?.toISOString() ?? null,
    credited_at: row.credited_at?.toISOString() ?? null,
    canceled_at: row.canceled_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

async function getTopUpByLocalId(topupId: string) {
  const [row] = await db
    .select()
    .from(balanceTopups)
    .where(eq(balanceTopups.id, topupId))
    .limit(1);

  return row ?? null;
}

async function getTopUpByProviderPaymentId(providerPaymentId: string) {
  const [row] = await db
    .select()
    .from(balanceTopups)
    .where(eq(balanceTopups.provider_payment_id, providerPaymentId))
    .limit(1);

  return row ?? null;
}

async function fetchYooKassaPayment(paymentId: string) {
  return requestYooKassa<YooKassaPayment>({
    method: 'get',
    path: `/payments/${paymentId}`,
  });
}

async function updateTopUpState(
  topupId: string,
  patch: Partial<typeof balanceTopups.$inferInsert>,
) {
  await db
    .update(balanceTopups)
    .set({
      ...patch,
      updated_at: new Date(),
    })
    .where(eq(balanceTopups.id, topupId));
}

function assertVerifiedPaymentMatchesTopUp(
  topup: typeof balanceTopups.$inferSelect,
  payment: YooKassaPayment,
) {
  const expectedRub = roundRubAmount(Number(topup.amount_rub)).toFixed(2);
  const actualRub = roundRubAmount(Number(payment.amount.value)).toFixed(2);
  if (payment.amount.currency !== 'RUB' || expectedRub !== actualRub) {
    throw new AppError(400, 'PAYMENT_VERIFICATION_FAILED', 'Сумма платежа не совпадает с ожидаемой');
  }

  if (payment.metadata?.topup_id && payment.metadata.topup_id !== topup.id) {
    throw new AppError(400, 'PAYMENT_VERIFICATION_FAILED', 'Платеж привязан к другому пополнению');
  }
}

async function markTopUpAsSucceeded(
  topupId: string,
  payment: YooKassaPayment,
) {
  await db.transaction(async (tx) => {
    const lockedRows = await tx.execute<{
      id: string;
      user_id: string;
      status: string;
      amount_usd: string;
      amount_rub: string;
      balance_transaction_id: string | null;
    }>(sql`
      SELECT
        id,
        user_id,
        status,
        amount_usd,
        amount_rub,
        balance_transaction_id
      FROM balance_topups
      WHERE id = ${topupId}
      FOR UPDATE
    `);

    const locked = lockedRows[0];
    if (!locked) {
      throw new NotFoundError('Пополнение не найдено');
    }

    if (locked.balance_transaction_id || locked.status === 'succeeded') {
      await tx
        .update(balanceTopups)
        .set({
          status: 'succeeded',
          provider_payment_id: payment.id,
          raw_payment_json: payment,
          paid_at: payment.captured_at ? new Date(payment.captured_at) : new Date(),
          updated_at: new Date(),
        })
        .where(eq(balanceTopups.id, topupId));
      return;
    }

    const [user] = await tx
      .select({ id: users.id, balance_usd: users.balance_usd })
      .from(users)
      .where(eq(users.id, locked.user_id))
      .limit(1);

    if (!user) {
      throw new NotFoundError('Пользователь не найден');
    }

    const topupAmountUsd = roundUsdAmount(Number(locked.amount_usd));
    const newBalance = roundUsdAmount(Number(user.balance_usd) + topupAmountUsd);

    await tx
      .update(users)
      .set({
        balance_usd: newBalance.toFixed(4),
      })
      .where(eq(users.id, locked.user_id));

    const [balanceTx] = await tx
      .insert(balanceTransactions)
      .values({
        user_id: locked.user_id,
        amount: topupAmountUsd.toFixed(4),
        balance_after: newBalance.toFixed(4),
        type: 'topup',
        description: `Пополнение через YooKassa (${payment.id})`,
        performed_by: null,
      })
      .returning({ id: balanceTransactions.id });

    await tx
      .update(balanceTopups)
      .set({
        status: 'succeeded',
        provider_payment_id: payment.id,
        balance_transaction_id: balanceTx.id,
        raw_payment_json: payment,
        paid_at: payment.captured_at ? new Date(payment.captured_at) : new Date(),
        credited_at: new Date(),
        canceled_at: null,
        updated_at: new Date(),
      })
      .where(eq(balanceTopups.id, topupId));
  });
}

async function syncTopUpWithPayment(
  topup: typeof balanceTopups.$inferSelect,
  payment: YooKassaPayment,
) {
  assertVerifiedPaymentMatchesTopUp(topup, payment);

  if (payment.status === 'succeeded' && payment.paid) {
    await markTopUpAsSucceeded(topup.id, payment);
    return;
  }

  if (payment.status === 'canceled') {
    await updateTopUpState(topup.id, {
      status: 'canceled',
      provider_payment_id: payment.id,
      raw_payment_json: payment,
      canceled_at: payment.canceled_at ? new Date(payment.canceled_at) : new Date(),
    });
    return;
  }

  await updateTopUpState(topup.id, {
    status: payment.status,
    provider_payment_id: payment.id,
    raw_payment_json: payment,
    confirmation_url: payment.confirmation?.confirmation_url ?? topup.confirmation_url,
  });
}

async function syncTopUpFromProvider(topup: typeof balanceTopups.$inferSelect) {
  if (!topup.provider_payment_id || !PROCESSING_STATUSES.has(topup.status)) {
    return topup;
  }

  const payment = await fetchYooKassaPayment(topup.provider_payment_id);
  await syncTopUpWithPayment(topup, payment);
  return getTopUpByLocalId(topup.id);
}

export function getYooKassaPublicConfig() {
  const presetAmountsRub = DEFAULT_PRESET_AMOUNTS_RUB
    .filter((amount) => amount >= env.YOOKASSA_TOPUP_MIN_RUB && amount <= env.YOOKASSA_TOPUP_MAX_RUB);

  return {
    provider: 'yookassa' as const,
    enabled: isYooKassaConfigured(),
    min_amount_rub: env.YOOKASSA_TOPUP_MIN_RUB,
    max_amount_rub: env.YOOKASSA_TOPUP_MAX_RUB,
    preset_amounts_rub: presetAmountsRub.length > 0
      ? presetAmountsRub
      : [env.YOOKASSA_TOPUP_MIN_RUB],
  };
}

export async function createYooKassaTopUp(userId: string, input: { amount_rub: number }) {
  assertYooKassaConfigured();

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new NotFoundError('Пользователь не найден');
  }

  const amountRub = normalizeRubAmount(input.amount_rub);
  const usdToRubRate = await getUsdToRubRate();
  const amountUsd = roundUsdAmount(amountRub / usdToRubRate);
  const topupId = randomUUID();
  const idempotenceKey = randomUUID();
  const returnUrl = buildReturnUrl(topupId);
  const description = getTopUpDescription(amountRub);
  const receipt = buildYooKassaReceipt(user.email, amountRub);

  await db.insert(balanceTopups).values({
    id: topupId,
    user_id: userId,
    provider: 'yookassa',
    idempotence_key: idempotenceKey,
    status: 'pending',
    amount_rub: amountRub.toFixed(2),
    amount_usd: amountUsd.toFixed(4),
    usd_to_rub_rate: usdToRubRate.toFixed(4),
    description,
    return_url: returnUrl,
  });

  try {
    const payment = await requestYooKassa<YooKassaPayment>({
      method: 'post',
      path: '/payments',
      idempotenceKey,
      data: {
        amount: {
          value: amountRub.toFixed(2),
          currency: 'RUB',
        },
        capture: true,
        confirmation: {
          type: 'redirect',
          return_url: returnUrl,
        },
        description,
        receipt,
        metadata: {
          topup_id: topupId,
          user_id: userId,
        },
      },
    });

    await updateTopUpState(topupId, {
      provider_payment_id: payment.id,
      confirmation_url: payment.confirmation?.confirmation_url ?? null,
      status: payment.status,
      raw_payment_json: payment,
    });

    const saved = await getTopUpByLocalId(topupId);
    if (!saved) {
      throw new NotFoundError('Пополнение не найдено после создания');
    }

    if (!saved.confirmation_url) {
      throw new AppError(502, 'PAYMENT_CREATION_FAILED', 'YooKassa не вернула ссылку на оплату');
    }

    return {
      topup: formatTopUp(saved),
      confirmation_url: saved.confirmation_url,
    };
  } catch (err) {
    await updateTopUpState(topupId, {
      status: 'creation_failed',
      raw_payment_json: serializeUnknownError(err),
    });

    logger.error({ err, topupId, userId }, 'Failed to create YooKassa payment');

    if (axios.isAxiosError(err) && err.response?.status && err.response.status < 500) {
      throw new AppError(
        502,
        'PAYMENT_CREATION_FAILED',
        'YooKassa отклонила создание платежа',
        { provider_error: err.response.data },
      );
    }

    if (err instanceof AppError) {
      throw err;
    }

    throw new AppError(502, 'PAYMENT_CREATION_FAILED', 'Не удалось создать платёж в YooKassa');
  }
}

export async function getTopUpForUser(userId: string, topupId: string) {
  const topup = await getTopUpByLocalId(topupId);
  if (!topup || topup.user_id !== userId) {
    throw new NotFoundError('Пополнение не найдено');
  }

  const synced = await syncTopUpFromProvider(topup);
  if (!synced) {
    throw new NotFoundError('Пополнение не найдено');
  }

  return formatTopUp(synced);
}

export async function handleYooKassaWebhook(payload: unknown) {
  const body = typeof payload === 'object' && payload !== null
    ? payload as {
      type?: string;
      event?: string;
      object?: { id?: string };
    }
    : null;

  const paymentId = body?.object?.id;
  if (!paymentId) {
    throw new AppError(400, 'INVALID_WEBHOOK', 'В webhook отсутствует идентификатор платежа');
  }

  const payment = await fetchYooKassaPayment(paymentId);
  let topup = await getTopUpByProviderPaymentId(payment.id);

  if (!topup && payment.metadata?.topup_id) {
    topup = await getTopUpByLocalId(payment.metadata.topup_id);
  }

  if (!topup) {
    logger.warn({ paymentId }, 'YooKassa webhook received for unknown top-up');
    return { received: true };
  }

  await syncTopUpWithPayment(topup, payment);
  return { received: true };
}
