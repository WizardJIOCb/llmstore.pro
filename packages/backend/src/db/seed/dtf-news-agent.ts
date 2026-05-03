import { eq } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { agents, agentVersions, agentVersionTools, toolDefinitions } from '../schema/agents.js';
import { users } from '../schema/auth.js';

const CLEAN_SYSTEM_PROMPT = `Ты — новостной помощник DTF.ru. Твоя задача — помогать пользователю получать и анализировать новости с сайта DTF.ru.

Возможности:
- получить список последних статей с DTF через инструмент dtf-latest-feed;
- получить популярные и обсуждаемые статьи за период через dtf-popular-feed;
- загрузить полный текст конкретной статьи по URL через dtf-article-fetch;
- сделать краткий пересказ статьи и ответить на вопросы по её содержанию.

Правила:
- всегда отвечай на русском языке;
- если пользователь просит новости по теме, игре, компании, человеку или ключевому слову (например: "Есть новости по Doom?"), не задавай уточняющих вопросов о том, что именно искать; считай указанную фразу темой поиска;
- если в тематическом запросе не указан период, ищи за всё доступное время: сначала вызывай dtf-popular-feed с sorting = "popular", period = "all", limit = 30, затем dtf-latest-feed с limit = 30, объедини результаты и отфильтруй материалы по теме в заголовке, сниппете, авторе или URL;
- если в тематическом запросе указан период, используй его без уточнений: "за день", "сегодня" или "за сутки" = period "day"; "за неделю" = "week"; "за месяц" = "month"; "за год" = "year"; "за всё время" = "all";
- если по теме ничего не найдено в доступной выборке, честно скажи, что доступные инструменты DTF не нашли материалов по этой теме, но не проси пользователя уточнить, имеет ли он в виду заголовки или саму игру/тему;
- если пользователь просит последние, свежие, новые или актуальные новости, всегда в текущем ответе сначала вызывай dtf-latest-feed, даже если похожий список уже был в этом чате раньше;
- если пользователь просит популярные, горячие или обсуждаемые материалы, всегда в текущем ответе сначала вызывай dtf-popular-feed с подходящими sorting и period, даже если похожий список уже был в этом чате раньше;
- повторный запрос новостей считай просьбой заново получить свежую выборку, а не дубликатом;
- никогда не отвечай фразами вроде "я уже показывал", "это дубликат запроса", "я уже предоставил список" или "хочешь что-то ещё?" вместо новой выборки, если пользователь снова просит новости;
- если пользователь не указал количество статей, показывай 10 позиций;
- при перечислении статей указывай заголовок, автора, дату публикации, ссылку, комментарии и реакции, если они доступны;
- если инструмент вернул reactions_summary или reactions_count, используй в ответе именно "Реакции", а не "Лайки";
- если инструмент вернул published_at, показывай дату публикации статьи в человекочитаемом виде;
- при пересказе выделяй суть, ключевые факты и интересные детали;
- если пользователь просит пересказать статью по названию, сначала найди нужный материал через ленту, затем загрузи текст через dtf-article-fetch.`;

const DTF_AGENT_DESCRIPTION =
  'AI-агент для получения и анализа новостей с DTF.ru. Умеет показывать свежие и популярные статьи, загружать полный текст и делать краткие пересказы.';

const DTF_AGENT_RUNTIME_CONFIG = {
  max_iterations: 6,
  temperature: 0.3,
  max_tokens: 4096,
};

const DTF_AGENT_VERSION_NUMBER = 6;

export async function seedDtfNewsAgent() {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'admin@llmstore.pro'))
    .limit(1);

  if (!admin) {
    console.log('Skipping DTF News Agent seed: admin user not found');
    return;
  }

  const dtfFeed = await db
    .select({ id: toolDefinitions.id })
    .from(toolDefinitions)
    .where(eq(toolDefinitions.slug, 'dtf-latest-feed'))
    .then((rows) => rows[0]);
  const dtfArticle = await db
    .select({ id: toolDefinitions.id })
    .from(toolDefinitions)
    .where(eq(toolDefinitions.slug, 'dtf-article-fetch'))
    .then((rows) => rows[0]);
  const dtfPopular = await db
    .select({ id: toolDefinitions.id })
    .from(toolDefinitions)
    .where(eq(toolDefinitions.slug, 'dtf-popular-feed'))
    .then((rows) => rows[0]);

  if (!dtfFeed || !dtfArticle || !dtfPopular) {
    console.log('Skipping DTF News Agent seed: DTF tools not found (run builtin tools seed first)');
    return;
  }

  const toolIds = [
    { id: dtfFeed.id, order: 0 },
    { id: dtfArticle.id, order: 1 },
    { id: dtfPopular.id, order: 2 },
  ];

  const [existing] = await db
    .select()
    .from(agents)
    .where(eq(agents.slug, 'dtf-news-agent'))
    .limit(1);

  if (existing) {
    const [version] = await db
      .insert(agentVersions)
      .values({
        agent_id: existing.id,
        version_number: DTF_AGENT_VERSION_NUMBER,
        runtime_engine: 'openrouter_chat',
        system_prompt: CLEAN_SYSTEM_PROMPT,
        response_mode: 'text',
        runtime_config: DTF_AGENT_RUNTIME_CONFIG,
      })
      .onConflictDoUpdate({
        target: [agentVersions.agent_id, agentVersions.version_number],
        set: {
          runtime_engine: 'openrouter_chat',
          system_prompt: CLEAN_SYSTEM_PROMPT,
          response_mode: 'text',
          runtime_config: DTF_AGENT_RUNTIME_CONFIG,
        },
      })
      .returning();

    await db
      .update(agents)
      .set({
        current_version_id: version.id,
        description: DTF_AGENT_DESCRIPTION,
      })
      .where(eq(agents.id, existing.id));

    for (const tool of toolIds) {
      await db
        .insert(agentVersionTools)
        .values({
          agent_version_id: version.id,
          tool_definition_id: tool.id,
          is_required: false,
          order_index: tool.order,
        })
        .onConflictDoNothing();
    }

    console.log('Ensured DTF News Agent v6 with 3 tools');
    return;
  }

  const [agent] = await db
    .insert(agents)
    .values({
      owner_user_id: admin.id,
      name: 'DTF News Agent',
      slug: 'dtf-news-agent',
      description: DTF_AGENT_DESCRIPTION,
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
      system_prompt: CLEAN_SYSTEM_PROMPT,
      response_mode: 'text',
      runtime_config: DTF_AGENT_RUNTIME_CONFIG,
    })
    .returning();

  await db
    .update(agents)
    .set({
      current_version_id: version.id,
      description: DTF_AGENT_DESCRIPTION,
    })
    .where(eq(agents.id, agent.id));

  for (const tool of toolIds) {
    await db.insert(agentVersionTools).values({
      agent_version_id: version.id,
      tool_definition_id: tool.id,
      is_required: false,
      order_index: tool.order,
    });
  }

  console.log('Seeded DTF News Agent with 3 tools');
}
