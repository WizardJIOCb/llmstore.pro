import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { agents, agentVersions, agentVersionTools, toolDefinitions } from '../../db/schema/agents.js';
import { chatConversations, chatConversationMessages } from '../../db/schema/runtime.js';
import { AppError } from '../../middleware/error-handler.js';
import type { CodingReportProject } from './runtime.service.js';
import * as projectDeploymentsService from './project-deployments.service.js';

export type TelegramBotQuickstartPreset = 'dtf_news' | 'web_news' | 'product_tracker' | 'memory' | 'support';

export interface TelegramBotQuickstartInput {
  preset: TelegramBotQuickstartPreset;
  bot_name?: string;
  telegram_bot_token: string;
  prompt?: string | null;
  source_url?: string | null;
  timezone?: string | null;
}

interface PresetConfig {
  label: string;
  defaultName: string;
  description: string;
  toolSlugs: string[];
  requireTools?: boolean;
  buildSystemPrompt(input: TelegramBotQuickstartInput): string;
}

const DEFAULT_MODEL_EXTERNAL_ID = 'google/gemini-2.0-flash-001';
const BOTFATHER_URL = 'https://t.me/BotFather';

const PRESETS: Record<TelegramBotQuickstartPreset, PresetConfig> = {
  dtf_news: {
    label: 'DTF новости',
    defaultName: 'DTF Telegram Bot',
    description: 'Ищет игровые новости на DTF, показывает свежие статьи сверху и умеет пересказывать материалы.',
    toolSlugs: ['dtf-latest-feed', 'dtf-search-articles', 'dtf-article-fetch', 'dtf-popular-feed'],
    requireTools: true,
    buildSystemPrompt: (input) => withCommonTelegramRules(`Ты - новостной Telegram-бот по DTF.ru.

Задача:
- искать и анализировать статьи DTF по играм, темам, компаниям и ключевым словам;
- показывать последние актуальные материалы сверху;
- пересказывать статью, если пользователь дает ссылку или просит кратко объяснить материал.

Инструменты:
- dtf-search-articles: основной поиск по теме;
- dtf-latest-feed: свежая лента, если тема не указана;
- dtf-popular-feed: популярное/обсуждаемое за период;
- dtf-article-fetch: полный текст статьи по URL.

Правила поиска:
- если пользователь спрашивает "Есть новости по Doom?" или аналогично, не уточняй, что именно искать; считай Doom темой запроса;
- если период не указан, вызывай dtf-search-articles с period = "all" и limit = 10;
- если указано "за день", "сегодня" или "за сутки" - period = "day"; "за неделю" - "week"; "за месяц" - "month"; "за год" - "year"; "за все время" - "all";
- если прямой поиск дал мало релевантного, дополнительно проверь dtf-popular-feed и dtf-latest-feed, затем отфильтруй по теме;
- всегда сортируй найденные статьи по дате публикации: новые выше старых;
- не поднимай старые статьи выше новых только из-за комментариев, реакций или популярности.

Формат ответа:
- до 7 самых новых релевантных статей, если пользователь не попросил другое количество;
- каждая статья отдельным коротким блоком: заголовок, автор, дата, ссылка, комментарии/реакции;
- не перечисляй reaction_breakdown и длинные списки реакций;
- если ничего не найдено, честно скажи, что DTF не нашел материалов по теме, и не проси уточнять заголовок или игру.`, input),
  },
  web_news: {
    label: 'Новости по теме',
    defaultName: 'News Watch Telegram Bot',
    description: 'Ищет свежие новости по теме, сайту или рынку и возвращает короткую выжимку со ссылками.',
    toolSlugs: ['web-search-cascade', 'http-request'],
    buildSystemPrompt: (input) => withCommonTelegramRules(`Ты - Telegram-бот для поиска и краткого анализа новостей.

Задача:
- по запросу пользователя искать свежие новости, релизы, обновления и важные публикации;
- если пользователь указал сайт или источник, использовать его как приоритетный источник;
- если в сообщении есть ссылка, сначала прочитать ее через http-request;
- если фактов не хватает, использовать web-search-cascade.

Правила:
- не уточняй тему, если ее можно извлечь из сообщения;
- если период не указан, ищи актуальное и недавнее, но не выдумывай даты;
- показывай источники ссылками;
- отделяй факты от выводов;
- если данных мало, прямо скажи, что удалось найти, а что нет.${formatSourceLine(input)}`, input),
  },
  product_tracker: {
    label: 'Учет товаров',
    defaultName: 'Product Tracker Telegram Bot',
    description: 'Запоминает товары, остатки и заметки прямо из Telegram, помогает быстро сверять список.',
    toolSlugs: [],
    buildSystemPrompt: (input) => withCommonTelegramRules(`Ты - Telegram-бот для простого учета товаров, остатков, закупок и заметок.

Задача:
- помогать пользователю добавлять, проверять и обновлять товары;
- использовать контекст "Память бота" и "Учет товаров", который приходит в сообщении;
- превращать неструктурированные сообщения в понятные действия и краткие итоги;
- замечать низкий остаток, дубли, разные написания одного товара.

Правила:
- если пользователь пишет товар и количество, помоги привести это к формату для учета;
- если данных не хватает, задай один короткий уточняющий вопрос;
- отвечай компактно, как рабочий помощник в Telegram.`, input),
  },
  memory: {
    label: 'Бот с памятью',
    defaultName: 'Memory Telegram Bot',
    description: 'Запоминает важные факты, предпочтения и договоренности, потом использует их в ответах.',
    toolSlugs: [],
    buildSystemPrompt: (input) => withCommonTelegramRules(`Ты - персональный Telegram-бот с памятью.

Задача:
- использовать контекст "Память бота", который приходит в сообщении;
- помогать пользователю помнить договоренности, идеи, списки, предпочтения и заметки;
- в ответах учитывать уже сохраненные факты;
- предлагать короткие, практичные следующие шаги, когда это уместно.

Правила:
- не говори, что у тебя нет памяти, если в контексте есть сохраненные записи;
- если пользователь просит "запомни", подтверди, что именно стоит сохранить;
- если пользователь спрашивает "что ты помнишь", аккуратно перечисли релевантные записи.`, input),
  },
  support: {
    label: 'FAQ и поддержка',
    defaultName: 'Support Telegram Bot',
    description: 'Отвечает клиентам по заданной инструкции, FAQ, ссылке на сайт или описанию продукта.',
    toolSlugs: ['web-search-cascade', 'http-request'],
    buildSystemPrompt: (input) => withCommonTelegramRules(`Ты - Telegram-бот поддержки.

Задача:
- отвечать клиентам понятно и дружелюбно;
- использовать инструкцию владельца, FAQ, ссылку на сайт или описание продукта;
- если есть ссылка, читать ее через http-request;
- если вопрос требует актуальной информации и инструменты доступны, использовать web-search-cascade.

Правила:
- сначала дай прямой ответ, потом детали;
- если вопрос про оплату, сроки, возврат или персональные данные и информации нет, не выдумывай;
- если нужен человек, кратко объясни, какие данные собрать для передачи оператору.${formatSourceLine(input)}`, input),
  },
};

