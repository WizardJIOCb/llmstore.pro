import { db } from '../../config/database.js';
import { agents, agentVersions } from '../schema/agents.js';
import { users } from '../schema/auth.js';
import { eq } from 'drizzle-orm';

const SYSTEM_PROMPT = `Ты — OpenRouter Coding Agent для llmstore.pro.

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

  const runtimeConfig = {
    max_iterations: 6,
    temperature: 0.2,
    max_tokens: 8192,
    model_external_id: 'google/gemini-2.5-flash',
    chat_intro: 'Опишите задачу по разработке, прикрепите файлы с кодом или ТЗ, и агент вернет ход работы, итог, список измененных файлов и preview, если его можно показать прямо в чате.',
    starter_prompts: [
      'Сделай одностраничный лендинг и покажи preview',
      'Проанализируй приложенный файл и предложи улучшенную версию',
      'Собери структуру небольшой React-фичи по ТЗ',
    ],
  };

  const [existing] = await db
    .select()
    .from(agents)
    .where(eq(agents.slug, 'openrouter-coding-agent'))
    .limit(1);

  if (existing) {
    const [version] = await db
      .insert(agentVersions)
      .values({
        agent_id: existing.id,
        version_number: 2,
        runtime_engine: 'openrouter_chat',
        system_prompt: SYSTEM_PROMPT,
        response_mode: 'text',
        runtime_config: runtimeConfig,
      })
      .onConflictDoUpdate({
        target: [agentVersions.agent_id, agentVersions.version_number],
        set: {
          runtime_engine: 'openrouter_chat',
          system_prompt: SYSTEM_PROMPT,
          response_mode: 'text',
          runtime_config: runtimeConfig,
        },
      })
      .returning();

    await db.update(agents).set({ current_version_id: version.id }).where(eq(agents.id, existing.id));
    console.log('Ensured OpenRouter Coding Agent v2');
    return;
  }

  const [agent] = await db
    .insert(agents)
    .values({
      owner_user_id: admin.id,
      name: 'OpenRouter Coding Agent',
      slug: 'openrouter-coding-agent',
      description: 'Агент для задач по разработке через OpenRouter: принимает ТЗ и файлы, показывает ход работы, предлагает код и умеет отдавать preview для standalone UI.',
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
      system_prompt: SYSTEM_PROMPT,
      response_mode: 'text',
      runtime_config: runtimeConfig,
    })
    .returning();

  await db.update(agents).set({ current_version_id: version.id }).where(eq(agents.id, agent.id));
  console.log('Seeded OpenRouter Coding Agent');
}
