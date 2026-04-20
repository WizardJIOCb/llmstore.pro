import { and, eq, like, or } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { agents, agentVersions, agentVersionTools, toolDefinitions } from '../schema/agents.js';
import { users } from '../schema/auth.js';

const CREATIVE_AGENT_NAME = 'Creative Landing Builder';
const CREATIVE_AGENT_SLUG = 'creative-landing-builder';
const CREATIVE_AGENT_DESCRIPTION =
  'Креативный агент для лендингов: сначала собирает фактуру по ссылкам и поиску, а затем превращает её в более смелый, сюжетный и визуально выразительный HTML preview.';

const CREATIVE_AGENT_SYSTEM_PROMPT = `Ты — Creative Landing Builder для llmstore.pro.

Роль:
- собираешь creative-first landing pages, standalone HTML preview и экспериментальные посадочные страницы;
- если в сообщении есть ссылки, сначала читаешь их через HTTP Request;
- если данных не хватает, добираешь факты через Web Search Cascade;
- после этого не просто раскладываешь всё по шаблону, а придумываешь сильный концепт страницы, визуальный язык и драматургию.

Как работать:
1. Всегда отвечай на русском, если пользователь не попросил другой язык.
2. Если в промпте есть релевантные URL, сначала используй HTTP Request.
3. Если после чтения ссылок данных мало, используй Web Search Cascade.
4. Используй найденные факты как опорную базу, но для шуточных, мемных, сатирических, эпических и абсурдных лендингов разрешается художественная стилизация поверх фактов.
5. Не подменяй задачу стандартным SaaS-лендингом. Если пользователь хочет безумие, мемность, сюжет, персонажей, мир или сценки, это должно реально появиться в странице.
6. Не выдумывай телефон, email, адреса, цены, юридические факты и биографические утверждения как будто они реальны. Если это художественная вставка, она должна быть очевидно стилизованной, а не маскироваться под факт.
7. Для creative-задач сначала придумай концепт: какой это мир, какой тон, какие recurring jokes, какие визуальные мотивы, как развивается scroll-история.
8. Если запрос мемный, можно использовать гиперболу, персонажей, вымышленную драматургию, игровые механики, фейковые титулы и абсурдные сцены, но не ломай связь с исходной темой пользователя.
9. Предпочитай выразительные typography, неожиданную композицию, авторскую атмосферу, сценичность, таймеры, счётчики, диалоги, карточки-эпизоды, мини-лоры и сильные transition-секции, если это усиливает идею.
10. Для задач про landing или preview не пиши длинный markdown после ответа. Лучше сразу верни сильный dev-report с готовым HTML preview.

Response format:
- Верни сначала <dev-report>...</dev-report> с валидным JSON.
- Если задача про landing, preview, HTML page или лендинг, ничего не пиши после </dev-report>.

JSON schema inside <dev-report>:
{
  "summary": "краткий итог",
  "worklog": ["шаг 1", "шаг 2"],
  "notes": ["важная оговорка или художественное допущение"],
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

const CREATIVE_AGENT_RUNTIME_CONFIG = {
  max_iterations: 6,
  temperature: 0.45,
  max_tokens: 12288,
  model_external_id: 'anthropic/claude-sonnet-4.6',
  chat_intro: 'Опишите идею лендинга. Если дадите ссылки, агент сначала вытащит из них фактуру, а потом соберёт более смелый, сюжетный и визуально выразительный HTML preview.',
  starter_prompts: [
    'Сделай шуточный или мемный лендинг по теме из промпта: сначала прочитай ссылки, потом преврати фактуру в яркий creative landing',
    'Собери эпический storytelling-лендинг для человека, бренда или канала: исследуй факты, а затем оформи их как большое интернет-приключение',
    'Сделай очень необычный landing page с персонажами, визуальной драматургией и сильной атмосферой, но не притворяйся, что художественные вставки являются фактами',
  ],
} as const;

async function syncCreativeAgentTools(versionId: string) {
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

export async function seedCreativeLandingBuilderAgent() {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'admin@llmstore.pro'))
    .limit(1);

  if (!admin) {
    console.log('Skipping Creative Landing Builder seed: admin user not found');
    return;
  }

  const [existingAgent] = await db
    .select()
    .from(agents)
    .where(or(
      eq(agents.slug, CREATIVE_AGENT_SLUG),
      eq(agents.name, CREATIVE_AGENT_NAME),
      like(agents.slug, 'creative-landing%'),
    ))
    .limit(1);

  if (existingAgent) {
    await db
      .update(agents)
      .set({
        name: CREATIVE_AGENT_NAME,
        slug: CREATIVE_AGENT_SLUG,
        description: CREATIVE_AGENT_DESCRIPTION,
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
        system_prompt: CREATIVE_AGENT_SYSTEM_PROMPT,
        response_mode: 'text',
        runtime_config: CREATIVE_AGENT_RUNTIME_CONFIG as unknown as Record<string, unknown>,
      })
      .onConflictDoUpdate({
        target: [agentVersions.agent_id, agentVersions.version_number],
        set: {
          runtime_engine: 'openrouter_chat',
          system_prompt: CREATIVE_AGENT_SYSTEM_PROMPT,
          response_mode: 'text',
          runtime_config: CREATIVE_AGENT_RUNTIME_CONFIG as unknown as Record<string, unknown>,
        },
      })
      .returning();

    await db.update(agents).set({ current_version_id: version.id }).where(eq(agents.id, existingAgent.id));
    await syncCreativeAgentTools(version.id);
    console.log('Ensured Creative Landing Builder');
    return;
  }

  const [agent] = await db
    .insert(agents)
    .values({
      owner_user_id: admin.id,
      name: CREATIVE_AGENT_NAME,
      slug: CREATIVE_AGENT_SLUG,
      description: CREATIVE_AGENT_DESCRIPTION,
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
      system_prompt: CREATIVE_AGENT_SYSTEM_PROMPT,
      response_mode: 'text',
      runtime_config: CREATIVE_AGENT_RUNTIME_CONFIG as unknown as Record<string, unknown>,
    })
    .returning();

  await db.update(agents).set({ current_version_id: version.id }).where(eq(agents.id, agent.id));
  await syncCreativeAgentTools(version.id);
  console.log('Seeded Creative Landing Builder');
}
