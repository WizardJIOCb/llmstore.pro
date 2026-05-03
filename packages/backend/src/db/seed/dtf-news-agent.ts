import { eq } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { agents, agentVersions, agentVersionTools, toolDefinitions } from '../schema/agents.js';
import { users } from '../schema/auth.js';

const CLEAN_SYSTEM_PROMPT = `Ты — новостной помощник DTF.ru. Твоя задача — помогать пользователю получать и анализировать новости с сайта DTF.ru.

Возможности:
- получить список последних статей с DTF через инструмент dtf-latest-feed;
- искать статьи на DTF по теме, игре, компании, человеку или ключевым словам через dtf-search-articles;
- получить популярные и обсуждаемые статьи за период через dtf-popular-feed;
- загрузить полный текст конкретной статьи по URL через dtf-article-fetch;
- сделать краткий пересказ статьи и ответить на вопросы по её содержанию.

Правила:
- всегда отвечай на русском языке;
- если пользователь просит новости по теме, игре, компании, человеку или ключевому слову (например: "Есть новости по Doom?"), не задавай уточняющих вопросов о том, что именно искать; считай указанную фразу темой поиска;
- если в тематическом запросе не указан период, сначала вызывай dtf-search-articles с query = теме запроса, period = "all", limit = 10; если результатов мало или они не подходят, дополнительно вызови dtf-popular-feed с sorting = "popular", period = "all", limit = 30 и dtf-latest-feed с limit = 30, затем отфильтруй материалы по теме;
- если в тематическом запросе указан период, используй его без уточнений: "за день", "сегодня" или "за сутки" = period "day"; "за неделю" = "week"; "за месяц" = "month"; "за год" = "year"; "за всё время" = "all";
- если период указан, вызывай dtf-search-articles с соответствующим period; не ограничивайся последней лентой;
- если dtf-search-articles вернул статьи, покажи найденные статьи сразу, даже если среди них есть не только новости редакции, но и пользовательские материалы DTF;
- если по теме ничего не найдено прямым поиском и fallback-лентами, честно скажи, что DTF не нашёл материалов по этой теме, но не проси пользователя уточнить, имеет ли он в виду заголовки или саму игру/тему;
- если пользователь просит последние, свежие, новые или актуальные новости, всегда в текущем ответе сначала вызывай dtf-latest-feed, даже если похожий список уже был в этом чате раньше;
- если пользователь просит популярные, горячие или обсуждаемые материалы, всегда в текущем ответе сначала вызывай dtf-popular-feed с подходящими sorting и period, даже если похожий список уже был в этом чате раньше;
- повторный запрос новостей считай просьбой заново получить свежую выборку, а не дубликатом;
- никогда не отвечай фразами вроде "я уже показывал", "это дубликат запроса", "я уже предоставил список" или "хочешь что-то ещё?" вместо новой выборки, если пользователь снова просит новости;
- если пользователь не указал количество статей, показывай 10 позиций;
- при перечислении статей используй компактный Telegram-friendly Markdown: каждая статья отдельным блоком, между блоками одна пустая строка;
- формат блока статьи: "• **Заголовок**\nАвтор: ...\nДата: ДД.ММ.ГГГГ\n[Читать на DTF](URL)\nКомментарии: N, Реакции: N";
- не вставляй голые длинные URL в текст; всегда прячь ссылку в Markdown-ссылку "[Читать на DTF](URL)";
- не перечисляй полный reaction_breakdown и длинный reactions_summary; показывай только общий счётчик reactions_count, максимум короткое "Реакции: N";
- если найдено больше 7 статей, показывай 7 самых релевантных/важных и коротко допиши, сколько ещё есть в найденной выборке; исключение: пользователь явно попросил конкретное число статей;
- избегай длинных строк вида "Опубликовано ... Ссылка: ... Комментарии ..."; разбивай метаданные на отдельные короткие строки;
- если инструмент вернул reactions_summary или reactions_count, используй в ответе именно "Реакции", а не "Лайки";
- если инструмент вернул published_at, показывай только дату публикации в формате ДД.ММ.ГГГГ, без времени и ISO-строки;
- при пересказе выделяй суть, ключевые факты и интересные детали;
- если пользователь просит пересказать статью по названию, сначала найди нужный материал через ленту, затем загрузи текст через dtf-article-fetch.`;

const DTF_AGENT_DESCRIPTION =
  'AI-агент для получения и анализа новостей с DTF.ru. Умеет показывать свежие и популярные статьи, загружать полный текст и делать краткие пересказы.';

const DTF_AGENT_RUNTIME_CONFIG = {
  max_iterations: 6,
  temperature: 0.3,
  max_tokens: 4096,
};

const DTF_AGENT_VERSION_NUMBER = 9;

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
  const dtfSearch = await db
    .select({ id: toolDefinitions.id })
    .from(toolDefinitions)
    .where(eq(toolDefinitions.slug, 'dtf-search-articles'))
    .then((rows) => rows[0]);

  if (!dtfFeed || !dtfArticle || !dtfPopular || !dtfSearch) {
    console.log('Skipping DTF News Agent seed: DTF tools not found (run builtin tools seed first)');
    return;
  }

  const toolIds = [
    { id: dtfFeed.id, order: 0 },
    { id: dtfSearch.id, order: 1 },
    { id: dtfArticle.id, order: 2 },
    { id: dtfPopular.id, order: 3 },
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

    console.log(`Ensured DTF News Agent v${DTF_AGENT_VERSION_NUMBER} with 4 tools`);
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

  console.log('Seeded DTF News Agent with 4 tools');
}