function withCommonTelegramRules(basePrompt: string, input: TelegramBotQuickstartInput): string {
  const customPrompt = normalizeOptionalText(input.prompt, 6000);
  const timezone = normalizeOptionalText(input.timezone, 80) || 'Asia/Yekaterinburg';
  return [
    basePrompt.trim(),
    `Общие правила Telegram:
- всегда отвечай на русском, если пользователь явно не попросил другой язык;
- отвечай обычным текстом без HTML и без таблиц;
- делай сообщение коротким и читабельным на телефоне;
- длинные URL показывай только когда ссылка действительно нужна;
- если ответ большой, сначала дай главное, затем список;
- текущий часовой пояс пользователя: ${timezone}.`,
    customPrompt ? `Дополнительная инструкция владельца бота:\n${customPrompt}` : null,
  ].filter(Boolean).join('\n\n');
}

function formatSourceLine(input: TelegramBotQuickstartInput): string {
  const sourceUrl = normalizeOptionalText(input.source_url, 1000);
  return sourceUrl ? `\n- приоритетный источник владельца: ${sourceUrl}.` : '';
}

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function normalizeBotName(input: TelegramBotQuickstartInput): string {
  const preset = PRESETS[input.preset];
  return (normalizeOptionalText(input.bot_name, 120) || preset.defaultName).slice(0, 120);
}

function normalizeTelegramBotToken(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError(400, 'TELEGRAM_BOT_TOKEN_INVALID', 'Telegram bot token обязателен');
  }

  const token = value.trim();
  if (!/^\d{5,20}:[A-Za-z0-9_-]{20,}$/.test(token) || token.length > 200) {
    throw new AppError(400, 'TELEGRAM_BOT_TOKEN_INVALID', 'Проверьте токен от BotFather: формат должен быть похож на 123456:ABC...');
  }

  return token;
}

function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[^\w\s-]+/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'telegram-bot';
}

async function resolveToolIds(slugs: string[], requireAll: boolean): Promise<string[]> {
  if (!slugs.length) return [];

  const rows = await db
    .select({ id: toolDefinitions.id, slug: toolDefinitions.slug })
    .from(toolDefinitions)
    .where(and(
      inArray(toolDefinitions.slug, slugs),
      eq(toolDefinitions.is_active, true),
    ));

  const bySlug = new Map(rows.map((row) => [row.slug, row.id]));
  const toolIds = slugs.map((slug) => bySlug.get(slug)).filter((id): id is string => Boolean(id));

  if (requireAll && toolIds.length !== slugs.length) {
    throw new AppError(500, 'QUICKSTART_TOOLS_MISSING', 'Не найдены нужные встроенные инструменты для этого маршрута');
  }

  return toolIds;
}

function buildRuntimeConfig(input: TelegramBotQuickstartInput): Record<string, unknown> {
  const preset = PRESETS[input.preset];
  return {
    max_iterations: input.preset === 'dtf_news' ? 6 : 5,
    temperature: input.preset === 'product_tracker' || input.preset === 'support' ? 0.2 : 0.3,
    max_tokens: 4096,
    model_external_id: DEFAULT_MODEL_EXTERNAL_ID,
    chat_intro: preset.description,
    starter_prompts: getPresetStarterPrompts(input.preset),
  };
}

function getPresetStarterPrompts(preset: TelegramBotQuickstartPreset): string[] {
  if (preset === 'dtf_news') {
    return ['Есть новости по Doom?', 'Последние новости по Nintendo за неделю', 'Перескажи эту статью DTF:'];
  }
  if (preset === 'web_news') {
    return ['Что нового по OpenAI за неделю?', 'Найди последние новости по рынку электромобилей', 'Собери дайджест по этому сайту'];
  }
  if (preset === 'product_tracker') {
    return ['Добавь товар: кофе, 12 пачек, полка A2', 'Что осталось на складе?', 'Какие товары нужно докупить?'];
  }
  if (preset === 'memory') {
    return ['Запомни: я предпочитаю короткие ответы', 'Что ты обо мне помнишь?', 'Напомни мои текущие идеи'];
  }
  return ['Как оформить заказ?', 'Какие условия возврата?', 'Передай оператору:'];
}

