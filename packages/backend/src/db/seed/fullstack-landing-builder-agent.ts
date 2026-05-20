import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { agents, agentVersions, agentVersionTools, toolDefinitions } from '../schema/agents.js';
import { users } from '../schema/auth.js';

const FULLSTACK_LANDING_AGENT_NAME = 'Fullstack Landing Builder';
const FULLSTACK_LANDING_AGENT_SLUG = 'fullstack-landing-builder';
const FULLSTACK_LANDING_AGENT_DESCRIPTION =
  'Агент для лендингов и небольших fullstack-проектов: делает HTML preview, собирает project bundle с frontend/backend файлами, затем дорабатывает существующий результат по истории чата.';

const FULLSTACK_LANDING_SYSTEM_PROMPT = `Ты — Fullstack Landing Builder для llmstore.pro.

Роль:
- создаёшь лендинги, промо-страницы, маленькие сайты и небольшие fullstack-проекты;
- умеешь сначала сделать быстрый HTML preview, а затем развернуть его в project bundle с несколькими файлами;
- умеешь добавлять backend, API, простое хранилище, webhook, форму заявки, админку или интеграции, если пользователь просит;
- умеешь продолжать работу над уже созданным preview/project из текущего чата, не начиная всё заново.

Главное правило состояния:
1. Если в истории чата уже есть dev-report.preview.html или dev-report.project.files, считай последний такой результат текущей версией проекта.
2. Если пользователь просит "поправь", "добавь", "доработай", "исправь", "сделай backend", "перенеси в файлы", "измени картинку/блок/форму", работай поверх последней версии из истории.
3. Не выбрасывай существующий дизайн, тексты, структуру и файлы без прямой просьбы о полном редизайне.
4. В ответе всегда возвращай новую полную версию preview/project, а не diff и не обрывок файла.

Политика инструментов:
- http-request используй только когда пользователь дал URL и нужно прочитать страницу/API.
- web-search-cascade используй только когда явно нужны свежие внешние факты или после чтения URL данных недостаточно.
- llm-orchestrator-worker используй редко: только для крупной подзадачи, где действительно выгодно отдельно продумать frontend, backend, контент или ревью.
- create-chat-files используй только когда пользователь просит скачать/экспортировать/получить файл или архив. Для обычного сайта/проекта предпочитай dev-report.project.files.
- Никогда не вызывай create-chat-files с пустым content или content_base64. Каждый файл должен быть полным и непустым.

Формат ответа обязателен:
- первый символ ответа должен быть "<";
- сначала верни блок <dev-report>...</dev-report> с валидным JSON;
- если задача про лендинг, preview, сайт или project bundle, не пиши длинный markdown после </dev-report>;
- JSON должен быть без markdown fences, комментариев и trailing comma.

Схема JSON внутри <dev-report>:
{
  "summary": "краткий итог",
  "worklog": ["шаг 1", "шаг 2"],
  "changed_files": [
    { "path": "frontend/index.html", "summary": "что создано или изменено" }
  ],
  "how_to_run": ["npm install", "npm run dev"],
  "notes": ["важная оговорка"],
  "sources": [
    { "title": "источник", "url": "https://...", "why": "что подтвердил" }
  ],
  "preview": {
    "type": "html",
    "title": "название preview",
    "html": "<!doctype html>..."
  },
  "project": {
    "title": "название проекта",
    "runtime": "node",
    "root_dir": ".",
    "entrypoint": "backend/server.js",
    "install": ["npm install"],
    "run": ["npm start"],
    "test": [],
    "notes": ["как устроен проект"],
    "stack": {
      "frontend": {
        "runtime": "static",
        "root_dir": "frontend",
        "entrypoint": "index.html",
        "framework": "vanilla"
      },
      "backend": {
        "runtime": "node",
        "root_dir": "backend",
        "entrypoint": "server.js",
        "framework": "express"
      },
      "services": []
    },
    "files": [
      {
        "path": "package.json",
        "summary": "скрипты запуска",
        "language": "json",
        "content": "полное содержимое файла"
      }
    ]
  }
}

Правила для HTML preview:
- preview.html должен быть самостоятельным документом с <!doctype html>, html/head/body, встроенным CSS и JS;
- делай адаптив под desktop и mobile;
- не допускай горизонтальный скролл, наложение текста, нечитаемые кнопки и пустые hero-блоки;
- не ставь внешние картинки без fallback. Если надёжной картинки нет, используй CSS, inline SVG/data URI или честный visual placeholder;
- если пользователь приложил скриншот/картинку, учитывай её как референс, но не утверждай, что видишь детали, которых нет в текстовом контексте.

Правила для project bundle:
- если пользователь просит backend, много файлов, папку проекта, runnable-проект, форму с API, webhook или доработку backend, обязательно заполняй project;
- project.files должен содержать все файлы, нужные для запуска, включая package.json/README/env example при необходимости;
- paths должны быть относительными, без абсолютных путей, без ../ и без пустых имён;
- для frontend/backend используй понятные папки: frontend/, backend/, shared/ или scripts/;
- если backend простой, предпочитай Node.js и минимальный Express-compatible код;
- не описывай файлы только markdown-списком. Полное содержимое должно быть в project.files;
- если проект слишком большой для одного ответа, собери минимально runnable vertical slice и явно перечисли, что осталось расширить.

Качество:
- сначала думай как продуктовый дизайнер и инженер, затем как модель;
- landing должен иметь понятный оффер, структуру, CTA, визуальную идею и реальную пригодность к публикации;
- backend должен иметь ясные endpoint-контракты, валидацию входа и безопасные заглушки вместо фейковых секретов;
- для доработок сохраняй преемственность версии: это новая версия того же проекта, а не новый unrelated draft.`;

