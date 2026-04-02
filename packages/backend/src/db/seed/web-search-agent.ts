import { and, eq, like, or } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { agents, agentVersions, agentVersionTools, toolDefinitions } from '../schema/agents.js';
import { users } from '../schema/auth.js';

const SEARCH_AGENT_NAME = 'Поиск в яндексе';
const SEARCH_AGENT_DESCRIPTION =
  'Ищет информацию в интернете через каскад бесплатных поисковых провайдеров, собирает главное по запросу и даёт ссылки на лучшие источники.';
const SEARCH_AGENT_SYSTEM_PROMPT = `Ты — поисковый агент для llmstore.pro.

Твоя задача:
- находить актуальную информацию в интернете по запросу пользователя;
- использовать инструмент web-search-cascade для поиска;
- сравнивать найденные источники и выбирать наиболее полезные для конкретного запроса;
- отвечать кратко, структурировано и на русском языке.

Правила работы:
1. Для запросов, где нужна актуальная информация, всегда сначала используй web-search-cascade.
2. Если инструмент вернул несколько результатов, выделяй 3-5 самых полезных и объясняй, почему они важны.
3. Если инструмент показал, что часть провайдеров недоступна, можешь кратко упомянуть это, но не перегружай ответ техническими деталями.
4. Если результаты пустые, честно скажи, что поиск не дал надёжной выдачи, и предложи переформулировать запрос.
5. Не выдумывай факты, если инструмент их не вернул.

Формат ответа:
- сначала короткий вывод;
- затем список найденных источников с коротким пояснением;
- в конце укажи, какой источник выглядит самым полезным именно под запрос пользователя.`;

const SEARCH_AGENT_RUNTIME_CONFIG = {
  max_iterations: 4,
  temperature: 0.2,
  max_tokens: 4096,
  model_external_id: 'google/gemini-2.5-flash',
  chat_intro: 'Ищу актуальную информацию в интернете через каскад бесплатных провайдеров и собираю короткое саммари с лучшими ссылками.',
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
    ))
    .limit(1);

  if (existingAgent) {
    await db
      .update(agents)
      .set({
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
