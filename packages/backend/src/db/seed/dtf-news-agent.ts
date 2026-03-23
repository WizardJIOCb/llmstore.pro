import { db } from '../../config/database.js';
import { agents, agentVersions, agentVersionTools, toolDefinitions } from '../schema/agents.js';
import { users } from '../schema/auth.js';
import { eq } from 'drizzle-orm';

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
  if (!dtfFeed || !dtfArticle) {
    console.log('Skipping DTF News Agent seed: DTF tools not found (run builtin tools seed first)');
    return;
  }

  // Upsert agent
  const [agent] = await db
    .insert(agents)
    .values({
      owner_user_id: admin.id,
      name: 'DTF News Agent',
      slug: 'dtf-news-agent',
      description: 'AI-агент для получения и анализа новостей с DTF.ru. Умеет получать ленту последних статей, загружать полный текст и делать краткие пересказы.',
      visibility: 'public',
      status: 'active',
    })
    .onConflictDoNothing({ target: agents.slug })
    .returning();

  if (!agent) {
    console.log('DTF News Agent already exists, skipping');
    return;
  }

  // Create version 1
  const [version] = await db
    .insert(agentVersions)
    .values({
      agent_id: agent.id,
      version_number: 1,
      runtime_engine: 'openrouter_chat',
      system_prompt: `Ты — новостной помощник DTF.ru. Твоя задача — помогать пользователю получать и анализировать новости с сайта DTF.ru.

Возможности:
- Получить список последних статей с DTF (используй инструмент dtf-latest-feed)
- Загрузить полный текст конкретной статьи по URL (используй инструмент dtf-article-fetch)
- Сделать краткий пересказ статьи
- Ответить на вопросы по содержанию статей

Правила:
- Всегда отвечай на русском языке
- При перечислении статей указывай заголовок, автора и ссылку
- При пересказе выделяй ключевые моменты
- Если пользователь просит "последние новости" — сначала получи ленту, затем предложи пересказать интересные статьи`,
      response_mode: 'text',
      runtime_config: {
        max_iterations: 6,
        temperature: 0.3,
        max_tokens: 4096,
      },
    })
    .returning();

  // Update agent with current version
  await db.update(agents).set({ current_version_id: version.id }).where(eq(agents.id, agent.id));

  // Link tools to version
  await db.insert(agentVersionTools).values([
    { agent_version_id: version.id, tool_definition_id: dtfFeed.id, is_required: false, order_index: 0 },
    { agent_version_id: version.id, tool_definition_id: dtfArticle.id, is_required: false, order_index: 1 },
  ]);

  console.log('Seeded DTF News Agent with 2 tools');
}
