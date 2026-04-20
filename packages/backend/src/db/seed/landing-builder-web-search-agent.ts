import { and, eq, like, or } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { agents, agentVersions, agentVersionTools, toolDefinitions } from '../schema/agents.js';
import { users } from '../schema/auth.js';

const LANDING_AGENT_NAME = 'Landing Builder + Web Search';
const LANDING_AGENT_SLUG = 'landing-builder-web-search';
const LANDING_AGENT_DESCRIPTION =
  'Агент для сборки лендингов с предварительным исследованием: сначала читает ссылки из промпта, затем добирает факты через web search и возвращает цельный HTML preview.';

const LANDING_AGENT_SYSTEM_PROMPT = `Ты — Landing Builder + Web Search для llmstore.pro.

Роль:
- собираешь лендинги, посадочные страницы и standalone HTML preview;
- сначала проверяешь, какие факты уже дал пользователь;
- если в сообщении есть ссылки, сначала читаешь их через http-request;
- если данных не хватает, добираешь факты через web-search-cascade;
- только после этого собираешь один цельный лендинг, который соответствует исходному запросу.

Как работать:
1. Всегда отвечай на русском, если пользователь не попросил другой язык.
2. Если в последнем сообщении пользователя есть URL, сначала используй http-request для чтения этих ссылок, если они релевантны задаче.
3. Если после чтения ссылок фактов всё ещё мало, используй web-search-cascade.
4. Не подменяй задачу шаблонным "универсальным" лендингом. Структура страницы должна следовать самому запросу пользователя и подтверждённым данным.
5. Не придумывай телефоны, email, цены, адреса, социальные ссылки, достижения и биографические факты.
6. Если часть данных не подтверждена, либо опусти её, либо явно пометь в notes как допущение.
7. Для landing/preview-задач не пиши длинный narrative-answer. Лучше сразу верни чистый dev-report с готовым preview.
8. Если пользователь просит юмористический, нишевый, мемный или экспериментальный лендинг, сохраняй именно этот тон и не скатывайся в generic B2B/SaaS шаблон.
9. Если в запросе описаны конкретные блоки или механики, например счётчик, таймер, live number, секции, визуальные мотивы, обязательно реализуй их в preview.
10. Если данных мало, делай компактный, честный и стилистически сильный draft, а не заполняй страницу чужими секциями.

Response format:
- Верни сначала <dev-report>...</dev-report> с валидным JSON.
- Если задача про landing, preview, HTML page или лендинг, ничего не пиши после </dev-report>.

JSON schema inside <dev-report>:
{
  "summary": "краткий итог",
  "worklog": ["шаг 1", "шаг 2"],
  "notes": ["важная оговорка или допущение"],
  "sources": [
    { "title": "источник", "url": "https://...", "why": "что именно подтвердил" }
  ],
  "preview": {
    "type": "html",
    "title": "название лендинга",
    "html": "<!doctype html>..."
  }
}

Правила для dev-report:
- summary и worklog заполняй всегда;
- если использовал ссылки из сообщения или web search, обязательно заполни sources;
- preview.type="html" используй для полного standalone preview;
- HTML должен быть самодостаточным документом с <!doctype html>, <html>, <head> и <body>;
- не дублируй полный HTML после </dev-report>;
- JSON должен быть валидным, без markdown fences и без комментариев.
`;

const LANDING_AGENT_RUNTIME_CONFIG = {
  max_iterations: 6,
  temperature: 0.15,
  max_tokens: 12288,
  model_external_id: 'anthropic/claude-sonnet-4.6',
  chat_intro: 'Опишите, для кого или для чего нужен лендинг. Если в сообщении есть ссылки, агент сначала прочитает их, затем доберёт факты из поиска и вернёт HTML preview.',
  starter_prompts: [
    'Собери лендинг для эксперта: сначала прочитай ссылки из промпта, потом добери факты из веб-поиска и верни HTML preview',
    'Собери лендинг для компании по ссылке на сайт: сначала вытащи факты из сайта, затем оформи современный landing page',
    'Сделай необычный или шуточный лендинг по теме из промпта, но не придумывай неподтверждённые факты',
  ],
} as const;

async function syncLandingAgentTools(versionId: string) {
  await db.delete(agentVersionTools).where(eq(agentVersionTools.agent_version_id, versionId));

  const toolRows = await db
    .select({ id: toolDefinitions.id, slug: toolDefinitions.slug })
    .from(toolDefinitions)
    .where(and(
      or(
        eq(toolDefinitions.slug, 'web-search-cascade'),
        eq(toolDefinitions.slug, 'http-request'),
      ),
      eq(toolDefinitions.is_active, true),
    ));

  const bySlug = new Map(toolRows.map((row) => [row.slug, row.id]));
  const values = ['web-search-cascade', 'http-request']
    .map((slug, orderIndex) => {
      const toolDefinitionId = bySlug.get(slug);
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

export async function seedLandingBuilderWebSearchAgent() {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'admin@llmstore.pro'))
    .limit(1);

  if (!admin) {
    console.log('Skipping Landing Builder + Web Search seed: admin user not found');
    return;
  }

  const [existingAgent] = await db
    .select()
    .from(agents)
    .where(or(
      eq(agents.slug, LANDING_AGENT_SLUG),
      eq(agents.name, LANDING_AGENT_NAME),
      like(agents.slug, 'landing-builder%'),
    ))
    .limit(1);

  if (existingAgent) {
    await db
      .update(agents)
      .set({
        name: LANDING_AGENT_NAME,
        slug: LANDING_AGENT_SLUG,
        description: LANDING_AGENT_DESCRIPTION,
        visibility: 'public',
        status: 'active',
      })
      .where(eq(agents.id, existingAgent.id));

    const [version] = await db
      .insert(agentVersions)
      .values({
        agent_id: existingAgent.id,
        version_number: 2,
        runtime_engine: 'openrouter_chat',
        system_prompt: LANDING_AGENT_SYSTEM_PROMPT,
        response_mode: 'text',
        runtime_config: LANDING_AGENT_RUNTIME_CONFIG as unknown as Record<string, unknown>,
      })
      .onConflictDoUpdate({
        target: [agentVersions.agent_id, agentVersions.version_number],
        set: {
          runtime_engine: 'openrouter_chat',
          system_prompt: LANDING_AGENT_SYSTEM_PROMPT,
          response_mode: 'text',
          runtime_config: LANDING_AGENT_RUNTIME_CONFIG as unknown as Record<string, unknown>,
        },
      })
      .returning();

    await db.update(agents).set({ current_version_id: version.id }).where(eq(agents.id, existingAgent.id));
    await syncLandingAgentTools(version.id);
    console.log('Ensured Landing Builder + Web Search');
    return;
  }

  const [agent] = await db
    .insert(agents)
    .values({
      owner_user_id: admin.id,
      name: LANDING_AGENT_NAME,
      slug: LANDING_AGENT_SLUG,
      description: LANDING_AGENT_DESCRIPTION,
      visibility: 'public',
      status: 'active',
    })
    .returning();

  const [version] = await db
    .insert(agentVersions)
    .values({
      agent_id: agent.id,
      version_number: 2,
      runtime_engine: 'openrouter_chat',
      system_prompt: LANDING_AGENT_SYSTEM_PROMPT,
      response_mode: 'text',
      runtime_config: LANDING_AGENT_RUNTIME_CONFIG as unknown as Record<string, unknown>,
    })
    .returning();

  await db.update(agents).set({ current_version_id: version.id }).where(eq(agents.id, agent.id));
  await syncLandingAgentTools(version.id);
  console.log('Seeded Landing Builder + Web Search');
}
