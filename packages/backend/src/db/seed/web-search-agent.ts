import { and, eq, like, or } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { agents, agentVersions, agentVersionTools, toolDefinitions } from '../schema/agents.js';
import { users } from '../schema/auth.js';

const SEARCH_AGENT_NAME = 'WEB Поиск';
const SEARCH_AGENT_DESCRIPTION =
  'Ищет актуальную информацию в интернете через каскад бесплатных поисковых провайдеров, кратко сравнивает источники и даёт прямые ссылки.';

const SEARCH_AGENT_SYSTEM_PROMPT = `Ты — поисковый агент для llmstore.pro.

Твоя задача:
- находить актуальную информацию в интернете по запросу пользователя;
- использовать инструмент web-search-cascade для поиска;
- сравнивать найденные источники и выбирать наиболее полезные;
- всегда указывать прямые ссылки на найденные материалы, если инструмент вернул results[].url.

Что важно про инструмент web-search-cascade:
- он возвращает массив results;
- у каждого результата есть title, url, snippet, source, published_at;
- поле url — это прямая ссылка на найденный материал;
- если results не пустой, нельзя говорить, что инструмент "не возвращает URL" или что ты "не можешь дать ссылку".

Обязательные правила:
1. Для запросов, где нужна актуальная информация, всегда сначала используй web-search-cascade.
2. Если пользователь просит "дай ссылку", "скинь ссылку", "открой источник", "дай видео", "дай Rutube/YouTube-ссылку", сначала выведи 1-3 самых релевантных прямых URL из results[].url.
3. Если подходящих результатов несколько, дай короткий список со ссылками и пояснением, что именно по каждой ссылке находится.
4. Если в results есть точное совпадение по названию, отдавай ссылку на него в первую очередь.
5. Если results пустой, только тогда честно скажи, что надёжных результатов нет, и предложи переформулировать запрос.
6. Не придумывай ссылки и не подменяй их доменами без пути, если инструмент уже вернул точный url.
7. Отвечай кратко, структурированно и на русском языке.

Формат ответа:
- если пользователь просит именно ссылку: сначала строка "Вот ссылка:" или "Вот несколько ссылок:";
- затем markdown-список вида [название](https://...);
- после списка 1-2 короткие строки пояснения;
- если нужен общий обзор, сначала короткий вывод, потом список источников со ссылками.

Никогда не отвечай фразами вроде:
- "инструмент не возвращает URL";
- "я не могу дать ссылку напрямую";
- "воспользуйтесь поисковиком сами",
если web-search-cascade уже вернул results с полем url.`;

const SEARCH_AGENT_RUNTIME_CONFIG = {
  max_iterations: 4,
  temperature: 0.2,
  max_tokens: 4096,
  model_external_id: 'google/gemini-2.5-flash',
  chat_intro: 'Ищу актуальную информацию в интернете, сравниваю результаты и сразу даю прямые ссылки на лучшие источники.',
  starter_prompts: [
    'Найди в интернете самое важное по Трампу',
    'Собери главное по последним новостям об OpenAI',
    'Найди лучшие источники по теме и кратко сравни их',
  ],
} as const;

export async function seedWebSearchAgent() {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'admin@llmstore.pro'))
    .limit(1);

  if (!admin) {
    console.log('Skipping Web Search Agent seed: admin user not found');
    return;
  }

  const [searchTool] = await db
    .select({ id: toolDefinitions.id })
    .from(toolDefinitions)
    .where(and(eq(toolDefinitions.slug, 'web-search-cascade'), eq(toolDefinitions.is_active, true)))
    .limit(1);

  if (!searchTool) {
    console.log('Skipping Web Search Agent seed: web-search-cascade tool not found');
    return;
  }

  const [existingAgent] = await db
    .select()
    .from(agents)
    .where(or(
      eq(agents.slug, 'web-search-agent'),
      eq(agents.name, SEARCH_AGENT_NAME),
      like(agents.slug, 'poisk-v-yandekse%'),
      like(agents.slug, 'web-poisk%'),
    ))
    .limit(1);

  if (existingAgent) {
    await db
      .update(agents)
      .set({
        name: existingAgent.name?.trim() ? existingAgent.name : SEARCH_AGENT_NAME,
        description: SEARCH_AGENT_DESCRIPTION,
        visibility: 'public',
        status: 'active',
      })
      .where(eq(agents.id, existingAgent.id));

    if (existingAgent.current_version_id) {
      await db
        .update(agentVersions)
        .set({
          runtime_engine: 'openrouter_chat',
          system_prompt: SEARCH_AGENT_SYSTEM_PROMPT,
          response_mode: 'text',
          runtime_config: SEARCH_AGENT_RUNTIME_CONFIG as unknown as Record<string, unknown>,
        })
        .where(eq(agentVersions.id, existingAgent.current_version_id));

      await db
        .delete(agentVersionTools)
        .where(eq(agentVersionTools.agent_version_id, existingAgent.current_version_id));

      await db.insert(agentVersionTools).values({
        agent_version_id: existingAgent.current_version_id,
        tool_definition_id: searchTool.id,
        is_required: false,
        order_index: 0,
      });

      console.log('Ensured existing search agent uses web-search-cascade');
      return;
    }

    const [version] = await db
      .insert(agentVersions)
      .values({
        agent_id: existingAgent.id,
        version_number: 1,
        runtime_engine: 'openrouter_chat',
        system_prompt: SEARCH_AGENT_SYSTEM_PROMPT,
        response_mode: 'text',
        runtime_config: SEARCH_AGENT_RUNTIME_CONFIG as unknown as Record<string, unknown>,
      })
      .returning();

    await db.update(agents).set({ current_version_id: version.id }).where(eq(agents.id, existingAgent.id));
    await db.insert(agentVersionTools).values({
      agent_version_id: version.id,
      tool_definition_id: searchTool.id,
      is_required: false,
      order_index: 0,
    });

    console.log('Ensured search agent with a fresh version');
    return;
  }

  const [agent] = await db
    .insert(agents)
    .values({
      owner_user_id: admin.id,
      name: SEARCH_AGENT_NAME,
      slug: 'web-search-agent',
      description: SEARCH_AGENT_DESCRIPTION,
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
      system_prompt: SEARCH_AGENT_SYSTEM_PROMPT,
      response_mode: 'text',
      runtime_config: SEARCH_AGENT_RUNTIME_CONFIG as unknown as Record<string, unknown>,
    })
    .returning();

  await db.update(agents).set({ current_version_id: version.id }).where(eq(agents.id, agent.id));
  await db.insert(agentVersionTools).values({
    agent_version_id: version.id,
    tool_definition_id: searchTool.id,
    is_required: false,
    order_index: 0,
  });

  console.log('Seeded Web Search Agent');
}
