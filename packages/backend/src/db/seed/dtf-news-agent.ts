import { db } from '../../config/database.js';
import { agents, agentVersions, agentVersionTools, toolDefinitions } from '../schema/agents.js';
import { users } from '../schema/auth.js';
import { eq } from 'drizzle-orm';

const SYSTEM_PROMPT = `Ты — новостной помощник DTF.ru. Твоя задача — помогать пользователю получать и анализировать новости с сайта DTF.ru.

Возможности:
- Получить список последних статей с DTF (используй инструмент dtf-latest-feed)
- Получить популярные/обсуждаемые статьи за период (используй инструмент dtf-popular-feed)
  - sorting=hotness для актуальных горячих тем
  - sorting=popular для популярных статей
  - period: day/week/month/all для фильтрации по времени
- Загрузить полный текст конкретной статьи по URL (используй инструмент dtf-article-fetch)
- Сделать краткий пересказ статьи

Правила:
- Всегда отвечай на русском языке
- При перечислении статей указывай заголовок, автора, ссылку и статистику (комментарии, лайки)
- При пересказе выделяй ключевые моменты
- Если пользователь просит "последние новости" — используй dtf-latest-feed
- Если пользователь просит "популярные", "обсуждаемые", "с большим количеством комментариев" — используй dtf-popular-feed
- Если пользователь просит пересказать статью по названию — сначала найди её URL через dtf-latest-feed или dtf-popular-feed, затем загрузи текст через dtf-article-fetch
- При пересказе статьи выдели: суть, ключевые факты, интересные детали`;

export async function seedDtfNewsAgent() {
  // Find admin user
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, 'admin@llmstore.pro')).limit(1);
  if (!admin) {
    console.log('Skipping DTF News Agent seed: admin user not found');
    return;
  }

  // Find DTF tools
  const dtfFeed = await db.select({ id: toolDefinitions.id }).from(toolDefinitions).where(eq(toolDefinitions.slug, 'dtf-latest-feed')).then(r => r[0]);
  const dtfArticle = await db.select({ id: toolDefinitions.id }).from(toolDefinitions).where(eq(toolDefinitions.slug, 'dtf-article-fetch')).then(r => r[0]);
  const dtfPopular = await db.select({ id: toolDefinitions.id }).from(toolDefinitions).where(eq(toolDefinitions.slug, 'dtf-popular-feed')).then(r => r[0]);
  if (!dtfFeed || !dtfArticle || !dtfPopular) {
    console.log('Skipping DTF News Agent seed: DTF tools not found (run builtin tools seed first)');
    return;
  }

  const toolIds = [
    { id: dtfFeed.id, order: 0 },
    { id: dtfArticle.id, order: 1 },
    { id: dtfPopular.id, order: 2 },
  ];

  // Check if agent already exists
  const [existing] = await db.select().from(agents).where(eq(agents.slug, 'dtf-news-agent')).limit(1);

  if (existing) {
    // Update existing agent: create new version with updated prompt and tools
    const [version] = await db
      .insert(agentVersions)
      .values({
        agent_id: existing.id,
        version_number: 2,
        runtime_engine: 'openrouter_chat',
        system_prompt: SYSTEM_PROMPT,
        response_mode: 'text',
        runtime_config: {
          max_iterations: 6,
          temperature: 0.3,
          max_tokens: 4096,
        },
      })
      .returning();

    await db.update(agents).set({ current_version_id: version.id }).where(eq(agents.id, existing.id));

    for (const t of toolIds) {
      await db.insert(agentVersionTools).values({
        agent_version_id: version.id,
        tool_definition_id: t.id,
        is_required: false,
        order_index: t.order,
      }).onConflictDoNothing();
    }

    console.log('Updated DTF News Agent to v2 with 3 tools');
    return;
  }

  // Create new agent
  const [agent] = await db
    .insert(agents)
    .values({
      owner_user_id: admin.id,
      name: 'DTF News Agent',
      slug: 'dtf-news-agent',
      description: 'AI-агент для получения и анализа новостей с DTF.ru. Умеет получать ленту последних статей, популярные посты, загружать полный текст и делать краткие пересказы.',
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
      runtime_config: {
        max_iterations: 6,
        temperature: 0.3,
        max_tokens: 4096,
      },
    })
    .returning();

  await db.update(agents).set({ current_version_id: version.id }).where(eq(agents.id, agent.id));

  for (const t of toolIds) {
    await db.insert(agentVersionTools).values({
      agent_version_id: version.id,
      tool_definition_id: t.id,
      is_required: false,
      order_index: t.order,
    });
  }

  console.log('Seeded DTF News Agent with 3 tools');
}
