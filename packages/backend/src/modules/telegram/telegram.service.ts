import { and, desc, eq } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../config/database.js';
import { logger } from '../../lib/logger.js';
import { AppError } from '../../middleware/error-handler.js';
import { publishedLandings, telegramLinkCodes, telegramLinks } from '../../db/schema/index.js';

type TelegramChat = {
  id?: number | string;
  type?: string;
};

type TelegramUser = {
  id?: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramMessage = {
  message_id?: number;
  text?: string;
  chat?: TelegramChat;
  from?: TelegramUser;
};

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
};

function isTelegramConfigured(): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN.trim());
}

function normalizeTelegramId(value: string | number | undefined): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function normalizeLinkCode(input: string): string {
  return input.replace(/\D+/g, '').trim();
}

function buildTelegramDisplayName(input: { username?: string | null; firstName?: string | null; lastName?: string | null }): string {
  const fullName = [input.firstName, input.lastName].filter(Boolean).join(' ').trim();
  if (fullName) return fullName;
  if (input.username) return `@${input.username.replace(/^@+/, '')}`;
  return 'профиль LLM Store';
}

function buildTelegramBotLabel(): string {
  const username = env.TELEGRAM_BOT_USERNAME.trim().replace(/^@+/, '');
  return username ? `@${username}` : 'боту LLM Store';
}

async function sendTelegramApi(method: string, body: Record<string, unknown>) {
  if (!isTelegramConfigured()) return null;

  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Telegram API ${method} failed: ${response.status} ${text}`);
  }

  return response.json().catch(() => null);
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  if (!isTelegramConfigured()) return;
  await sendTelegramApi('sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: false,
  });
}

async function consumeTelegramLinkCode(input: {
  code: string;
  telegramUserId: string;
  telegramChatId: string;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramLastName: string | null;
}): Promise<void> {
  const now = new Date();

  await db.transaction(async (tx) => {
    const [linkCode] = await tx
      .select({
        id: telegramLinkCodes.id,
        user_id: telegramLinkCodes.user_id,
        expires_at: telegramLinkCodes.expires_at,
        consumed_at: telegramLinkCodes.consumed_at,
      })
      .from(telegramLinkCodes)
      .where(eq(telegramLinkCodes.code, input.code))
      .limit(1);

    if (!linkCode || linkCode.consumed_at || linkCode.expires_at <= now) {
      throw new AppError(400, 'TELEGRAM_LINK_CODE_INVALID', 'Код привязки недействителен или уже истёк.');
    }

    const [existingByTelegramUser] = await tx
      .select({
        id: telegramLinks.id,
        user_id: telegramLinks.user_id,
      })
      .from(telegramLinks)
      .where(eq(telegramLinks.telegram_user_id, input.telegramUserId))
      .limit(1);

    if (existingByTelegramUser && existingByTelegramUser.user_id !== linkCode.user_id) {
      throw new AppError(409, 'TELEGRAM_ALREADY_LINKED', 'Этот Telegram уже привязан к другому аккаунту LLM Store.');
    }

    const [consumed] = await tx
      .update(telegramLinkCodes)
      .set({
        consumed_at: now,
        consumed_telegram_user_id: input.telegramUserId,
      })
      .where(eq(telegramLinkCodes.id, linkCode.id))
      .returning({ id: telegramLinkCodes.id });

    if (!consumed) {
      throw new AppError(409, 'TELEGRAM_LINK_CODE_ALREADY_USED', 'Код привязки уже был использован.');
    }

    const [existingByUser] = await tx
      .select({ id: telegramLinks.id })
      .from(telegramLinks)
      .where(eq(telegramLinks.user_id, linkCode.user_id))
      .limit(1);

    if (existingByUser) {
      await tx.update(telegramLinks)
        .set({
          telegram_user_id: input.telegramUserId,
          telegram_chat_id: input.telegramChatId,
          telegram_username: input.telegramUsername,
          telegram_first_name: input.telegramFirstName,
          telegram_last_name: input.telegramLastName,
          linked_at: now,
          last_seen_at: now,
          updated_at: now,
        })
        .where(eq(telegramLinks.id, existingByUser.id));
    } else {
      await tx.insert(telegramLinks).values({
        user_id: linkCode.user_id,
        telegram_user_id: input.telegramUserId,
        telegram_chat_id: input.telegramChatId,
        telegram_username: input.telegramUsername,
        telegram_first_name: input.telegramFirstName,
        telegram_last_name: input.telegramLastName,
        linked_at: now,
        last_seen_at: now,
      });
    }
  });
}

function extractLinkCommandCode(text: string): string | null {
  const trimmed = text.trim();
  const commandMatch = trimmed.match(/^\/link(?:@\w+)?\s+(.+)$/i);
  if (commandMatch?.[1]) {
    const code = normalizeLinkCode(commandMatch[1]);
    return code || null;
  }

  const digits = normalizeLinkCode(trimmed);
  return digits.length >= 4 && digits.length <= 8 ? digits : null;
}

export async function handleTelegramWebhookUpdate(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  const text = message?.text?.trim() ?? '';
  const chatId = normalizeTelegramId(message?.chat?.id);
  const telegramUserId = normalizeTelegramId(message?.from?.id);
  const telegramUsername = message?.from?.username?.trim() || null;
  const telegramFirstName = message?.from?.first_name?.trim() || null;
  const telegramLastName = message?.from?.last_name?.trim() || null;

  if (!message || !chatId || !telegramUserId) {
    return;
  }

  logger.info({
    updateId: update.update_id ?? null,
    chatId,
    telegramUserId,
    text: text || null,
  }, 'telegram webhook update');

  try {
    const linkCode = extractLinkCommandCode(text);

    if (/^\/start/i.test(text) && !linkCode) {
      await sendTelegramMessage(
        chatId,
        `Это бот LLM Store. Получите код привязки в профиле llmstore.pro и отправьте сюда команду /link 123456, чтобы связать Telegram с вашим аккаунтом.`,
      );
      return;
    }

    if (linkCode) {
      await consumeTelegramLinkCode({
        code: linkCode,
        telegramUserId,
        telegramChatId: chatId,
        telegramUsername,
        telegramFirstName,
        telegramLastName,
      });

      await sendTelegramMessage(
        chatId,
        `Готово. Telegram привязан к вашему аккаунту LLM Store. Теперь я смогу присылать сюда результаты и ссылки на задачи из Алисы.`,
      );
      return;
    }

    await sendTelegramMessage(
      chatId,
      `Чтобы привязать Telegram к LLM Store, получите код в профиле и отправьте сюда: /link 123456`,
    );
  } catch (error) {
    const messageText = error instanceof AppError
      ? error.message
      : 'Не удалось обработать привязку Telegram. Попробуйте ещё раз.';

    logger.warn({ err: error, chatId, telegramUserId }, 'telegram webhook handling failed');
    await sendTelegramMessage(chatId, messageText);
  }
}

async function getTelegramLinkForUser(userId: string) {
  const [row] = await db
    .select()
    .from(telegramLinks)
    .where(eq(telegramLinks.user_id, userId))
    .limit(1);

  return row ?? null;
}

async function getPublishedLandingUrlForMessage(userId: string, messageId: string | null | undefined): Promise<string | null> {
  if (!messageId) return null;

  const [landing] = await db
    .select({
      subdomain: publishedLandings.subdomain,
    })
    .from(publishedLandings)
    .where(
      and(
        eq(publishedLandings.user_id, userId),
        eq(publishedLandings.message_id, messageId),
        eq(publishedLandings.status, 'active'),
      ),
    )
    .orderBy(desc(publishedLandings.created_at))
    .limit(1);

  if (!landing?.subdomain) return null;

  const frontendUrl = new URL(env.FRONTEND_URL);
  return `${frontendUrl.protocol}//${landing.subdomain}.${frontendUrl.host}/`;
}

