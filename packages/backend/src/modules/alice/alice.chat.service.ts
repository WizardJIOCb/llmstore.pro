import crypto from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  aliceSkillLinks,
  aliceUserSettings,
  chatConversations,
  users,
} from '../../db/schema/index.js';
import { AppError } from '../../middleware/error-handler.js';
import { getSignupBonusSettings } from '../../lib/app-settings.js';
import { markUserActive } from '../auth/login-activity.service.js';
import { grantSignupBonusIfEligible } from '../auth/signup-bonus.service.js';
import * as runtimeService from '../agent-runtime/runtime.service.js';

const DEFAULT_ALICE_CHAT_TITLE = 'Alice';
const DEFAULT_ALICE_USER_NAME = 'Alice user';
const ALICE_DEVICE_FINGERPRINT_PREFIX = 'alice-skill:';
const ALICE_SYSTEM_USER_AGENT = 'yandex-dialogs-alice';
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

function normalizeAliceIdentifier(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function buildSyntheticAliceEmail(skillUserId: string): string {
  const digest = crypto.createHash('sha256').update(skillUserId).digest('hex').slice(0, 24);
  return `alice-${digest}@alice.llmstore.local`;
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
    text: sanitizeAliceOutput(rawText, ALICE_TEXT_LIMIT),
    tts: sanitizeAliceOutput(rawText, ALICE_TTS_LIMIT),
    context,
  };
}