async function createQuickstartAgent(
  userId: string,
  input: TelegramBotQuickstartInput,
  toolIds: string[],
): Promise<{ id: string; name: string; description: string | null }> {
  const preset = PRESETS[input.preset];
  const botName = normalizeBotName(input);
  const slug = `${slugify(botName)}-${randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const description = preset.description;

  const [agent] = await db.insert(agents).values({
    owner_user_id: userId,
    name: botName,
    slug,
    description,
    visibility: 'private',
    status: 'active',
  }).returning();

  const [version] = await db.insert(agentVersions).values({
    agent_id: agent.id,
    version_number: 1,
    runtime_engine: 'openrouter_chat',
    system_prompt: preset.buildSystemPrompt(input),
    response_mode: 'text',
    runtime_config: buildRuntimeConfig(input),
  }).returning();

  if (toolIds.length > 0) {
    await db.insert(agentVersionTools).values(
      toolIds.map((toolId, index) => ({
        agent_version_id: version.id,
        tool_definition_id: toolId,
        is_required: false,
        order_index: index,
      })),
    );
  }

  await db.update(agents)
    .set({ current_version_id: version.id, updated_at: new Date() })
    .where(eq(agents.id, agent.id));

  return { id: agent.id, name: agent.name, description: agent.description };
}

async function createQuickstartChat(
  userId: string,
  agentId: string,
  botName: string,
  preset: PresetConfig,
): Promise<{ id: string; title: string }> {
  const [chat] = await db.insert(chatConversations).values({
    user_id: userId,
    agent_id: agentId,
    mode: 'agent',
    title: `Telegram Bot: ${botName}`.slice(0, 500),
    access: 'private',
    share_token: randomUUID().replace(/-/g, '').slice(0, 16),
    settings_json: {
      note: preset.description,
      quickstart: 'telegram_bot',
    },
    last_message_at: new Date(),
  }).returning();

  return { id: chat.id, title: chat.title };
}

async function insertQuickstartMessages(
  chatId: string,
  botName: string,
  input: TelegramBotQuickstartInput,
): Promise<{ messageId: string }> {
  await db.insert(chatConversationMessages).values({
    conversation_id: chatId,
    role: 'user',
    content_text: `Быстрый маршрут: создать и запустить Telegram-бота "${botName}" через BotFather token.`,
  });

  const report = buildCodingReport(botName, input);
  const assistantText = buildAssistantMessageText(botName, input, report);
  const [message] = await db.insert(chatConversationMessages).values({
    conversation_id: chatId,
    role: 'assistant',
    content_text: assistantText,
    usage_json: {
      coding_report: report,
    },
  }).returning();

  return { messageId: message.id };
}

function buildAssistantMessageText(
  botName: string,
  input: TelegramBotQuickstartInput,
  report: Record<string, unknown>,
): string {
  const preset = PRESETS[input.preset];
  const visible = [
    `Готов Project Bundle для Telegram-бота "${botName}".`,
    '',
    'Что уже подготовлено:',
    '- HTTP webhook: POST /webhook',
    '- health check: GET /api/health',
    '- связка с агентом LLMStore через LLMSTORE_AGENT_RUN_URL',
    '- автоматическая установка webhook в Telegram после запуска deployment',
    '',
    `Сценарий: ${preset.label}. ${preset.description}`,
    '',
    `BotFather: ${BOTFATHER_URL}`,
  ].join('\n');

  return `<dev-report>\n${JSON.stringify(report, null, 2)}\n</dev-report>\n\n${visible}`;
}

function buildCodingReport(botName: string, input: TelegramBotQuickstartInput): Record<string, unknown> {
  const preset = PRESETS[input.preset];
  const project = buildTelegramBotProject(botName, input);

  return {
    summary: `Project Bundle для Telegram-бота "${botName}" создан.`,
    worklog: [
      'Создан приватный агент с выбранным сценарием.',
      'Собран Python webhook server для Telegram.',
      'Deployment можно запускать, останавливать и обновлять через Project Bundle.',
    ],
    how_to_run: [
      'Откройте BotFather и создайте бота командой /newbot.',
      'Вставьте TELEGRAM_BOT_TOKEN в быстрый маршрут.',
      'LLMStore запустит Project Bundle и установит webhook автоматически.',
    ],
    notes: [
      `Сценарий: ${preset.label}.`,
      'Токен Telegram хранится в env deployment и не вставляется в код.',
      'Telegram webhook ставится на публичный callback Project Bundle.',
    ],
    project,
  };
}

function buildTelegramBotProject(botName: string, input: TelegramBotQuickstartInput): CodingReportProject {
  return {
    title: `${botName} Telegram webhook`,
    runtime: 'python',
    root_dir: '.',
    entrypoint: 'main.py',
    install: [],
    run: ['python3 main.py'],
    files: [
      {
        path: 'main.py',
        language: 'python',
        entrypoint: true,
        summary: 'Telegram webhook server with LLMStore linked-agent bridge and local memory.',
        content: buildTelegramBotPythonSource(input),
      },
    ],
    notes: [
      'Requires TELEGRAM_BOT_TOKEN, LLMSTORE_AGENT_RUN_URL and LLMSTORE_DEPLOYMENT_SECRET env values.',
      'GET /api/health returns readiness for Project Bundle deployment.',
      'POST /webhook receives Telegram updates and answers through the linked LLMStore agent.',
    ],
  };
}

function buildTelegramBotPythonSource(input: TelegramBotQuickstartInput): string {
  const presetLabel = PRESETS[input.preset].label;
  return `import json
import logging
import os
import re
import sqlite3
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import error, request


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8080"))
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_SECRET_TOKEN = os.environ.get("TELEGRAM_SECRET_TOKEN", "").strip()
TELEGRAM_DELIVERY_MODE = os.environ.get("TELEGRAM_DELIVERY_MODE", "webhook").strip().lower()
TELEGRAM_POLLING_TIMEOUT = int(os.environ.get("TELEGRAM_POLLING_TIMEOUT", "25"))
LLMSTORE_AGENT_RUN_URL = os.environ.get("LLMSTORE_AGENT_RUN_URL", "").strip()
LLMSTORE_DEPLOYMENT_SECRET = os.environ.get("LLMSTORE_DEPLOYMENT_SECRET", "").strip()
BOT_PRESET = ${JSON.stringify(presetLabel)}
POLLING_DELIVERY_MODES = {"polling", "poll", "getupdates"}

DATA_DIR = Path(os.environ.get("DATA_DIR") or (Path.cwd().parent / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "telegram_bot.sqlite3"
DB_LOCK = threading.Lock()


def require_env():
    missing = [
        name
        for name, value in {
            "TELEGRAM_BOT_TOKEN": TELEGRAM_BOT_TOKEN,
            "LLMSTORE_AGENT_RUN_URL": LLMSTORE_AGENT_RUN_URL,
            "LLMSTORE_DEPLOYMENT_SECRET": LLMSTORE_DEPLOYMENT_SECRET,
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError("Missing required environment variables: " + ", ".join(missing))


def connect_db():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with DB_LOCK:
        with connect_db() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS processed_updates (
                    update_id INTEGER PRIMARY KEY,
                    created_at INTEGER NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS memories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    chat_id TEXT NOT NULL,
                    text TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    chat_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    qty TEXT NOT NULL,
                    note TEXT NOT NULL DEFAULT '',
                    updated_at INTEGER NOT NULL
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS memories_chat_idx ON memories(chat_id, created_at)")
            conn.execute("CREATE INDEX IF NOT EXISTS items_chat_idx ON items(chat_id, updated_at)")


def try_mark_update(update_id):
    if update_id is None:
        return True
    with DB_LOCK:
        with connect_db() as conn:
            cur = conn.execute(
                "INSERT OR IGNORE INTO processed_updates(update_id, created_at) VALUES(?, ?)",
                (int(update_id), int(time.time())),
            )
            return cur.rowcount > 0


def add_memory(chat_id, text):
    text = (text or "").strip()
    if not text:
        return
    with DB_LOCK:
        with connect_db() as conn:
            conn.execute(
                "INSERT INTO memories(chat_id, text, created_at) VALUES(?, ?, ?)",
                (str(chat_id), text[:2000], int(time.time())),
            )


def list_memories(chat_id, limit=12):
    with DB_LOCK:
        with connect_db() as conn:
            rows = conn.execute(
                "SELECT text, created_at FROM memories WHERE chat_id = ? ORDER BY id DESC LIMIT ?",
                (str(chat_id), int(limit)),
            ).fetchall()
    return [row["text"] for row in rows]


def clear_memories(chat_id):
    with DB_LOCK:
        with connect_db() as conn:
            conn.execute("DELETE FROM memories WHERE chat_id = ?", (str(chat_id),))


def add_item(chat_id, raw):
    parts = [part.strip() for part in (raw or "").split("|")]
    name = parts[0] if len(parts) >= 1 else ""
    qty = parts[1] if len(parts) >= 2 else ""
    note = parts[2] if len(parts) >= 3 else ""
    if not name or not qty:
        return None
    with DB_LOCK:
        with connect_db() as conn:
            conn.execute(
                "INSERT INTO items(chat_id, name, qty, note, updated_at) VALUES(?, ?, ?, ?, ?)",
                (str(chat_id), name[:300], qty[:120], note[:1000], int(time.time())),
            )
    return {"name": name, "qty": qty, "note": note}


def parse_quantity_number(value):
    normalized = (value or "").strip().replace(",", ".")
    if not re.match(r"^[+-]?\\d+(?:\\.\\d+)?$", normalized):
        return None
    number = float(normalized)
    return int(number) if number.is_integer() else number


def format_quantity_number(value):
    number = float(value)
    if number.is_integer():
        return str(int(number))
    return f"{number:.6f}".rstrip("0").rstrip(".")


def split_item_name_note(value):
    text = " ".join((value or "").strip().split())
    lower = text.lower()
    for marker in (" на ", " в "):
        index = lower.rfind(marker)
        if index <= 0:
            continue
        name = text[:index].strip()
        note = text[index + len(marker):].strip()
        if name and note and note.lower().startswith(("склад", "полк", "витрин", "магазин")):
            return name, note
    return text, ""


def strip_leading_item_words(value):
    text = " ".join((value or "").strip().split())
    lower = text.lower()
    prefixes = (
        "товар ",
        "товара ",
        "товаров ",
        "позицию ",
        "позиции ",
        "позиций ",
        "штуку ",
        "штуки ",
        "штук ",
        "шт ",
        "единицу ",
        "единицы ",
        "единиц ",
    )
    changed = True
    while changed:
        changed = False
        lower = text.lower()
        for prefix in prefixes:
            if lower.startswith(prefix):
                text = text[len(prefix):].strip()
                changed = True
                break
    return text


def parse_add_item_delta(text):
    stripped = (text or "").strip()
    lower = stripped.lower()
    prefixes = [
        "/add_item",
        "/additem",
        "/inc_item",
        "добавь товар",
        "добавить товар",
        "добавь позицию",
        "добавить позицию",
        "добавь",
        "добавить",
        "прибавь",
        "прибавить",
        "пополни",
        "пополнить",
        "положи",
        "add item",
    ]
    rest = ""
    for prefix in prefixes:
        if lower.startswith(prefix):
            rest = stripped[len(prefix):].strip(" :—-")
            break
    if not rest:
        return None

    if "|" in rest:
        parts = [part.strip() for part in rest.split("|")]
        if len(parts) >= 2:
            quantity = parse_quantity_number(parts[1])
            if quantity is not None and parts[0]:
                return {"name": strip_leading_item_words(parts[0]), "delta": quantity, "note": parts[2] if len(parts) >= 3 else ""}

    match = re.match(r"^([+-]?\\d+(?:[,.]\\d+)?)\\s+(.+)$", rest)
    if not match:
        return None
    quantity = parse_quantity_number(match.group(1))
    name_text = strip_leading_item_words(match.group(2))
    name, note = split_item_name_note(name_text)
    if quantity is None or not name:
        return None
    return {"name": name, "delta": quantity, "note": note}


def add_item_delta(chat_id, parsed):
    name = (parsed.get("name") or "").strip()
    note = (parsed.get("note") or "").strip()
    delta = parsed.get("delta")
    if not name or delta is None:
        return None

    normalized_name = normalize_item_match_text(name)
    normalized_note = normalize_item_match_text(note)
    now = int(time.time())
    with DB_LOCK:
        with connect_db() as conn:
            rows = conn.execute(
                "SELECT id, name, qty, note FROM items WHERE chat_id = ? ORDER BY id DESC",
                (str(chat_id),),
            ).fetchall()
            candidates = [
                dict(row) for row in rows
                if normalize_item_match_text(row["name"]) == normalized_name
                and normalize_item_match_text(row["note"] or "") == normalized_note
            ]
            if not candidates and not note:
                candidates = [
                    dict(row) for row in rows
                    if normalize_item_match_text(row["name"]) == normalized_name
                ]

            if len(candidates) == 1:
                existing = candidates[0]
                current_qty = parse_quantity_number(existing["qty"])
                if current_qty is not None:
                    next_qty = format_quantity_number(current_qty + delta)
                    conn.execute(
                        "UPDATE items SET qty = ?, updated_at = ? WHERE id = ? AND chat_id = ?",
                        (next_qty, now, existing["id"], str(chat_id)),
                    )
                    return {
                        "item": {"id": existing["id"], "name": existing["name"], "qty": next_qty, "note": existing.get("note") or ""},
                        "created": False,
                        "delta": format_quantity_number(delta),
                    }

            qty = format_quantity_number(delta)
            cursor = conn.execute(
                "INSERT INTO items(chat_id, name, qty, note, updated_at) VALUES(?, ?, ?, ?, ?)",
                (str(chat_id), name[:300], qty[:120], note[:1000], now),
            )
            return {
                "item": {"id": cursor.lastrowid, "name": name, "qty": qty, "note": note},
                "created": True,
                "delta": qty,
            }


def parse_subtract_item_delta(text):
    stripped = (text or "").strip()
    lower = stripped.lower()
    prefixes = [
        "/dec_item",
        "/subtract_item",
        "/writeoff_item",
        "удали",
        "удалить",
        "убери",
        "убрать",
        "спиши",
        "списать",
        "вычти",
        "вычесть",
        "минус",
        "remove",
        "subtract",
    ]
    rest = ""
    for prefix in prefixes:
        if lower.startswith(prefix):
            rest = stripped[len(prefix):].strip(" :—-")
            break
    if not rest:
        return None

    match = re.match(r"^([+-]?\\d+(?:[,.]\\d+)?)\\s+(.+)$", rest)
    if not match:
        return None
    quantity = parse_quantity_number(match.group(1))
    name_text = strip_leading_item_words(match.group(2))
    name, note = split_item_name_note(name_text)
    if quantity is None or quantity <= 0 or not name:
        return None
    return {"name": name, "delta": quantity, "note": note}


def subtract_item_delta(chat_id, parsed):
    name = (parsed.get("name") or "").strip()
    note = (parsed.get("note") or "").strip()
    delta = parsed.get("delta")
    if not name or delta is None:
        return {"item": None, "ambiguous": [], "error": "empty"}

    normalized_name = normalize_item_match_text(name)
    normalized_note = normalize_item_match_text(note)
    with DB_LOCK:
        with connect_db() as conn:
            rows = conn.execute(
                "SELECT id, name, qty, note FROM items WHERE chat_id = ? ORDER BY id DESC",
                (str(chat_id),),
            ).fetchall()
            candidates = [
                dict(row) for row in rows
                if normalize_item_match_text(row["name"]) == normalized_name
                and (not note or normalize_item_match_text(row["note"] or "") == normalized_note)
            ]

            if len(candidates) != 1:
                return {"item": None, "ambiguous": candidates[:10], "error": "ambiguous" if candidates else "not_found"}

            existing = candidates[0]
            current_qty = parse_quantity_number(existing["qty"])
            if current_qty is None:
                return {"item": None, "ambiguous": [existing], "error": "non_numeric"}

            next_raw_qty = current_qty - delta
            next_qty_number = 0 if next_raw_qty < 0 else next_raw_qty
            next_qty = format_quantity_number(next_qty_number)
            conn.execute(
                "UPDATE items SET qty = ?, updated_at = ? WHERE id = ? AND chat_id = ?",
                (next_qty, int(time.time()), existing["id"], str(chat_id)),
            )
            return {
                "item": {"id": existing["id"], "name": existing["name"], "qty": next_qty, "note": existing.get("note") or ""},
                "delta": format_quantity_number(delta),
                "previous_qty": format_quantity_number(current_qty),
                "clamped": next_raw_qty < 0,
                "unchanged_zero": current_qty == 0,
                "ambiguous": [],
                "error": None,
            }


def list_items(chat_id, limit=30):
    with DB_LOCK:
        with connect_db() as conn:
            rows = conn.execute(
                "SELECT id, name, qty, note FROM items WHERE chat_id = ? ORDER BY id DESC LIMIT ?",
                (str(chat_id), int(limit)),
            ).fetchall()
    return [dict(row) for row in rows]


def item_display(item):
    return f"{item['name']}: {item['qty']}" + (f" ({item['note']})" if item.get("note") else "")


def normalize_item_match_text(value):
    text = " ".join((value or "").strip().split()).lower()
    for prefix in ("- ", "• "):
        if text.startswith(prefix):
            text = text[len(prefix):].strip()
    return text


def parse_delete_item_query(text):
    stripped = (text or "").strip()
    lower = stripped.lower()
    prefixes = [
        "/delete_item",
        "/delitem",
        "/remove_item",
        "удали товар",
        "удалить товар",
        "убери товар",
        "удали позицию",
        "удалить позицию",
        "remove item",
        "delete item",
    ]
    for prefix in prefixes:
        if lower.startswith(prefix):
            return stripped[len(prefix):].strip(" :—-")
    return ""


def delete_item(chat_id, raw_query):
    query = (raw_query or "").strip()
    if not query:
        return {"deleted": None, "remaining": list_items(chat_id), "ambiguous": []}

    items = list_items(chat_id, limit=200)
    normalized_query = normalize_item_match_text(query)
    exact = [
        item for item in items
        if normalize_item_match_text(item_display(item)) == normalized_query
        or normalize_item_match_text(f"{item['name']} | {item['qty']} | {item.get('note') or ''}") == normalized_query
    ]

    candidates = exact
    if not candidates:
        candidates = [
            item for item in items
            if normalize_item_match_text(item["name"]) == normalized_query
        ]

    if not candidates:
        candidates = [
            item for item in items
            if normalized_query in normalize_item_match_text(item_display(item))
        ]

    if len(candidates) != 1:
        return {"deleted": None, "remaining": items, "ambiguous": candidates[:10]}

    deleted = candidates[0]
    with DB_LOCK:
        with connect_db() as conn:
            conn.execute(
                "DELETE FROM items WHERE id = ? AND chat_id = ?",
                (deleted["id"], str(chat_id)),
            )
    return {"deleted": deleted, "remaining": list_items(chat_id), "ambiguous": []}


def format_items(items):
    if not items:
        return "Список товаров пока пустой."
    return "Товары:\\n" + "\\n".join(f"- {item_display(item)}" for item in items)


def send_telegram_api(method, payload, timeout=30):
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/{method}"
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return json.loads(raw) if raw else {}
    except error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Telegram HTTP {exc.code}: {details}") from exc


def is_polling_delivery_mode():
    return TELEGRAM_DELIVERY_MODE in POLLING_DELIVERY_MODES


def delete_telegram_webhook_for_polling():
    try:
        send_telegram_api("deleteWebhook", {"drop_pending_updates": False}, timeout=15)
        logging.info("Telegram webhook deleted; polling delivery is active")
    except Exception:
        logging.exception("Failed to delete Telegram webhook before polling")


def get_telegram_updates(offset):
    payload = {
        "timeout": TELEGRAM_POLLING_TIMEOUT,
        "allowed_updates": ["message"],
    }
    if offset is not None:
        payload["offset"] = offset
    data = send_telegram_api("getUpdates", payload, timeout=TELEGRAM_POLLING_TIMEOUT + 10)
    updates = data.get("result") if isinstance(data, dict) else None
    return updates if isinstance(updates, list) else []


def send_chat_action(chat_id, action="typing"):
    try:
        send_telegram_api("sendChatAction", {"chat_id": chat_id, "action": action}, timeout=10)
    except Exception:
        logging.debug("Failed to send Telegram chat action", exc_info=True)


def chunk_text(text, limit=3800):
    text = (text or "").strip() or "Готово."
    chunks = []
    while len(text) > limit:
        split_at = text.rfind("\\n", 0, limit)
        if split_at < 1200:
            split_at = text.rfind(" ", 0, limit)
        if split_at < 1200:
            split_at = limit
        chunks.append(text[:split_at].strip())
        text = text[split_at:].strip()
    if text:
        chunks.append(text)
    return chunks


def preview_log_text(text, limit=180):
    preview = " ".join((text or "").split())
    if len(preview) > limit:
        return preview[: max(0, limit - 3)] + "..."
    return preview


def send_telegram_message(chat_id, text):
    chunks = chunk_text(text)
    for chunk in chunks:
        send_telegram_api(
            "sendMessage",
            {
                "chat_id": chat_id,
                "text": chunk,
                "disable_web_page_preview": True,
            },
        )
    logging.info("Telegram reply sent: chat_id=%s chunks=%s chars=%s", chat_id, len(chunks), len(text or ""))


def call_llmstore_agent(message):
    data = json.dumps({"message": message}, ensure_ascii=False).encode("utf-8")
    req = request.Request(
        LLMSTORE_AGENT_RUN_URL,
        data=data,
        headers={
            "Content-Type": "application/json",
            "X-LLMStore-Deployment-Secret": LLMSTORE_DEPLOYMENT_SECRET,
        },
    )
    with request.urlopen(req, timeout=120) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    payload = json.loads(raw)
    result = payload.get("data", payload)
    text = result.get("text") if isinstance(result, dict) else None
    return text or "Я получил ответ агента, но он оказался пустым."


def build_agent_message(chat_id, text, message):
    memories = list_memories(chat_id)
    items = list_items(chat_id)
    user = message.get("from") or {}
    user_name = " ".join(
        part for part in [user.get("first_name"), user.get("last_name")] if isinstance(part, str) and part.strip()
    ).strip()

    context = [
        f"Сценарий бота: {BOT_PRESET}",
        f"Telegram chat_id: {chat_id}",
    ]
    if user_name:
        context.append(f"Имя пользователя в Telegram: {user_name}")
    if memories:
        context.append("Память бота:\\n" + "\\n".join(f"- {item}" for item in memories[:12]))
    if items:
        context.append(
            "Учет товаров:\\n"
            + "\\n".join(
                f"- {item['name']}: {item['qty']}" + (f" ({item['note']})" if item.get("note") else "")
                for item in items[:20]
            )
        )

    context.append("Сообщение пользователя:\\n" + text)
    context.append("Ответь обычным текстом для Telegram, без HTML, без таблиц и без служебного JSON.")
    return "\\n\\n".join(context)


def command_name(text):
    head = (text or "").strip().split(maxsplit=1)[0].lower()
    return head.split("@", 1)[0]


def command_args(text):
    parts = (text or "").strip().split(maxsplit=1)
    return parts[1].strip() if len(parts) > 1 else ""


def handle_command(chat_id, text):
    stripped = (text or "").strip()
    lower = stripped.lower()
    cmd = command_name(stripped)

    if cmd in {"/start", "/help"}:
        send_telegram_message(
            chat_id,
            "Бот запущен. Просто напишите запрос.\\n\\n"
            "Команды:\\n"
            "/remember текст - сохранить заметку\\n"
            "/memory - показать память\\n"
            "/clear_memory - очистить память\\n"
            "/item название | количество | заметка - добавить товар\\n"
            "/add_item количество название на склад - прибавить к остатку\\n"
            "/dec_item количество название - списать количество без удаления позиции\\n"
            "/delete_item название: количество (заметка) - удалить товар\\n"
            "/items - показать товары",
        )
        return True

    if cmd == "/remember" or lower.startswith("запомни "):
        value = command_args(stripped) if cmd == "/remember" else stripped[8:].strip()
        if not value:
            send_telegram_message(chat_id, "Напишите, что запомнить: /remember текст")
            return True
        add_memory(chat_id, value)
        send_telegram_message(chat_id, "Запомнил.")
        return True

    if cmd == "/memory":
        memories = list_memories(chat_id, limit=20)
        if not memories:
            send_telegram_message(chat_id, "Память пока пустая.")
            return True
        send_telegram_message(chat_id, "Вот что я помню:\\n" + "\\n".join(f"- {item}" for item in memories))
        return True

    if cmd == "/clear_memory":
        clear_memories(chat_id)
        send_telegram_message(chat_id, "Память очищена.")
        return True

    if cmd == "/item" or lower.startswith("товар "):
        raw = command_args(stripped) if cmd == "/item" else stripped[6:].strip()
        item = add_item(chat_id, raw)
        if not item:
            send_telegram_message(chat_id, "Формат: /item название | количество | заметка")
            return True
        note = f" ({item['note']})" if item.get("note") else ""
        send_telegram_message(chat_id, f"Добавил товар: {item['name']} - {item['qty']}{note}")
        return True

    add_delta = parse_add_item_delta(stripped)
    if add_delta or cmd in {"/add_item", "/additem", "/inc_item"}:
        if not add_delta:
            send_telegram_message(chat_id, "Формат: /add_item количество название на склад. Например: Добавь 1 RTX 4070 на склад мск")
            return True
        result = add_item_delta(chat_id, add_delta)
        if not result:
            send_telegram_message(chat_id, "Не понял, какой товар и количество добавить. Например: Добавь 1 RTX 4070 на склад мск")
            return True
        action = "Создал позицию" if result["created"] else f"Добавил {result['delta']} к остатку"
        send_telegram_message(
            chat_id,
            f"{action}: {item_display(result['item'])}\\n\\n" + format_items(list_items(chat_id)),
        )
        return True

    subtract_delta = parse_subtract_item_delta(stripped)
    if subtract_delta or cmd in {"/dec_item", "/subtract_item", "/writeoff_item"}:
        if not subtract_delta:
            send_telegram_message(chat_id, "Формат: /dec_item количество название. Например: Удали 1 товар RTX 4070")
            return True
        result = subtract_item_delta(chat_id, subtract_delta)
        if result["item"]:
            if result["unchanged_zero"]:
                action = "Остаток уже 0, товар оставил в списке"
            elif result["clamped"]:
                action = f"Списал до 0, товар оставил в списке"
            else:
                action = f"Списал {result['delta']} с остатка"
            send_telegram_message(
                chat_id,
                f"{action}: {item_display(result['item'])}\\n\\n" + format_items(list_items(chat_id)),
            )
            return True
        if result["ambiguous"]:
            send_telegram_message(
                chat_id,
                "Нашёл несколько похожих товаров или нечисловой остаток. Укажите точнее, например склад из /items:\\n"
                + "\\n".join(f"- {item_display(item)}" for item in result["ambiguous"]),
            )
            return True
        send_telegram_message(chat_id, "Не нашёл такой товар. Проверьте название через /items и повторите списание.")
        return True

    delete_query = parse_delete_item_query(stripped)
    if delete_query or cmd in {"/delete_item", "/delitem", "/remove_item"}:
        if not delete_query:
            send_telegram_message(chat_id, "Напишите, какой товар удалить: /delete_item название: количество (заметка)")
            return True
        result = delete_item(chat_id, delete_query)
        if result["deleted"]:
            remaining = result["remaining"]
            if remaining:
                send_telegram_message(
                    chat_id,
                    f"Удалил товар: {item_display(result['deleted'])}\\n\\nОсталось:\\n"
                    + "\\n".join(f"- {item_display(item)}" for item in remaining),
                )
            else:
                send_telegram_message(chat_id, f"Удалил товар: {item_display(result['deleted'])}\\n\\nСписок товаров теперь пустой.")
            return True
        if result["ambiguous"]:
            send_telegram_message(
                chat_id,
                "Нашёл несколько похожих товаров. Укажите точнее, например целую строку из /items:\\n"
                + "\\n".join(f"- {item_display(item)}" for item in result["ambiguous"]),
            )
            return True
        send_telegram_message(chat_id, "Не нашёл такой товар. Проверьте название через /items и повторите удаление.")
        return True

    if cmd == "/items":
        items = list_items(chat_id)
        send_telegram_message(chat_id, format_items(items))
        return True

    return False


def process_update(update):
    update_id = update.get("update_id") if isinstance(update, dict) else None
    message = update.get("message") or update.get("edited_message") or {}
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    message_id = message.get("message_id")
    text = message.get("text") or message.get("caption") or ""

    if chat_id is None:
        logging.info("Telegram update has no chat id: update_id=%s", update_id)
        return
    logging.info(
        "Telegram update received: update_id=%s chat_id=%s message_id=%s text=%s",
        update_id,
        chat_id,
        message_id,
        preview_log_text(text),
    )
    if not text.strip():
        logging.info("Telegram update has no text: update_id=%s chat_id=%s", update_id, chat_id)
        send_telegram_message(chat_id, "Пришлите текстовое сообщение.")
        return

    try:
        if handle_command(chat_id, text):
            logging.info(
                "Telegram local command handled: update_id=%s chat_id=%s command=%s",
                update_id,
                chat_id,
                command_name(text),
            )
            return
        send_chat_action(chat_id)
        agent_message = build_agent_message(chat_id, text, message)
        logging.info("Calling linked LLMStore agent: update_id=%s chat_id=%s", update_id, chat_id)
        reply = call_llmstore_agent(agent_message)
        logging.info("Linked LLMStore agent replied: update_id=%s chat_id=%s chars=%s", update_id, chat_id, len(reply or ""))
        send_telegram_message(chat_id, reply)
    except Exception:
        logging.exception("Failed to process Telegram update")
        try:
            send_telegram_message(chat_id, "Не смог обработать сообщение. Проверьте запуск бота и настройки агента в LLMStore.")
        except Exception:
            logging.exception("Failed to send Telegram error message")


def polling_loop():
    offset = None
    delete_telegram_webhook_for_polling()
    logging.info("Telegram polling loop started")
    while True:
        try:
            updates = get_telegram_updates(offset)
            if updates:
                logging.info("Telegram polling received updates: count=%s", len(updates))
            for update in updates:
                update_id = update.get("update_id") if isinstance(update, dict) else None
                if isinstance(update_id, int):
                    offset = update_id + 1
                if not try_mark_update(update_id):
                    continue
                process_update(update)
        except Exception:
            logging.exception("Telegram polling loop failed")
            time.sleep(3)


class Handler(BaseHTTPRequestHandler):
    server_version = "LLMStoreTelegramQuickstart/1.0"

    def log_message(self, fmt, *args):
        logging.info("%s - %s", self.address_string(), fmt % args)

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in {"/", "/health", "/api/health", "/webhook"}:
            self.send_json(200, {"ok": True, "preset": BOT_PRESET})
            return
        self.send_json(404, {"ok": False, "error": "not_found"})

    def do_POST(self):
        if not (self.path == "/webhook" or self.path.startswith("/webhook?")):
            self.send_json(404, {"ok": False, "error": "not_found"})
            return
        if TELEGRAM_SECRET_TOKEN:
            actual = self.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
            if actual != TELEGRAM_SECRET_TOKEN:
                self.send_json(403, {"ok": False, "error": "bad_secret"})
                return
        length = int(self.headers.get("Content-Length") or "0")
        if length > 2_000_000:
            self.send_json(413, {"ok": False, "error": "payload_too_large"})
            return
        try:
            raw = self.rfile.read(length).decode("utf-8")
            update = json.loads(raw or "{}")
        except Exception:
            self.send_json(400, {"ok": False, "error": "bad_json"})
            return

        update_id = update.get("update_id")
        if not try_mark_update(update_id):
            logging.info("Telegram duplicate update skipped: update_id=%s", update_id)
            self.send_json(200, {"ok": True, "duplicate": True})
            return

        logging.info("Telegram webhook update accepted: update_id=%s", update_id)
        threading.Thread(target=process_update, args=(update,), daemon=True).start()
        self.send_json(200, {"ok": True})


def main():
    require_env()
    init_db()
    logging.info("Starting Telegram quickstart bot on %s:%s", HOST, PORT)
    logging.info("Telegram delivery mode: %s", "polling" if is_polling_delivery_mode() else "webhook")
    if is_polling_delivery_mode():
        threading.Thread(target=polling_loop, daemon=True).start()
    logging.info("Webhook endpoint: POST /webhook")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
`;
}

function buildTelegramSecret(): string {
  return randomUUID().replace(/-/g, '');
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Не удалось запустить deployment или установить Telegram webhook';
}

export async function createTelegramBotQuickstart(userId: string, input: TelegramBotQuickstartInput) {
  const preset = PRESETS[input.preset];
  if (!preset) {
    throw new AppError(400, 'QUICKSTART_PRESET_INVALID', 'Неизвестный быстрый маршрут');
  }

  const token = normalizeTelegramBotToken(input.telegram_bot_token);
  const botName = normalizeBotName(input);
  const toolIds = await resolveToolIds(preset.toolSlugs, Boolean(preset.requireTools));
  const agent = await createQuickstartAgent(userId, input, toolIds);
  const chat = await createQuickstartChat(userId, agent.id, botName, preset);
  const { messageId } = await insertQuickstartMessages(chat.id, botName, input);

  let deployment: Awaited<ReturnType<typeof projectDeploymentsService.getChatMessageProjectDeployment>> = null;
  let setupError: string | null = null;

  try {
    deployment = await projectDeploymentsService.upsertChatMessageProjectDeployment(
      chat.id,
      messageId,
      userId,
      {
        env: {
          TELEGRAM_BOT_TOKEN: token,
          TELEGRAM_SECRET_TOKEN: buildTelegramSecret(),
          TELEGRAM_DELIVERY_MODE: 'polling',
        },
        linked_agent_id: agent.id,
        set_telegram_webhook: false,
      },
    );
  } catch (error) {
    setupError = getErrorMessage(error);
    deployment = await projectDeploymentsService.getChatMessageProjectDeployment(chat.id, messageId, userId)
      .catch(() => null);
  }

  return {
    agent,
    chat,
    message_id: messageId,
    deployment,
    setup_error: setupError,
    botfather_url: BOTFATHER_URL,
    chat_url: `/chats?chat=${chat.id}`,
  };
}
