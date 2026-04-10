import { db } from '../../config/database.js';
import { agents, agentVersions, agentVersionTools, toolDefinitions } from '../schema/agents.js';
import { users } from '../schema/auth.js';
import { eq, and, inArray } from 'drizzle-orm';

const BASE_SYSTEM_PROMPT = `Ты — OpenRouter Coding Agent для llmstore.pro.

Роль:
- принимаешь задачу на разработку в чате;
- анализируешь текст сообщения и прикреплённые файлы;
- предлагаешь инженерное решение как опытный разработчик;
- всегда показываешь ход работы и понятный итог на русском языке.

Что ты умеешь:
- проектировать небольшие фичи, страницы и компоненты;
- переписывать и улучшать приложенный код;
- предлагать структуру файлов и архитектурные шаги;
- генерировать HTML/CSS/JS/TS/React-код;
- собирать standalone preview для интерфейсов, если это уместно.

Правила ответа:
1. Всегда отвечай на русском.
2. Если пользователь приложил файлы, опирайся на них как на основной источник контекста.
3. Сначала думай как инженер: требования, допущения, план, реализация, проверки.
4. Если задача связана с интерфейсом и можно показать standalone preview, включай HTML preview.
5. Не пиши, что что-то "сделано в репозитории", если ты только сгенерировал код в чате.
6. Не используй тег <dev-report> нигде, кроме специального блока ниже.

Формат ответа обязателен:
- сначала верни блок <dev-report>...</dev-report> с JSON;
- если задача про landing, preview, HTML-страницу, лендинг или standalone preview, не пиши ничего после </dev-report>;
- для остальных задач после блока можно дать короткий человекочитаемый markdown-ответ.

Схема JSON внутри <dev-report>:
{
  "summary": "краткий итог",
  "worklog": ["шаг 1", "шаг 2", "шаг 3"],
  "changed_files": [
    { "path": "src/App.tsx", "summary": "что изменилось" }
  ],
  "how_to_run": ["шаг запуска 1", "шаг запуска 2"],
  "notes": ["важная оговорка"],
  "project": {
    "title": "название проекта",
    "runtime": "node" | "python" | "static" | "generic",
    "root_dir": ".",
    "entrypoint": "server.js",
    "install": ["npm install"],
    "run": ["npm start"],
    "test": ["npm test"],
    "notes": ["заметка по проекту"],
    "stack": {
      "frontend": {
        "runtime": "static" | "node" | "python" | "generic",
        "root_dir": "frontend",
        "entrypoint": "dist/index.html",
        "framework": "vite"
      },
      "backend": {
        "runtime": "node" | "python" | "generic",
        "root_dir": "backend",
        "entrypoint": "server.js",
        "framework": "express"
      },
      "services": [
        {
          "kind": "postgres" | "mysql" | "redis" | "sqlite" | "queue",
          "label": "App DB",
          "mode": "managed" | "workspace" | "external",
          "engine": "postgresql",
          "env_prefix": "APP"
        }
      ]
    },
    "files": [
      {
        "path": "server.js",
        "summary": "основной сервер",
        "language": "javascript",
        "entrypoint": true,
        "content": "полное содержимое файла"
      }
    ]
  },
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
- если пользователь просит runnable проект, сервер, скрипт или архив проекта, обязательно заполняй project;
- если проект fullstack и в нём есть фронт, бэк и сервисы, старайся заполнять project.stack;
- в project.files передавай полное содержимое файлов, достаточное для сборки/запуска;
- не ограничивайся markdown-кодом файлов: если показываешь \`main.py\`, \`server.js\`, \`README.md\` и т.п., те же файлы обязательно должны быть продублированы в project.files;
- для Node.js проектов по возможности включай package.json и все нужные исходники;
- для Python-проектов по возможности включай requirements.txt и точку входа;
- для server-side проверки предпочитай простые zero-dependency Node.js/Python решения без внешних сервисов и без обязательного npm/pip install;
- если генерируешь Telegram-бота, webhook-бота или любой проект, который отправляет текст в Telegram Bot API, делай Telegram-совместимое форматирование исходящих сообщений;
- для Telegram предпочитай sendMessage с parse_mode="HTML" и конвертацию markdown-подобного текста в поддерживаемый Telegram HTML;
- не отправляй пользователю в Telegram сырой markdown вроде **жирный**, __подчёркнутый__, markdown-списков или markdown-ссылок без преобразования;
- preview.type="html" используй только для standalone preview, который реально можно отрисовать в iframe;
- если preview не нужен, передай null или не указывай поле;
- JSON должен быть валидным, без комментариев и markdown fences;
- если preview присутствует, не повторяй полный HTML/CSS/JS вне preview.html;
- markdown после </dev-report> держи коротким и по сути;
- если задача про landing/preview, лучше вообще не добавляй markdown после </dev-report>;
- если ответ получается длинным, сначала закрой валидный JSON и preview.html, а потом дополняй пояснение.

После блока <dev-report>:
- кратко объясни, что сделал;
- при необходимости добавь кодовые блоки с ключевыми файлами;
- если есть ограничения, перечисли их коротко.`;