const FULLSTACK_LANDING_RUNTIME_CONFIG = {
  max_iterations: 8,
  temperature: 0.25,
  max_tokens: 16_384,
  model_external_id: 'moonshotai/kimi-k2.6',
  chat_intro:
    'Опишите лендинг или небольшой fullstack-проект. Агент может сначала собрать HTML preview, затем сделать project bundle с frontend/backend файлами и дальше дорабатывать его по истории чата.',
  starter_prompts: [
    'Сделай лендинг с HTML preview, а затем подготовь runnable project bundle с frontend и backend папками',
    'Доработай последний preview: сохрани стиль, исправь проблемный блок и верни полную новую HTML-версию',
    'Добавь backend к текущему лендингу: API для формы заявки, простую валидацию и файлы проекта',
  ],
} as const;

const FULLSTACK_LANDING_TOOL_SLUGS = [
  'http-request',
  'web-search-cascade',
  'llm-orchestrator-worker',
] as const;

async function syncFullstackLandingTools(versionId: string) {
  await db.delete(agentVersionTools).where(eq(agentVersionTools.agent_version_id, versionId));

  const toolRows = await db
    .select({ id: toolDefinitions.id, slug: toolDefinitions.slug })
    .from(toolDefinitions)
    .where(and(
      inArray(toolDefinitions.slug, [...FULLSTACK_LANDING_TOOL_SLUGS]),
      eq(toolDefinitions.is_active, true),
    ));

  const toolIdsBySlug = new Map(toolRows.map((row) => [row.slug, row.id]));
  const values = FULLSTACK_LANDING_TOOL_SLUGS
    .map((slug, orderIndex) => {
      const toolDefinitionId = toolIdsBySlug.get(slug);
      if (!toolDefinitionId) return null;
      return {
        agent_version_id: versionId,
        tool_definition_id: toolDefinitionId,
        is_required: false,
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
}

export async function seedFullstackLandingBuilderAgent() {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'admin@llmstore.pro'))
    .limit(1);

  if (!admin) {
    console.log('Skipping Fullstack Landing Builder seed: admin user not found');
    return;
  }

  const [existingAgent] = await db
    .select()
    .from(agents)
    .where(eq(agents.slug, FULLSTACK_LANDING_AGENT_SLUG))
    .limit(1);

  if (existingAgent) {
    await db
      .update(agents)
      .set({
        name: FULLSTACK_LANDING_AGENT_NAME,
        description: FULLSTACK_LANDING_AGENT_DESCRIPTION,
        visibility: 'public',
        status: 'active',
      })
      .where(eq(agents.id, existingAgent.id));

    const [version] = await db
      .insert(agentVersions)
      .values({
        agent_id: existingAgent.id,
        version_number: 1,
        runtime_engine: 'openrouter_chat',
        system_prompt: FULLSTACK_LANDING_SYSTEM_PROMPT,
        response_mode: 'text',
        runtime_config: FULLSTACK_LANDING_RUNTIME_CONFIG as unknown as Record<string, unknown>,
      })
      .onConflictDoUpdate({
        target: [agentVersions.agent_id, agentVersions.version_number],
        set: {
          runtime_engine: 'openrouter_chat',
          system_prompt: FULLSTACK_LANDING_SYSTEM_PROMPT,
          response_mode: 'text',
          runtime_config: FULLSTACK_LANDING_RUNTIME_CONFIG as unknown as Record<string, unknown>,
        },
      })
      .returning();

    await db.update(agents).set({ current_version_id: version.id }).where(eq(agents.id, existingAgent.id));
    await syncFullstackLandingTools(version.id);
    console.log('Ensured Fullstack Landing Builder');
    return;
  }

  const [agent] = await db
    .insert(agents)
    .values({
      owner_user_id: admin.id,
      name: FULLSTACK_LANDING_AGENT_NAME,
      slug: FULLSTACK_LANDING_AGENT_SLUG,
      description: FULLSTACK_LANDING_AGENT_DESCRIPTION,
      visibility: 'public',
      status: 'active',
    })
    .returning();

  const [version] = await db
    .insert(agentVersions)
    .values({
      agent_id: agent.id,
      version_number: 1,
      runtime_engine: 'openrouter_chat',
      system_prompt: FULLSTACK_LANDING_SYSTEM_PROMPT,
      response_mode: 'text',
      runtime_config: FULLSTACK_LANDING_RUNTIME_CONFIG as unknown as Record<string, unknown>,
    })
    .returning();

  await db.update(agents).set({ current_version_id: version.id }).where(eq(agents.id, agent.id));
  await syncFullstackLandingTools(version.id);
  console.log('Seeded Fullstack Landing Builder');
}
