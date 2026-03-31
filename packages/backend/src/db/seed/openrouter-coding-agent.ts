import { db } from '../../config/database.js';
import { agents, agentVersions } from '../schema/agents.js';
import { users } from '../schema/auth.js';
import { eq } from 'drizzle-orm';

const BASE_SYSTEM_PROMPT = `Ты — OpenRouter Coding Agent для llmstore.pro.

Роль:
- принимаешь задачу на разработку в чате;
- анализируешь текст сообщения и прикрепленные файлы;
- пишешь решение как опытный инженер;
- всегда показываешь ход работы и понятный итог на русском языке.

Что ты умеешь:
- проектировать небольшие фичи, страницы и компоненты;
- переписывать приложенный код;
- предлагать структуру файлов;
- генерировать HTML/CSS/JS/TS/React-код;
- собирать короткий preview для одностраничных интерфейсов.

Правила ответа:
1. Всегда отвечай на русском.
2. Если пользователь приложил файлы, опирайся на них как на источник контекста.
3. Сначала думай как инженер: требования, допущения, план, реализация, проверки.
4. Если задача связана с интерфейсом и можно показать standalone preview, включай HTML preview.
5. Не пиши, что что-то "сделано в репозитории", если ты только сгенерировал код в чате.
6. Не используй тег <dev-report> нигде, кроме специального блока ниже.

Формат ответа обязателен:
- сначала верни блок <dev-report>...</dev-report> c JSON;
- после блока дай обычный человекочитаемый markdown-ответ.

Схема JSON внутри <dev-report>:
{
  "summary": "краткий итог",
  "worklog": ["шаг 1", "шаг 2", "шаг 3"],
  "changed_files": [
    { "path": "src/App.tsx", "summary": "что изменилось" }
  ],
  "how_to_run": ["шаг запуска 1", "шаг запуска 2"],
  "notes": ["важная оговорка"],
  "preview": {
    "type": "html" | "url",
    "title": "название preview",
    "html": "<!doctype html>...",
    "url": "https://..."
  }
}

Правила для dev-report:
- summary и worklog желательно заполнять всегда;
- changed_files заполняй, если предлагаешь конкретные файлы;
- how_to_run заполняй, если есть запуск или интеграция;
- preview.type="html" используй только для standalone preview, который реально можно отрисовать в iframe;
- если preview не нужен, передай null или не указывай поле;
- JSON должен быть валидным, без комментариев и markdown fences.

После блока <dev-report>:
- дай краткое объяснение того, что сделал;
- при необходимости добавь кодовые блоки с ключевыми файлами;
- если есть ограничения, перечисли их коротко.`;

interface CodingPreset {
  slug: string;
  name: string;
  description: string;
  model_external_id: string;
  version_number: number;
  chat_intro: string;
  starter_prompts: string[];
  max_iterations: number;
  temperature: number;
  max_tokens: number;
}