const KIMI_FULLSTACK_ORCHESTRATOR_APPENDIX = `
Дополнительный режим для этой версии агента:
- работай как orchestration-first техлид для крупных задач;
- если задача похожа на лендинг, большой fullstack-сайт, продуктовую платформу или большую аналитику, сначала декомпозируй её на треки;
- для точечной делегации используй инструмент llm-orchestrator-worker, когда выгодно отдать отдельную подзадачу специализированной worker-модели;
- разделяй работу как минимум на frontend, backend, data/integrations, content/UX и verification;
- для каждого трека формулируй цель, входы, выходы, риски и критерии готовности;
- если архитектура ещё не ясна, не спеши писать много кода до появления понятных контрактов между частями системы;
- если пользователь просит runnable bundle, после декомпозиции переходи к реализации и возвращай полный dev-report;
- не утверждай, что ты реально запустил другие модели или воркеры, если этого не происходило: ты выполняешь orchestration внутри одного ответа.
`;

const KIMI_FULLSTACK_ORCHESTRATOR_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}\n${KIMI_FULLSTACK_ORCHESTRATOR_APPENDIX}`;

interface CodingPreset {
  slug: string;
  name: string;
  description: string;
  model_external_id: string;
  version_number: number;
  system_prompt?: string;
  tool_slugs?: string[];
  chat_intro: string;
  starter_prompts: string[];
  max_iterations: number;
  temperature: number;
  max_tokens: number;
}

const DEFAULT_CODING_STARTER_PROMPTS = [
  'Проанализируй приложенный код и предложи безопасный план изменений',
  'Реализуй новую фичу по ТЗ и покажи итог в понятном виде',
  'Сделай рефакторинг модуля и перечисли ключевые изменения',
];

const FAST_CODING_STARTER_PROMPTS = [
  'Быстро разберись в файле и предложи минимальные правки',
  'Сделай короткий code review и выдели главные проблемы',
  'Подготовь компактную реализацию без лишней архитектуры',
];

const HEAVY_CODING_STARTER_PROMPTS = [
  'Разбери сложное ТЗ и предложи подробный план реализации',
  'Спроектируй архитектуру и перечисли ключевые trade-offs',
  'Подготовь план большого рефакторинга по шагам',
];

const ORCHESTRATOR_STARTER_PROMPTS = [
  'Разбей большой fullstack-проект на этапы: frontend, backend, data, integrations и verification',
  'Спроектируй лендинг или маркетинговый сайт с backend-частью и опиши контракты между слоями',
  'Проведи глубокую аналитику статьи, исследования или большого материала и выдай структуру выводов и следующих задач',
];

const CODING_PRESETS: CodingPreset[] = [
  {
    slug: 'openrouter-coding-agent',
    name: 'Coding Agent: Claude Sonnet 4.6',
    description: 'Сбалансированный coding-agent на Claude Sonnet 4.6 для большинства задач по разработке.',
    model_external_id: 'anthropic/claude-sonnet-4.6',
    version_number: 4,
    chat_intro: 'Сбалансированный coding-agent на Claude Sonnet 4.6. Хорош для новых фич, UI, рефакторинга и работы с прикреплённым кодом.',
    starter_prompts: DEFAULT_CODING_STARTER_PROMPTS,
    max_iterations: 6,
    temperature: 0.2,
    max_tokens: 8192,
  },
  {
    slug: 'openrouter-coding-agent-fast',
    name: 'Coding Agent: Claude Haiku 4.5',
    description: 'Быстрый и более дешёвый coding-agent на Claude Haiku 4.5 для коротких задач и быстрых итераций.',
    model_external_id: 'anthropic/claude-haiku-4.5',
    version_number: 4,
    chat_intro: 'Быстрый coding-agent на Claude Haiku 4.5. Лучше всего подходит для маленьких правок, чтения контекста и быстрых повторных запусков.',
    starter_prompts: FAST_CODING_STARTER_PROMPTS,
    max_iterations: 4,
    temperature: 0.2,
    max_tokens: 12288,
  },
  {
    slug: 'openrouter-coding-agent-heavy-planning',
    name: 'Coding Agent: Claude Opus 4.6',
    description: 'Премиальный coding-agent на Claude Opus 4.6 для сложной архитектуры и тяжёлого планирования.',
    model_external_id: 'anthropic/claude-opus-4.6',
    version_number: 2,
    chat_intro: 'Премиальный coding-agent на Claude Opus 4.6. Подходит для больших рефакторингов, архитектуры и детального плана изменений.',
    starter_prompts: HEAVY_CODING_STARTER_PROMPTS,
    max_iterations: 8,
    temperature: 0.15,
    max_tokens: 12288,
  },
  {
    slug: 'openrouter-coding-agent-kimi-k2-5-orchestrator',
    name: 'Kimi K2.5 Fullstack Orchestrator',
    description: 'Orchestration-first агент на Kimi K2.5 для лендингов, крупных fullstack-проектов и большой аналитики.',
    model_external_id: 'moonshotai/kimi-k2.5',
    version_number: 1,
    system_prompt: KIMI_FULLSTACK_ORCHESTRATOR_SYSTEM_PROMPT,
    tool_slugs: ['llm-orchestrator-worker', 'web-search-cascade'],
    chat_intro: 'Kimi K2.5 в orchestration-first режиме. Сначала раскладываю большие задачи на треки и контракты между частями системы, затем довожу до реализации, если это нужно.',
    starter_prompts: ORCHESTRATOR_STARTER_PROMPTS,
    max_iterations: 8,
    temperature: 0.15,
    max_tokens: 12288,
  },
  {
    slug: 'openrouter-coding-agent-coding-alternative',
    name: 'Coding Agent: Qwen3 Coder Plus',
    description: 'Code-first coding-agent на Qwen3 Coder Plus как хорошая альтернатива дорогим premium-моделям.',
    model_external_id: 'qwen/qwen3-coder-plus',
    version_number: 2,
    chat_intro: 'Code-first coding-agent на Qwen3 Coder Plus. Хорош как практичная альтернатива premium-моделям для инженерных задач.',
    starter_prompts: DEFAULT_CODING_STARTER_PROMPTS,
    max_iterations: 6,
    temperature: 0.2,
    max_tokens: 8192,
  },
  {
    slug: 'openrouter-coding-agent-gpt-5-4',
    name: 'Coding Agent: GPT-5.4',
    description: 'Сильный premium coding-agent на GPT-5.4 для сложных задач, tool use и длинного контекста.',
    model_external_id: 'openai/gpt-5.4',
    version_number: 2,
    chat_intro: 'Premium coding-agent на GPT-5.4. Подходит для сложных инженерных задач, многошагового reasoning и качественного tool use.',
    starter_prompts: HEAVY_CODING_STARTER_PROMPTS,
    max_iterations: 8,
    temperature: 0.15,
    max_tokens: 12288,
  },
  {
    slug: 'openrouter-coding-agent-gpt-5-4-mini',
    name: 'Coding Agent: GPT-5.4 Mini',
    description: 'Быстрый и более доступный coding-agent на GPT-5.4 Mini для частых запусков.',
    model_external_id: 'openai/gpt-5.4-mini',
    version_number: 2,
    chat_intro: 'Быстрый coding-agent на GPT-5.4 Mini. Подходит для частых запусков, итераций и повседневных задач разработки.',
    starter_prompts: FAST_CODING_STARTER_PROMPTS,
    max_iterations: 5,
    temperature: 0.2,
    max_tokens: 12288,
  },
  {
    slug: 'openrouter-coding-agent-gpt-5-3-codex',
    name: 'Coding Agent: GPT-5.3 Codex',
    description: 'Специализированный agentic coding-вариант на GPT-5.3 Codex.',
    model_external_id: 'openai/gpt-5.3-codex',
    version_number: 2,
    chat_intro: 'Специализированный coding-agent на GPT-5.3 Codex. Хорош для code generation, исправлений и agentic workflow.',
    starter_prompts: DEFAULT_CODING_STARTER_PROMPTS,
    max_iterations: 7,
    temperature: 0.18,
    max_tokens: 12288,
  },
  {
    slug: 'openrouter-coding-agent-gpt-5-1-codex-max',
    name: 'Coding Agent: GPT-5.1 Codex Max',
    description: 'Экономичный agentic coding-вариант на GPT-5.1 Codex Max.',
    model_external_id: 'openai/gpt-5.1-codex-max',
    version_number: 2,
    chat_intro: 'Agentic coding-agent на GPT-5.1 Codex Max. Подходит для длинных рабочих сессий и высокой частоты использования.',
    starter_prompts: DEFAULT_CODING_STARTER_PROMPTS,
    max_iterations: 6,
    temperature: 0.18,
    max_tokens: 12288,
  },
  {
    slug: 'openrouter-coding-agent-qwen3-coder-flash',
    name: 'Coding Agent: Qwen3 Coder Flash',
    description: 'Очень дешёвый coding-agent на Qwen3 Coder Flash для быстрых и частых задач.',
    model_external_id: 'qwen/qwen3-coder-flash',
    version_number: 2,
    chat_intro: 'Очень дешёвый coding-agent на Qwen3 Coder Flash. Хорош для быстрых проверок, мелких задач и частых запусков.',
    starter_prompts: FAST_CODING_STARTER_PROMPTS,
    max_iterations: 4,
    temperature: 0.2,
    max_tokens: 8192,
  },
  {
    slug: 'openrouter-coding-agent-qwen3-coder-next',
    name: 'Coding Agent: Qwen3 Coder Next',
    description: 'Суперэкономичный coding-agent на Qwen3 Coder Next для always-on сценариев. Подходит для дешёвых итераций, но не лучший выбор для длинных runnable bundle задач.',
    model_external_id: 'qwen/qwen3-coder-next',
    version_number: 2,
    chat_intro: 'Суперэкономичный coding-agent на Qwen3 Coder Next. Подходит для always-on сценариев, регулярных фоновых задач и дешёвых итераций. Для длинных runnable bundle задач и больших ответов лучше выбирать GPT-5.4, Claude Sonnet 4.6 или хотя бы более быстрый Qwen3 Coder Flash.',
    starter_prompts: FAST_CODING_STARTER_PROMPTS,
    max_iterations: 4,
    temperature: 0.2,
    max_tokens: 8192,
  },
  {
    slug: 'openrouter-coding-agent-codestral-2508',
    name: 'Coding Agent: Codestral 2508',
    description: 'Недорогой code-specialist на Codestral 2508 для генерации кода и test generation.',
    model_external_id: 'mistralai/codestral-2508',
    version_number: 1,
    chat_intro: 'Недорогой coding-agent на Codestral 2508. Хорош для генерации кода, исправлений и тестов.',
    starter_prompts: FAST_CODING_STARTER_PROMPTS,
    max_iterations: 5,
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
  const systemPrompt = preset.system_prompt ?? BASE_SYSTEM_PROMPT;
  const syncPresetTools = async (agentVersionId: string) => {
    await db.delete(agentVersionTools).where(eq(agentVersionTools.agent_version_id, agentVersionId));

    const toolSlugs = preset.tool_slugs ?? [];
    if (toolSlugs.length === 0) return;

    const rows = await db
      .select({ id: toolDefinitions.id, slug: toolDefinitions.slug })
      .from(toolDefinitions)
      .where(and(
        inArray(toolDefinitions.slug, toolSlugs),
        eq(toolDefinitions.is_active, true),
      ));

    const toolIdsBySlug = new Map(rows.map((row) => [row.slug, row.id]));
    const values = toolSlugs
      .map((slug, orderIndex) => {
        const toolDefinitionId = toolIdsBySlug.get(slug);
        if (!toolDefinitionId) return null;
        return {
          agent_version_id: agentVersionId,
          tool_definition_id: toolDefinitionId,
          is_required: slug === 'llm-orchestrator-worker',
          order_index: orderIndex,
        };
      })
      .filter((value): value is {
        agent_version_id: string;
        tool_definition_id: string;
        is_required: boolean;
        order_index: number;
      } => Boolean(value));

    if (values.length > 0) {
      await db.insert(agentVersionTools).values(values);
    }
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
        system_prompt: systemPrompt,
        response_mode: 'text',
        runtime_config: runtimeConfig,
      })
      .onConflictDoUpdate({
        target: [agentVersions.agent_id, agentVersions.version_number],
        set: {
          runtime_engine: 'openrouter_chat',
          system_prompt: systemPrompt,
          response_mode: 'text',
          runtime_config: runtimeConfig,
        },
      })
      .returning();

    await db.update(agents).set({ current_version_id: version.id }).where(eq(agents.id, existing.id));
    await syncPresetTools(version.id);
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
      system_prompt: systemPrompt,
      response_mode: 'text',
      runtime_config: runtimeConfig,
    })
    .returning();

  await db.update(agents).set({ current_version_id: version.id }).where(eq(agents.id, agent.id));
  await syncPresetTools(version.id);
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
