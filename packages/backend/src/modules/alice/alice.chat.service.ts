import crypto from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  aliceLinkCodes,
  aliceSkillLinks,
  aliceUserSettings,
  aliceWebhookLogs,
  balanceTransactions,
  chatConversations,
  chatProjectDeploymentServices,
  chatProjectDeployments,
  agentRuns,
  users,
} from '../../db/schema/index.js';
import { AppError } from '../../middleware/error-handler.js';
import { getSignupBonusSettings } from '../../lib/app-settings.js';
import { logger } from '../../lib/logger.js';
import { markUserActive } from '../auth/login-activity.service.js';
import { grantSignupBonusIfEligible } from '../auth/signup-bonus.service.js';
import * as runtimeService from '../agent-runtime/runtime.service.js';
import * as telegramService from '../telegram/telegram.service.js';

const DEFAULT_ALICE_CHAT_TITLE = 'Alice';
const DEFAULT_ALICE_USER_NAME = 'Alice user';
const ALICE_DEVICE_FINGERPRINT_PREFIX = 'alice-skill:';
const ALICE_SYSTEM_USER_AGENT = 'yandex-dialogs-alice';
const ALICE_SYNTHETIC_EMAIL_DOMAIN = '@alice.llmstore.local';
const ALICE_TEXT_LIMIT = 1024;
const ALICE_TTS_LIMIT = 1024;
const ALICE_SERVICE_SYSTEM_PROMPT = `Ты голосовой помощник сервиса LLM Store и отвечаешь по-русски.

Если пользователь спрашивает, что такое LLM Store, о чём этот сервис или что в нём можно делать, обязательно упоминай возможность публиковать и привязывать сгенерированные лендинги на поддоменах вида rodion.llmstore.pro.

Ключевые факты о LLM Store:
- LLM Store — это маркетплейс и конструктор AI-агентов, инструментов, моделей и рабочих AI-сценариев.
- В сервисе есть обычные чаты с моделями через OpenRouter.
- В сервисе есть агентные чаты, где можно общаться с конкретным агентом под задачу.
- Пользователь может создавать и настраивать своих агентов.
- В сервисе есть галерея, превью и публикация результатов.
- В сервисе можно публиковать и привязывать лендинги на поддоменах вида rodion.llmstore.pro.
- В сервисе есть деплой проектов и интеграции, включая webhook-сценарии и Telegram.
- У пользователя есть баланс в USD; часть запросов и запусков списывает стоимость с баланса.
- Для новых пользователей может выдаваться стартовый бонус, который настраивается в админке.
- Веб-версия — основное место для детальной настройки чатов, агентов, инструментов и профиля.

Правила ответа:
- Если спрашивают "что такое LLM Store", "о чём LLM Store", "что можно делать в LLM Store", отвечай именно про этот сервис.
- Не говори, что ты не знаешь, что такое LLM Store, если вопрос явно о сервисе.
- Не выдумывай несуществующие функции. Если точных данных нет, честно скажи об этом и опирайся только на факты выше.
- Отвечай кратко, ясно и по делу, потому что ответ будет озвучиваться голосом.
- Если вопрос о самом сервисе, сначала коротко опиши платформу, затем перечисли 2-4 самых полезных возможности.`;

export interface AliceSessionContext {
  userId: string;
  chatId: string;
  isNewUser: boolean;
  bonusGranted: boolean;
  bonusAmountUsd: number | null;
}

export interface AliceChatReply {
  text: string;
  tts: string;
  context: AliceSessionContext;
}

type AliceLastTaskStatus = 'processing' | 'completed' | 'failed';

function normalizeAliceIdentifier(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function buildSyntheticAliceEmail(skillUserId: string): string {
  const digest = crypto.createHash('sha256').update(skillUserId).digest('hex').slice(0, 24);
  return `alice-${digest}${ALICE_SYNTHETIC_EMAIL_DOMAIN}`;
}

function isSyntheticAliceEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.endsWith(ALICE_SYNTHETIC_EMAIL_DOMAIN);
}

function squeezeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function sanitizeAliceOutput(value: string, maxLength: number): string {
  const normalized = squeezeWhitespace(
    value
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/[*_~#>-]+/g, ' '),
  );

  if (!normalized) return 'Готово.';
  if (normalized.length <= maxLength) return normalized;

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function normalizeAliceTextOutput(value: string): string {
  const normalized = value
    .replace(/\r\n/g, '\n')
    .replace(/```[a-zA-Z0-9_-]*\n?/g, '')
    .replace(/```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return normalized || 'Готово.';
}

function sanitizeAliceTextOutput(value: string, maxLength: number): string {
  const normalized = normalizeAliceTextOutput(value);

  if (!normalized) return 'Готово.';
  if (normalized.length <= maxLength) return normalized;

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function sanitizeAliceTtsOutput(value: string, maxLength: number): string {
  const normalized = squeezeWhitespace(
    value
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/[*_~#>-]+/g, ' '),
  );

  if (!normalized) return 'Готово.';
  if (normalized.length <= maxLength) return normalized;

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

async function updateAliceLastTaskState(
  userId: string,
  input: {
    command?: string | null;
    status?: AliceLastTaskStatus | null;
    responseText?: string | null;
    responseOffset?: number | null;
    errorText?: string | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
  },
): Promise<void> {
  await db
    .update(aliceUserSettings)
    .set({
      last_task_command: input.command ?? null,
      last_task_status: input.status ?? null,
      last_task_response_text: input.responseText ?? null,
      last_task_response_offset: input.responseOffset ?? 0,
      last_task_error: input.errorText ?? null,
      last_task_started_at: input.startedAt ?? null,
      last_task_completed_at: input.completedAt ?? null,
      updated_at: new Date(),
    })
    .where(eq(aliceUserSettings.user_id, userId));
}

function buildAliceTaskProcessingText(): string {
  return 'Задача уже в обработке. Вы можете узнать статус, сказав: Алиса, запусти навык LLM Store и уточни статус задачи.';
}

function normalizeAliceOutput(value: string): string {
  return squeezeWhitespace(
    value
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/[*_~#>-]+/g, ' '),
  ) || 'Готово.';
}

function getAliceResponseChunk(value: string, offset = 0, maxLength = ALICE_TEXT_LIMIT): {
  chunk: string;
  nextOffset: number;
  hasMore: boolean;
} {
  const normalized = normalizeAliceTextOutput(value);
  const safeOffset = Math.max(0, Math.min(offset, normalized.length));
  if (safeOffset >= normalized.length) {
    return { chunk: '', nextOffset: normalized.length, hasMore: false };
  }

  const remaining = normalized.slice(safeOffset);
  if (remaining.length <= maxLength) {
    return { chunk: remaining, nextOffset: normalized.length, hasMore: false };
  }

  const hardSlice = remaining.slice(0, maxLength);
  const breakCandidates = [
    hardSlice.lastIndexOf('. '),
    hardSlice.lastIndexOf('! '),
    hardSlice.lastIndexOf('? '),
    hardSlice.lastIndexOf('; '),
    hardSlice.lastIndexOf(': '),
    hardSlice.lastIndexOf(', '),
    hardSlice.lastIndexOf(' '),
  ];
  const breakIndex = breakCandidates.find((index) => index >= Math.floor(maxLength * 0.6)) ?? -1;
  const splitAt = breakIndex >= 0 ? breakIndex + 1 : maxLength;
  const chunk = remaining.slice(0, splitAt).trim();
  const nextOffset = safeOffset + splitAt;

  return {
    chunk,
    nextOffset,
    hasMore: nextOffset < normalized.length,
  };
}

function buildAliceTaskStatusText(input: {
  status: AliceLastTaskStatus;
  responseText?: string | null;
  hasMore?: boolean;
  errorText?: string | null;
}): string {
  if (input.status === 'completed') {
    if (input.responseText?.trim()) {
      const suffix = input.hasMore ? ' Чтобы получить продолжение, скажите: Алиса, запусти навык LLM Store и продолжи ответ.' : '';
      return `Последняя задача уже завершена. Вот ответ: ${sanitizeAliceTextOutput(input.responseText, 900)}${suffix}`;
    }

    return 'Последняя задача уже завершена. Результат сохранён в вашем чате LLM Store.';
  }

  if (input.status === 'failed') {
    return input.errorText?.trim()
      ? `Последняя задача завершилась с ошибкой: ${sanitizeAliceTextOutput(input.errorText, 350)}`
      : 'Последняя задача завершилась с ошибкой. Попробуйте переформулировать запрос или запустить её ещё раз.';
  }

  return buildAliceTaskProcessingText();
}

async function mergeSyntheticAliceUserIntoTarget(sourceUserId: string, targetUserId: string): Promise<void> {
  if (sourceUserId === targetUserId) return;

  await db.transaction(async (tx) => {
    const [sourceUser] = await tx
      .select({
        id: users.id,
        email: users.email,
        balance_usd: users.balance_usd,
      })
      .from(users)
      .where(eq(users.id, sourceUserId))
      .limit(1);

    const [targetUser] = await tx
      .select({
        id: users.id,
        balance_usd: users.balance_usd,
      })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!sourceUser || !targetUser) {
      throw new AppError(404, 'ALICE_LINK_USER_NOT_FOUND', 'Не удалось найти пользователя для привязки Алисы');
    }

    if (!isSyntheticAliceEmail(sourceUser.email)) {
      throw new AppError(409, 'ALICE_ALREADY_LINKED_TO_OTHER_USER', 'Этот аккаунт Алисы уже привязан к другому пользователю');
    }

    const [sourceSettings] = await tx
      .select()
      .from(aliceUserSettings)
      .where(eq(aliceUserSettings.user_id, sourceUserId))
      .limit(1);

    const [targetSettings] = await tx
      .select()
      .from(aliceUserSettings)
      .where(eq(aliceUserSettings.user_id, targetUserId))
      .limit(1);

    await tx.update(chatConversations)
      .set({ user_id: targetUserId })
      .where(eq(chatConversations.user_id, sourceUserId));

    await tx.update(chatProjectDeployments)
      .set({ user_id: targetUserId })
      .where(eq(chatProjectDeployments.user_id, sourceUserId));

    await tx.update(chatProjectDeploymentServices)
      .set({ user_id: targetUserId })
      .where(eq(chatProjectDeploymentServices.user_id, sourceUserId));

    await tx.update(agentRuns)
      .set({ user_id: targetUserId })
      .where(eq(agentRuns.user_id, sourceUserId));

    await tx.update(balanceTransactions)
      .set({ user_id: targetUserId })
      .where(eq(balanceTransactions.user_id, sourceUserId));

    await tx.update(aliceWebhookLogs)
      .set({ user_id: targetUserId })
      .where(eq(aliceWebhookLogs.user_id, sourceUserId));

    await tx.update(aliceSkillLinks)
      .set({ user_id: targetUserId })
      .where(eq(aliceSkillLinks.user_id, sourceUserId));

    if (sourceSettings) {
      if (targetSettings) {
        await tx.update(aliceUserSettings)
          .set({
            is_enabled: sourceSettings.is_enabled,
            default_target_type: sourceSettings.default_target_type,
            default_chat_id: sourceSettings.default_chat_id,
            default_agent_id: sourceSettings.default_agent_id,
            default_model_external_id: sourceSettings.default_model_external_id,
            save_messages: sourceSettings.save_messages,
            tts_mode: sourceSettings.tts_mode,
            max_tts_chars: sourceSettings.max_tts_chars,
            last_task_command: sourceSettings.last_task_command,
            last_task_status: sourceSettings.last_task_status,
            last_task_response_text: sourceSettings.last_task_response_text,
            last_task_response_offset: sourceSettings.last_task_response_offset,
            last_task_error: sourceSettings.last_task_error,
            last_task_started_at: sourceSettings.last_task_started_at,
            last_task_completed_at: sourceSettings.last_task_completed_at,
            updated_at: new Date(),
          })
          .where(eq(aliceUserSettings.user_id, targetUserId));

        await tx.delete(aliceUserSettings).where(eq(aliceUserSettings.user_id, sourceUserId));
      } else {
        await tx.update(aliceUserSettings)
          .set({ user_id: targetUserId })
          .where(eq(aliceUserSettings.user_id, sourceUserId));
      }
    }

    const sourceBalance = Number(sourceUser.balance_usd ?? 0);
    const targetBalance = Number(targetUser.balance_usd ?? 0);

    if (sourceBalance !== 0) {
      await tx.update(users)
        .set({ balance_usd: String(targetBalance + sourceBalance) })
        .where(eq(users.id, targetUserId));

      await tx.update(users)
        .set({ balance_usd: '0' })
        .where(eq(users.id, sourceUserId));
    }
  });
}

async function ensureAliceLink(userId: string, skillUserId: string, applicationId: string | null, now: Date) {
  const [existingLink] = await db
    .select({
      id: aliceSkillLinks.id,
    })
    .from(aliceSkillLinks)
    .where(
      and(
        eq(aliceSkillLinks.user_id, userId),
        eq(aliceSkillLinks.yandex_skill_user_id, skillUserId),
      ),
    )
    .limit(1);

  if (existingLink) {
    await db
      .update(aliceSkillLinks)
      .set({
        yandex_application_id: applicationId,
        last_seen_at: now,
        updated_at: now,
      })
      .where(eq(aliceSkillLinks.id, existingLink.id));
    return;
  }

  await db.insert(aliceSkillLinks).values({
    user_id: userId,
    yandex_skill_user_id: skillUserId,
    yandex_application_id: applicationId,
    linked_at: now,
    last_seen_at: now,
  });
}

async function ensureAliceChat(userId: string): Promise<string> {
  const [settings] = await db
    .select({
      default_chat_id: aliceUserSettings.default_chat_id,
    })
    .from(aliceUserSettings)
    .where(eq(aliceUserSettings.user_id, userId))
    .limit(1);

  const existingChatId = settings?.default_chat_id ?? null;

  if (existingChatId) {
    const [chat] = await db
      .select({ id: chatConversations.id })
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.id, existingChatId),
          eq(chatConversations.user_id, userId),
        ),
      )
      .limit(1);

    if (chat) {
      await db
        .update(chatConversations)
        .set({
          title: DEFAULT_ALICE_CHAT_TITLE,
          access: 'private',
          system_prompt: ALICE_SERVICE_SYSTEM_PROMPT,
          updated_at: new Date(),
        })
        .where(eq(chatConversations.id, chat.id));
      return chat.id;
    }
  }

  const chat = await runtimeService.createChat(
    userId,
    {
      title: DEFAULT_ALICE_CHAT_TITLE,
      mode: 'general',
      access: 'private',
      system_prompt: ALICE_SERVICE_SYSTEM_PROMPT,
    },
    'user',
  );

  if (settings) {
    await db
      .update(aliceUserSettings)
      .set({
        default_chat_id: chat.id,
        updated_at: new Date(),
      })
      .where(eq(aliceUserSettings.user_id, userId));
  } else {
    await db.insert(aliceUserSettings).values({
      user_id: userId,
      default_chat_id: chat.id,
    });
  }

  return chat.id;
}

export async function ensureAliceSessionContext(
  skillUserIdInput: string | null | undefined,
  applicationIdInput?: string | null,
): Promise<AliceSessionContext> {
  const skillUserId = normalizeAliceIdentifier(skillUserIdInput);
  const applicationId = normalizeAliceIdentifier(applicationIdInput) || null;

  if (!skillUserId) {
    throw new AppError(400, 'ALICE_SKILL_USER_ID_REQUIRED', 'Не удалось определить пользователя Алисы');
  }

  const now = new Date();
  let userId: string | null = null;
  let isNewUser = false;
  let bonusGranted = false;
  let bonusAmountUsd: number | null = null;

  const [linkedAccount] = await db
    .select({
      user_id: aliceSkillLinks.user_id,
    })
    .from(aliceSkillLinks)
    .where(eq(aliceSkillLinks.yandex_skill_user_id, skillUserId))
    .orderBy(desc(aliceSkillLinks.linked_at))
    .limit(1);

  if (linkedAccount?.user_id) {
    userId = linkedAccount.user_id;
  } else {
    const syntheticEmail = buildSyntheticAliceEmail(skillUserId);
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, syntheticEmail))
      .limit(1);

    if (existingUser?.id) {
      userId = existingUser.id;
    } else {
      const [createdUser] = await db
        .insert(users)
        .values({
          email: syntheticEmail,
          name: DEFAULT_ALICE_USER_NAME,
          role: 'user',
          status: 'active',
          balance_usd: '0',
          email_verified_at: now,
          last_login_at: now,
          last_activity_at: now,
        })
        .returning({ id: users.id });

      userId = createdUser.id;
      isNewUser = true;

      bonusGranted = await grantSignupBonusIfEligible(createdUser.id, {
        deviceFingerprint: `${ALICE_DEVICE_FINGERPRINT_PREFIX}${skillUserId}`.slice(0, 255),
        userAgent: ALICE_SYSTEM_USER_AGENT,
      });

      if (bonusGranted) {
        const signupBonus = await getSignupBonusSettings();
        bonusAmountUsd = signupBonus.amount_usd;
      }
    }

    await ensureAliceLink(userId, skillUserId, applicationId, now);
  }

  await ensureAliceLink(userId, skillUserId, applicationId, now);
  await markUserActive(userId, now);

  const chatId = await ensureAliceChat(userId);

  return {
    userId,
    chatId,
    isNewUser,
    bonusGranted,
    bonusAmountUsd,
  };
}

export async function linkAliceAccountByCode(
  skillUserIdInput: string | null | undefined,
  applicationIdInput: string | null | undefined,
  rawCodeInput: string,
): Promise<{ text: string; context: AliceSessionContext }> {
  const skillUserId = normalizeAliceIdentifier(skillUserIdInput);
  const applicationId = normalizeAliceIdentifier(applicationIdInput) || null;
  const code = rawCodeInput.replace(/\D+/g, '').trim();

  if (!skillUserId) {
    throw new AppError(400, 'ALICE_SKILL_USER_ID_REQUIRED', 'Не удалось определить пользователя Алисы');
  }

  if (!code || code.length < 4) {
    throw new AppError(400, 'ALICE_LINK_CODE_REQUIRED', 'Назовите код привязки из профиля llmstore.pro');
  }

  const sourceContext = await ensureAliceSessionContext(skillUserId, applicationId);
  const now = new Date();

  const targetUserId = await db.transaction(async (tx) => {
    const [linkCode] = await tx
      .select({
        id: aliceLinkCodes.id,
        user_id: aliceLinkCodes.user_id,
        expires_at: aliceLinkCodes.expires_at,
        consumed_at: aliceLinkCodes.consumed_at,
      })
      .from(aliceLinkCodes)
      .where(eq(aliceLinkCodes.code, code))
      .limit(1);

    if (!linkCode || linkCode.consumed_at || linkCode.expires_at <= now) {
      throw new AppError(400, 'ALICE_LINK_CODE_INVALID', 'Код привязки недействителен или уже истёк');
    }

    const consumed = await tx.update(aliceLinkCodes)
      .set({
        consumed_at: now,
        consumed_skill_user_id: skillUserId,
      })
      .where(eq(aliceLinkCodes.id, linkCode.id))
      .returning({ id: aliceLinkCodes.id });

    if (!consumed.length) {
      throw new AppError(409, 'ALICE_LINK_CODE_ALREADY_USED', 'Код привязки уже был использован');
    }

    return linkCode.user_id;
  });

  if (targetUserId !== sourceContext.userId) {
    await mergeSyntheticAliceUserIntoTarget(sourceContext.userId, targetUserId);
  }

  await ensureAliceLink(targetUserId, skillUserId, applicationId, now);
  const context = await ensureAliceSessionContext(skillUserId, applicationId);

  return {
    text: 'Аккаунт успешно привязан. Теперь запросы из Алисы будут приходить в ваш профиль LLM Store.',
    context,
  };
}

export async function getAliceLastTaskStatusText(
  skillUserIdInput: string | null | undefined,
  applicationIdInput?: string | null,
): Promise<{ text: string; context: AliceSessionContext }> {
  const context = await ensureAliceSessionContext(skillUserIdInput, applicationIdInput);
  const details = await runtimeService.getChatById(context.chatId, context.userId);
  const [settings] = await db
    .select({
      lastTaskCommand: aliceUserSettings.last_task_command,
      lastTaskStatus: aliceUserSettings.last_task_status,
      lastTaskResponseText: aliceUserSettings.last_task_response_text,
      lastTaskResponseOffset: aliceUserSettings.last_task_response_offset,
      lastTaskError: aliceUserSettings.last_task_error,
    })
    .from(aliceUserSettings)
    .where(eq(aliceUserSettings.user_id, context.userId))
    .limit(1);

  const userMessages = details.messages.filter((message) => message.role === 'user');
  if (!settings?.lastTaskStatus && userMessages.length === 0) {
    return {
      text: 'У вас пока нет активных задач в навыке LLM Store. Просто скажите, что нужно сделать.',
      context,
    };
  }

  const pendingRun = details.chat.pending_run;
  if (pendingRun) {
    if (pendingRun.is_terminal) {
      const completedStatus: AliceLastTaskStatus = pendingRun.status === 'failed' ? 'failed' : 'completed';
      const latestAssistantResponse = completedStatus === 'completed'
        ? details.messages
          .slice()
          .reverse()
          .find((message) => message.role === 'assistant')
          ?.content ?? null
        : null;
      const responseChunk = latestAssistantResponse
        ? getAliceResponseChunk(latestAssistantResponse, 0)
        : null;
      await updateAliceLastTaskState(context.userId, {
        command: settings?.lastTaskCommand ?? null,
        status: completedStatus,
        responseText: latestAssistantResponse,
        responseOffset: responseChunk?.nextOffset ?? 0,
        errorText: completedStatus === 'failed' ? (pendingRun.error ?? pendingRun.detail) : null,
        startedAt: null,
        completedAt: new Date(),
      });

      return {
        text: buildAliceTaskStatusText({
          status: completedStatus,
          responseText: responseChunk?.chunk ?? latestAssistantResponse,
          hasMore: responseChunk?.hasMore ?? false,
          errorText: pendingRun.error ?? pendingRun.detail,
        }),
        context,
      };
    }

    return {
      text: `${pendingRun.label}. ${buildAliceTaskProcessingText()}`,
      context,
    };
  }

  if (settings?.lastTaskStatus) {
    const responseChunk = settings.lastTaskStatus === 'completed' && settings.lastTaskResponseText
      ? getAliceResponseChunk(settings.lastTaskResponseText, settings.lastTaskResponseOffset ?? 0)
      : null;

    if (responseChunk && settings.lastTaskResponseText) {
      await updateAliceLastTaskState(context.userId, {
        command: settings.lastTaskCommand ?? null,
        status: settings.lastTaskStatus as AliceLastTaskStatus,
        responseText: settings.lastTaskResponseText,
        responseOffset: responseChunk.nextOffset,
        errorText: settings.lastTaskError ?? null,
        startedAt: null,
        completedAt: null,
      });
    }

    return {
      text: buildAliceTaskStatusText({
        status: settings.lastTaskStatus as AliceLastTaskStatus,
        responseText: responseChunk?.chunk ?? settings.lastTaskResponseText ?? null,
        hasMore: responseChunk?.hasMore ?? false,
        errorText: settings.lastTaskError ?? null,
      }),
      context,
    };
  }

  return {
    text: 'Последняя задача сейчас ещё обрабатывается. Попробуйте уточнить статус чуть позже.',
    context,
  };
}

export async function getAliceLastTaskContinuationText(
  skillUserIdInput: string | null | undefined,
  applicationIdInput?: string | null,
): Promise<{ text: string; context: AliceSessionContext }> {
  const context = await ensureAliceSessionContext(skillUserIdInput, applicationIdInput);
  const [settings] = await db
    .select({
      lastTaskStatus: aliceUserSettings.last_task_status,
      lastTaskResponseText: aliceUserSettings.last_task_response_text,
      lastTaskResponseOffset: aliceUserSettings.last_task_response_offset,
    })
    .from(aliceUserSettings)
    .where(eq(aliceUserSettings.user_id, context.userId))
    .limit(1);

  if (!settings?.lastTaskStatus || settings.lastTaskStatus !== 'completed' || !settings.lastTaskResponseText) {
    return {
      text: 'Сейчас нет сохранённого ответа для продолжения. Сначала запустите задачу или уточните статус последней задачи.',
      context,
    };
  }

  const responseChunk = getAliceResponseChunk(
    settings.lastTaskResponseText,
    settings.lastTaskResponseOffset ?? 0,
  );

  if (!responseChunk.chunk) {
    return {
      text: 'Это уже был конец последнего ответа. Можете запустить новую задачу.',
      context,
    };
  }

  await updateAliceLastTaskState(context.userId, {
    status: 'completed',
    responseText: settings.lastTaskResponseText,
    responseOffset: responseChunk.nextOffset,
  });

  return {
    text: `Продолжение ответа: ${responseChunk.chunk}${responseChunk.hasMore ? ' Чтобы получить ещё часть, скажите: Алиса, запусти навык LLM Store и продолжи ответ.' : ''}`,
    context,
  };
}

export async function sendAliceChatMessage(
  skillUserIdInput: string | null | undefined,
  applicationIdInput: string | null | undefined,
  content: string,
): Promise<AliceChatReply> {
  const context = await ensureAliceSessionContext(skillUserIdInput, applicationIdInput);
  const result = await runtimeService.sendChatMessage(
    context.chatId,
    context.userId,
    content,
    undefined,
    'user',
  );

  const rawText = result.processing
    ? (result.pending_run?.detail || result.pending_run?.label || 'Сообщение принято. Продолжаю обработку в чате.')
    : (result.assistant_message?.content || 'Готово.');

  return {
    text: sanitizeAliceTextOutput(rawText, ALICE_TEXT_LIMIT),
    tts: sanitizeAliceTtsOutput(rawText, ALICE_TTS_LIMIT),
    context,
  };
}

export async function sendAliceChatMessageTracked(
  skillUserIdInput: string | null | undefined,
  applicationIdInput: string | null | undefined,
  content: string,
): Promise<AliceChatReply> {
  const context = await ensureAliceSessionContext(skillUserIdInput, applicationIdInput);
  const startedAt = new Date();

  await updateAliceLastTaskState(context.userId, {
    command: content.trim(),
    status: 'processing',
    responseText: null,
    errorText: null,
    startedAt,
    completedAt: null,
  });

  try {
    const result = await runtimeService.sendChatMessage(
      context.chatId,
      context.userId,
      content,
      undefined,
      'user',
    );

    const rawText = result.processing
      ? (result.pending_run?.detail || result.pending_run?.label || 'Сообщение принято. Продолжаю обработку в чате.')
      : (result.assistant_message?.content || 'Готово.');

    const responseChunk = !result.processing ? getAliceResponseChunk(rawText, 0) : null;
    const text = sanitizeAliceTextOutput(responseChunk?.chunk || rawText, ALICE_TEXT_LIMIT);
    const tts = sanitizeAliceTtsOutput(responseChunk?.chunk || rawText, ALICE_TTS_LIMIT);

    await updateAliceLastTaskState(context.userId, {
      command: content.trim(),
      status: result.processing ? 'processing' : 'completed',
      responseText: result.processing ? null : rawText,
      responseOffset: result.processing ? 0 : (responseChunk?.nextOffset ?? 0),
      errorText: null,
      startedAt,
      completedAt: result.processing ? null : new Date(),
    });

    if (!result.processing) {
      await telegramService.notifyTelegramTaskCompleted({
        userId: context.userId,
        command: content.trim(),
        responseText: text,
        assistantMessageId: result.assistant_message?.id ?? null,
      }).catch((notificationError) => {
        logger.warn({ err: notificationError, userId: context.userId }, 'telegram completion notification failed');
      });
    }

    return {
      text,
      tts,
      context,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Alice task error';

    await updateAliceLastTaskState(context.userId, {
      command: content.trim(),
      status: 'failed',
      responseText: null,
      errorText: message,
      startedAt,
      completedAt: new Date(),
    });

    await telegramService.notifyTelegramTaskFailed({
      userId: context.userId,
      command: content.trim(),
      errorText: message,
    }).catch((notificationError) => {
      logger.warn({ err: notificationError, userId: context.userId }, 'telegram failure notification failed');
    });

    throw error;
  }
}
