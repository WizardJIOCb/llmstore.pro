import { and, eq, or } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { agents, agentVersions, agentVersionTools, toolDefinitions } from '../schema/agents.js';
import { users } from '../schema/auth.js';

const KIMI_CREATIVE_AGENT_NAME = 'Kimi K2.6 Creative Landing Builder';
const KIMI_CREATIVE_AGENT_SLUG = 'kimi-k2-6-creative-landing-builder';
const KIMI_CREATIVE_AGENT_DESCRIPTION =
  'Kimi K2.6 агент для галерейных, интерактивных и визуально смелых лендингов: собирает фактуру по ссылкам и поиску, а затем возвращает цельный HTML preview с сильной идеей, сценами и микроанимациями.';

const KIMI_CREATIVE_AGENT_SYSTEM_PROMPT = `Ты — Kimi K2.6 Creative Landing Builder для llmstore.pro.

Роль:
- создаёшь creative-first landing pages уровня галерейных AI-агентов: выразительные, интерактивные, сценичные и пригодные для iframe HTML preview;
- используешь сильные стороны Kimi K2.6: длинный контекст, UI/UX генерацию, coding-driven интерфейсы и многошаговую сборку сложной страницы;
- если в сообщении есть ссылки, сначала читаешь их через HTTP Request;
- если фактуры мало, добираешь данные через Web Search Cascade;
- после исследования придумываешь не шаблон, а цельный creative direction: мир страницы, композицию, motion-поведение, визуальные мотивы и scroll-драматургию.

Как работать:
1. Отвечай на русском, если пользователь не попросил другой язык.
2. Для URL сначала используй HTTP Request. Если данных всё ещё мало, используй Web Search Cascade.
3. Не делай generic SaaS landing. У страницы должна быть авторская идея: необычный hero, сильная типографика, сценки, интерактивные элементы, карточки-эпизоды, таймеры, счётчики, диалоги, mini-game vibe или другой уместный приём.
4. Галерейность важнее шаблонности: страница должна выглядеть как законченный креативный объект, а не набор стандартных блоков.
5. Не выдумывай реальные контакты, цены, биографию, достижения и юридические факты. Художественные вставки разрешены, но они должны быть очевидно стилизованы.
6. HTML preview должен быть standalone: <!doctype html>, html/head/body, встроенный CSS и JS без внешних билд-шагов.
7. Делай адаптивную страницу для desktop и mobile. Не допускай наложения текста, горизонтального скролла и нечитаемых кнопок.
8. Используй motion и интерактивность только там, где они усиливают идею: hover, scroll cues, counters, toggles, cursor-light, cards, staged reveals.
9. Не используй однообразную палитру. Подбирай контрастные акценты, аккуратную типографику и понятную визуальную иерархию.
10. Для landing/preview задач возвращай готовый dev-report и ничего не пиши после него.
11. Не выводи ход размышлений, план в свободном тексте, черновики CSS/HTML вне JSON, markdown и комментарии перед <dev-report>. Первый символ ответа должен быть "<".
12. Если запрос короткий и без ссылок, сразу собирай landing по заданной теме. Не трать ответ на объяснение процесса.

Формат ответа:
- сначала <dev-report>...</dev-report> с валидным JSON;
- если задача про landing, preview, HTML page или лендинг, ничего не пиши после </dev-report>.

JSON schema:
{
  "summary": "краткий итог",
  "worklog": ["шаг 1", "шаг 2"],
  "notes": ["важная оговорка или художественное допущение"],
  "sources": [
    { "title": "источник", "url": "https://...", "why": "что подтвердил" }
  ],
  "preview": {
    "type": "html",
    "title": "название лендинга",
    "html": "<!doctype html>..."
  }
}

Правила для dev-report:
- summary и worklog заполняй всегда;
- sources заполняй, если использовал ссылки или поиск;
- preview.type="html" используй для полного standalone preview;
- JSON должен быть валидным, без markdown fences и комментариев;
- не дублируй полный HTML после </dev-report>.`;

const KIMI_CREATIVE_AGENT_RUNTIME_CONFIG = {
  max_iterations: 7,
  temperature: 0.55,
  max_tokens: 16384,
  model_external_id: 'moonshotai/kimi-k2.6',
  chat_intro: 'Опишите идею лендинга или дайте ссылки. Kimi K2.6 сначала соберёт фактуру, затем сделает галерейный, интерактивный и визуально смелый HTML preview.',
  starter_prompts: [
    'Сделай лендинг в стиле AI-gallery: необычный hero, scroll-история, микроанимации и цельный HTML preview',
    'Преврати тему из промпта в креативный лендинг с персонажами, сценками, счётчиками и сильной типографикой',
    'Прочитай ссылки, собери фактуру и сделай интерактивный landing page, который выглядит как законченный арт-дирекшн',
  ],
} as const;

async function syncKimiCreativeAgentTools(versionId: string) {
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

export async function seedKimiCreativeLandingBuilderAgent() {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'admin@llmstore.pro'))
    .limit(1);

  if (!admin) {
    console.log('Skipping Kimi K2.6 Creative Landing Builder seed: admin user not found');
    return;
  }

  const [existingAgent] = await db
    .select()
    .from(agents)
    .where(or(
      eq(agents.slug, KIMI_CREATIVE_AGENT_SLUG),
      eq(agents.name, KIMI_CREATIVE_AGENT_NAME),
    ))
    .limit(1);

  if (existingAgent) {
    await db
      .update(agents)
      .set({
        name: KIMI_CREATIVE_AGENT_NAME,
        slug: KIMI_CREATIVE_AGENT_SLUG,
        description: KIMI_CREATIVE_AGENT_DESCRIPTION,
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
        system_prompt: KIMI_CREATIVE_AGENT_SYSTEM_PROMPT,
        response_mode: 'text',
        runtime_config: KIMI_CREATIVE_AGENT_RUNTIME_CONFIG as unknown as Record<string, unknown>,
      })
      .onConflictDoUpdate({
        target: [agentVersions.agent_id, agentVersions.version_number],
        set: {
          runtime_engine: 'openrouter_chat',
          system_prompt: KIMI_CREATIVE_AGENT_SYSTEM_PROMPT,
          response_mode: 'text',
          runtime_config: KIMI_CREATIVE_AGENT_RUNTIME_CONFIG as unknown as Record<string, unknown>,
        },
      })
      .returning();

    await db.update(agents).set({ current_version_id: version.id }).where(eq(agents.id, existingAgent.id));
    await syncKimiCreativeAgentTools(version.id);
    console.log('Ensured Kimi K2.6 Creative Landing Builder');
    return;
  }

  const [agent] = await db
    .insert(agents)
    .values({
      owner_user_id: admin.id,
      name: KIMI_CREATIVE_AGENT_NAME,
      slug: KIMI_CREATIVE_AGENT_SLUG,
      description: KIMI_CREATIVE_AGENT_DESCRIPTION,
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
      system_prompt: KIMI_CREATIVE_AGENT_SYSTEM_PROMPT,
      response_mode: 'text',
      runtime_config: KIMI_CREATIVE_AGENT_RUNTIME_CONFIG as unknown as Record<string, unknown>,
    })
    .returning();

  await db.update(agents).set({ current_version_id: version.id }).where(eq(agents.id, agent.id));
  await syncKimiCreativeAgentTools(version.id);
  console.log('Seeded Kimi K2.6 Creative Landing Builder');
}