export async function notifyTelegramTaskCompleted(input: {
  userId: string;
  command: string | null;
  responseText: string | null;
  assistantMessageId?: string | null;
}): Promise<void> {
  if (!isTelegramConfigured()) return;

  const link = await getTelegramLinkForUser(input.userId);
  if (!link || !link.notify_on_task_completed) return;

  const landingUrl = await getPublishedLandingUrlForMessage(input.userId, input.assistantMessageId);
  const displayName = buildTelegramDisplayName({
    username: link.telegram_username,
    firstName: link.telegram_first_name,
    lastName: link.telegram_last_name,
  });

  const parts = [
    `Задача из Алисы завершена для ${displayName}.`,
  ];

  if (input.command?.trim()) {
    parts.push(`Запрос: ${input.command.trim()}`);
  }

  if (landingUrl && link.notify_on_landing_ready) {
    parts.push(`Лендинг готов: ${landingUrl}`);
  }

  if (input.responseText?.trim()) {
    const preview = input.responseText.trim().slice(0, 600);
    parts.push(`Результат: ${preview}`);
  }

  await sendTelegramMessage(link.telegram_chat_id, parts.join('\n\n'));
  await db.update(telegramLinks)
    .set({ last_seen_at: new Date(), updated_at: new Date() })
    .where(eq(telegramLinks.id, link.id));
}

export async function notifyTelegramTaskFailed(input: {
  userId: string;
  command: string | null;
  errorText: string | null;
}): Promise<void> {
  if (!isTelegramConfigured()) return;

  const link = await getTelegramLinkForUser(input.userId);
  if (!link || !link.notify_on_task_failed) return;

  const parts = ['Задача из Алисы завершилась с ошибкой.'];
  if (input.command?.trim()) {
    parts.push(`Запрос: ${input.command.trim()}`);
  }
  if (input.errorText?.trim()) {
    parts.push(`Ошибка: ${input.errorText.trim().slice(0, 600)}`);
  }

  await sendTelegramMessage(link.telegram_chat_id, parts.join('\n\n'));
  await db.update(telegramLinks)
    .set({ last_seen_at: new Date(), updated_at: new Date() })
    .where(eq(telegramLinks.id, link.id));
}

export function getTelegramBotProfile() {
  return {
    username: env.TELEGRAM_BOT_USERNAME.trim().replace(/^@+/, '') || null,
    label: buildTelegramBotLabel(),
    configured: isTelegramConfigured(),
  };
}