const CODING_PRESETS: CodingPreset[] = [
  {
    slug: 'openrouter-coding-agent',
    name: 'OpenRouter Coding Agent',
    description: 'Основной coding-agent на Claude Sonnet 4.6 для задач по разработке: принимает ТЗ и файлы, показывает ход работы, предлагает код и умеет отдавать preview для standalone UI.',
    model_external_id: 'anthropic/claude-sonnet-4.6',
    version_number: 3,
    chat_intro: 'Основной coding-agent на Claude Sonnet 4.6. Подходит для большинства задач по разработке: рефакторинг, новые фичи, UI и работа с прикрепленным кодом.',
    starter_prompts: [
      'Сделай одностраничный лендинг и покажи preview',
      'Проанализируй приложенный файл и предложи улучшенную версию',
      'Собери структуру небольшой React-фичи по ТЗ',
    ],
    max_iterations: 6,
    temperature: 0.2,
    max_tokens: 8192,
  },
  {
    slug: 'openrouter-coding-agent-fast',
    name: 'OpenRouter Coding Agent Fast',
    description: 'Быстрый и более дешёвый coding-agent на GPT-5.4 Mini для small edits, чтения контекста и простых задач.',
    model_external_id: 'openai/gpt-5.4-mini',
    version_number: 1,
    chat_intro: 'Быстрый coding-agent на GPT-5.4 Mini. Лучше подходит для маленьких правок, чтения проекта, summary и коротких задач.',
    starter_prompts: [
      'Коротко разберись в приложенном коде и предложи улучшения',
      'Сделай небольшой рефакторинг компонента',
      'Подготовь минимальную версию страницы по ТЗ',
    ],
    max_iterations: 4,
    temperature: 0.2,
    max_tokens: 6144,
  },
  {
    slug: 'openrouter-coding-agent-heavy-planning',
    name: 'OpenRouter Coding Agent Heavy Planning',
    description: 'Тяжёлый coding-agent на Claude Opus 4.6 для сложных архитектурных задач, планирования и трудных рефакторингов.',
    model_external_id: 'anthropic/claude-opus-4.6',
    version_number: 1,
    chat_intro: 'Тяжёлый coding-agent на Claude Opus 4.6. Лучше подходит для сложных задач: архитектура, большие рефакторинги и подробный план изменений.',
    starter_prompts: [
      'Сделай подробный план большого рефакторинга и предложи структуру файлов',
      'Перепроектируй модуль с учётом масштабирования',
      'Разбери сложное ТЗ и предложи архитектуру реализации',
    ],
    max_iterations: 8,
    temperature: 0.15,
    max_tokens: 12288,
  },
  {
    slug: 'openrouter-coding-agent-coding-alternative',
    name: 'OpenRouter Coding Agent Coding Alternative',
    description: 'Альтернативный coding-agent на Qwen3 Coder Plus, ориентированный на code-first задачи и работу с реализацией.',
    model_external_id: 'qwen/qwen3-coder-plus',
    version_number: 1,
    chat_intro: 'Coding-first агент на Qwen3 Coder Plus. Хорош как альтернатива premium-моделям для инженерных задач и генерации кода.',
    starter_prompts: [
      'Сгенерируй реализацию фичи по приложенному ТЗ',
      'Предложи структуру файлов и ключевые компоненты для новой страницы',
      'Перепиши код с упором на чистую реализацию',
    ],
    max_iterations: 6,
    temperature: 0.2,
    max_tokens: 8192,
  },
];

async function ensureCodingAgentPreset(adminId: string, preset: CodingPreset) {
  const runtimeConfig = {
    max_iterations: preset.max_iterations,
    temperature: preset.temperature,
    max_tokens: preset.max_tokens,
    model_external_id: preset.model_external_id,
    chat_intro: preset.chat_intro,
    starter_prompts: preset.starter_prompts,
  };

  const [existing] = await db
    .select()
    .from(agents)
    .where(eq(agents.slug, preset.slug))
    .limit(1);

  if (existing) {
    await db.update(agents).set({
      name: preset.name,
      description: preset.description,
      visibility: 'public',
      status: 'active',
    }).where(eq(agents.id, existing.id));

    const [version] = await db
      .insert(agentVersions)
      .values({
        agent_id: existing.id,
        version_number: preset.version_number,
        runtime_engine: 'openrouter_chat',
        system_prompt: BASE_SYSTEM_PROMPT,
        response_mode: 'text',
        runtime_config: runtimeConfig,
      })
      .onConflictDoUpdate({
        target: [agentVersions.agent_id, agentVersions.version_number],
        set: {
          runtime_engine: 'openrouter_chat',
          system_prompt: BASE_SYSTEM_PROMPT,
          response_mode: 'text',
          runtime_config: runtimeConfig,
        },
      })
      .returning();

    await db.update(agents).set({ current_version_id: version.id }).where(eq(agents.id, existing.id));
    console.log(`Ensured ${preset.name}`);
    return;
  }

  const [agent] = await db
    .insert(agents)
    .values({
      owner_user_id: adminId,
      name: preset.name,
      slug: preset.slug,
      description: preset.description,
      visibility: 'public',
      status: 'active',
    })
    .returning();

  const [version] = await db
    .insert(agentVersions)
    .values({
      agent_id: agent.id,
      version_number: preset.version_number,
      runtime_engine: 'openrouter_chat',
      system_prompt: BASE_SYSTEM_PROMPT,
      response_mode: 'text',
      runtime_config: runtimeConfig,
    })
    .returning();

  await db.update(agents).set({ current_version_id: version.id }).where(eq(agents.id, agent.id));
  console.log(`Seeded ${preset.name}`);
}

export async function seedOpenRouterCodingAgent() {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'admin@llmstore.pro'))
    .limit(1);

  if (!admin) {
    console.log('Skipping OpenRouter Coding Agent seed: admin user not found');
    return;
  }

  for (const preset of CODING_PRESETS) {
    await ensureCodingAgentPreset(admin.id, preset);
  }
}
