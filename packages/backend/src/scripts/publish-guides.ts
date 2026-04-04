import { eq, inArray } from 'drizzle-orm';
import { db } from '../config/database.js';
import {
  catalogItems,
  catalogItemMeta,
  catalogItemCategories,
  catalogItemTags,
  catalogItemUseCases,
  categories,
  tags,
  useCases,
  users,
} from '../db/schema/index.js';

type GuideSeed = {
  title: string;
  slug: string;
  short_description: string;
  full_description: string;
  seo_title: string;
  seo_description: string;
  curated_score: number;
  featured: boolean;
  category_slugs: string[];
  tag_slugs: string[];
  use_case_slugs: string[];
  meta: {
    pricing_type: 'free';
    deployment_type: 'cloud' | 'hybrid' | 'self_hosted' | 'local';
    privacy_type: 'public_api' | 'private';
    language_support: 'ru';
    difficulty: 'beginner' | 'intermediate';
    readiness: 'template' | 'deployable';
    vendor_name: string;
  };
};

const guideCategories = [
  { name: 'Начало работы', slug: 'getting-started' },
  { name: 'Чаты и сценарии', slug: 'chat-workflows' },
  { name: 'Агенты и настройка', slug: 'agents-setup' },
  { name: 'Лендинги и preview', slug: 'landing-pages' },
  { name: 'Telegram и deployment', slug: 'telegram-deployments' },
  { name: 'Галерея и запуски', slug: 'gallery-launches' },
];

const guides: GuideSeed[] = [
  {
    title: 'Быстрый старт в LLMStore.pro: что нажимать в первые 10 минут',
    slug: 'llmstore-quick-start',
    short_description: 'Пошаговый старт для нового пользователя: регистрация, баланс, первые чаты, агенты и где вообще лучше начинать.',
    full_description: `Если вы только открыли LLMStore.pro, не пытайтесь сразу разобраться во всём. Лучший путь — пройти платформу короткими шагами и быстро получить первый результат.

Шаг 1. Зайдите в профиль и проверьте, что у вас заполнены базовые данные.
Так вам будет проще потом ориентироваться в активности, рейтинге, истории запусков и связанных аккаунтах.

Шаг 2. Откройте раздел чатов.
Чаты — это самый быстрый способ понять, как работает платформа. Здесь вы можете просто написать задачу, проверить стиль ответа модели, попробовать идеи для лендинга или проекта и понять, чего вам не хватает.

Шаг 3. Сформулируйте один простой прикладной запрос.
Например:
- сделай структуру лендинга
- помоги написать Telegram-бота
- придумай агента для поддержки клиентов
- собери промпт для контент-менеджера

Шаг 4. Если обычного чата уже не хватает, переходите в раздел агентов.
Агент нужен тогда, когда вы хотите не просто один ответ, а повторяемое поведение: стиль, инструкции, набор инструментов и готовые сценарии.

Шаг 5. Если получили удачный результат, не теряйте его.
Сохраняйте удачные чаты, публикуйте превью, смотрите галерею и фиксируйте хорошие формулировки запросов.

Что важно понимать с самого начала:
- чат — это быстрый тест идеи
- агент — это повторяемый сценарий под задачу
- preview и лендинг — это уже визуальный результат, который можно дорабатывать
- deployment нужен, когда вы хотите вынести результат наружу, например в webhook или Telegram

Лучший первый маршрут для большинства пользователей:
- сначала чат
- потом агент
- потом preview или deploy

Если хотите быстро почувствовать пользу платформы, не пытайтесь строить идеальную систему с первого запроса. Намного лучше получить один живой результат за 10 минут, а потом уже улучшать его шаг за шагом.`,
    seo_title: 'Быстрый старт в LLMStore.pro',
    seo_description: 'Как быстро начать работать в LLMStore.pro: чаты, агенты, лендинги, деплой и первые результаты.',
    curated_score: 98,
    featured: true,
    category_slugs: ['getting-started'],
    tag_slugs: ['chat', 'agent'],
    use_case_slugs: ['chat', 'automation'],
    meta: {
      pricing_type: 'free',
      deployment_type: 'cloud',
      privacy_type: 'public_api',
      language_support: 'ru',
      difficulty: 'beginner',
      readiness: 'template',
      vendor_name: 'LLMStore.pro',
    },
  },
  {
    title: 'Как пользоваться чатами в LLMStore.pro и получать лучший результат',
    slug: 'how-to-use-chats-effectively',
    short_description: 'Практический гайд по чатам: как задавать запросы, когда продолжать диалог, а когда лучше создавать новый чат.',
    full_description: `Чаты в LLMStore.pro — это не просто окно для сообщений. Это рабочее пространство, где вы можете постепенно уточнять задачу и доводить результат до нужного качества.

Главное правило: один чат — одна цель.
Если вы начали делать лендинг, не превращайте тот же чат потом в сценарий для Telegram-бота. Намного удобнее держать отдельные ветки под разные задачи.

Как писать хороший первый запрос:
- коротко опишите цель
- укажите, что нужно получить на выходе
- добавьте ограничения по стилю, тону или формату

Плохой пример:
сделай что-нибудь для сайта

Хороший пример:
сделай структуру лендинга для Telegram-бота, который помогает записываться на консультацию, стиль — современный, короткие блоки, с акцентом на конверсию

Когда стоит продолжать текущий чат:
- если вы дорабатываете тот же результат
- если хотите уточнить структуру, текст, дизайн или логику
- если нужно внести правки по уже сгенерированному ответу

Когда лучше открыть новый чат:
- если задача уже другая
- если контекст переполнился лишними деталями
- если вы хотите сравнить два разных подхода

Как получать более точный ответ:
- просите сначала структуру, потом детали
- делите большие задачи на шаги
- после первого результата давайте чёткие правки
- пишите, что именно не устроило: слишком длинно, слишком формально, мало конкретики, слабый оффер, не тот тон

Если чат дал хороший ответ, используйте его как базу для следующего этапа:
- превратить результат в preview
- создать из сценария агента
- подготовить проект к deployment

Самая частая ошибка пользователей — просить сразу всё. Гораздо лучше идти итерациями: сначала каркас, потом улучшение, потом финальная упаковка.`,
    seo_title: 'Как пользоваться чатами в LLMStore.pro',
    seo_description: 'Пошаговый гайд по чатам в LLMStore.pro: как писать запросы, продолжать диалог и получать лучший результат.',
    curated_score: 95,
    featured: true,
    category_slugs: ['chat-workflows'],
    tag_slugs: ['chat', 'content'],
    use_case_slugs: ['chat', 'content'],
    meta: {
      pricing_type: 'free',
      deployment_type: 'cloud',
      privacy_type: 'public_api',
      language_support: 'ru',
      difficulty: 'beginner',
      readiness: 'template',
      vendor_name: 'LLMStore.pro',
    },
  },
  {
    title: 'Как создать агента, который отвечает именно так, как вам нужно',
    slug: 'create-agent-with-custom-style',
    short_description: 'Как собрать агента под себя: роль, тон, правила ответа, стартовые промпты и повторяемое поведение.',
    full_description: `Агент в LLMStore.pro нужен тогда, когда вы хотите получить не разовый ответ, а стабильное поведение под конкретную задачу.

Сильный агент обычно строится на четырёх вещах:
- понятная роль
- чёткий формат ответа
- ограничения на стиль
- реальные сценарии использования

Что нужно определить до создания агента:
- для кого он работает
- какую задачу решает
- как должен звучать
- что он не должен делать

Примеры хороших ролей:
- редактор, который упаковывает тексты под Telegram
- менеджер, который вежливо отвечает клиентам
- технический помощник, который объясняет коротко и без воды
- лендинг-агент, который сначала собирает структуру, а потом делает preview

Если хотите получить нужный стиль, не пишите абстрактно “отвечай хорошо”. Лучше задайте параметры:
- коротко или подробно
- формально или дружелюбно
- с примерами или без
- с акцентом на продажу, на пользу или на экспертность

Хорошо работают явные правила:
- не использовать канцелярит
- не растягивать вводные абзацы
- давать сначала решение, потом объяснение
- предлагать 2–3 варианта, если задача неоднозначная

После создания агента не считайте работу завершённой.
Лучший способ довести его до качества — открыть чат с этим агентом и прогнать через реальные кейсы:
- типичный запрос
- неудобный запрос
- конфликтный запрос
- короткий запрос без контекста

Если агент отвечает не так, как хочется:
- уточните системное описание роли
- сократите лишние инструкции
- добавьте конкретные примеры желаемого результата
- уберите взаимоисключающие требования

Правильный агент — это не тот, у которого самая длинная инструкция. Это тот, который стабильно даёт предсказуемый результат на ваших реальных сценариях.`,
    seo_title: 'Как создать агента под себя в LLMStore.pro',
    seo_description: 'Гайд по созданию агента с нужным стилем ответа, ролью, ограничениями и предсказуемым поведением.',
    curated_score: 97,
    featured: true,
    category_slugs: ['agents-setup'],
    tag_slugs: ['agent', 'tool-calling'],
    use_case_slugs: ['agentic-workflows', 'automation'],
    meta: {
      pricing_type: 'free',
      deployment_type: 'cloud',
      privacy_type: 'public_api',
      language_support: 'ru',
      difficulty: 'intermediate',
      readiness: 'template',
      vendor_name: 'LLMStore.pro',
    },
  },
  {
    title: 'Как делать сильные лендинги через чат и preview',
    slug: 'best-way-to-create-landing-pages',
    short_description: 'Практика по созданию лендингов: как ставить задачу, какие данные давать и как дорабатывать preview до сильного результата.',
    full_description: `В LLMStore.pro лендинг лучше всего собирать не с попытки “сразу сделать идеально”, а через несколько быстрых проходов.

Лучший порядок такой:
- сначала дать задачу и цель страницы
- потом получить структуру блоков
- потом доработать тексты
- только после этого доводить визуальную часть и preview

Что стоит дать в первом запросе:
- кто продукт или человек
- для кого лендинг
- какое целевое действие нужно
- какой образ должен быть у страницы

Хороший запрос:
сделай лендинг для эксперта по внедрению AI в бизнес, аудитория — собственники малого бизнеса, цель — заявка на консультацию, стиль — уверенный, современный, без перегруза

Если данных мало, просите сначала draft-структуру.
Если данных достаточно, просите сразу:
- hero-блок
- оффер
- блок выгод
- кейсы
- FAQ
- CTA

Что чаще всего улучшает лендинг сильнее всего:
- конкретный оффер вместо общих слов
- короткие блоки вместо длинных полотен
- понятный CTA
- реальная сегментация по аудитории
- меньше “мы лучшие”, больше пользы и результата

Когда preview уже собран, правки лучше давать точечно:
- сделай hero сильнее
- сократи блок преимуществ в два раза
- добавь больше воздуха и контраста
- перепиши CTA под запись на созвон
- сделай страницу более дорогой визуально

Если вы хотите именно хороший лендинг, а не просто технически сгенерированную страницу, не бойтесь делать 3–5 итераций. Обычно лучший результат появляется не на первом запросе, а после двух-трёх точных правок по содержанию и композиции.`,
    seo_title: 'Как сделать хороший лендинг в LLMStore.pro',
    seo_description: 'Как создавать сильные лендинги через чат и preview: структура, оффер, блоки, правки и лучший рабочий процесс.',
    curated_score: 94,
    featured: false,
    category_slugs: ['landing-pages'],
    tag_slugs: ['content', 'chat'],
    use_case_slugs: ['content', 'chat'],
    meta: {
      pricing_type: 'free',
      deployment_type: 'cloud',
      privacy_type: 'public_api',
      language_support: 'ru',
      difficulty: 'beginner',
      readiness: 'deployable',
      vendor_name: 'LLMStore.pro',
    },
  },
  {
    title: 'Как быстро добавить и задеплоить Telegram-бота через LLMStore.pro',
    slug: 'fast-telegram-bot-deploy',
    short_description: 'Пошаговый путь для быстрого Telegram deployment: что подготовить, где включить webhook и как проверить, что бот реально работает.',
    full_description: `Если у вас уже есть проект или генерация кода внутри чата, LLMStore.pro позволяет довольно быстро довести его до рабочего Telegram deployment.

Что нужно подготовить заранее:
- Telegram bot token
- понимание, какой сценарий должен выполнять бот
- переменные окружения, если бот использует внешние API

Общий сценарий выглядит так:
- собрать или доработать проект в чате
- открыть управление deployment
- заполнить env-переменные
- при необходимости связать deploy с агентом
- запустить deploy
- если это Telegram webhook, включить установку webhook

Перед запуском проверьте:
- токен без лишних пробелов
- все обязательные переменные окружения заполнены
- проект действительно рассчитан на webhook-сценарий

После запуска стоит проверить три вещи:
- deployment перешёл в рабочий статус
- в логах нет ошибок старта
- Telegram webhook установлен корректно

Если бот не отвечает, чаще всего причина одна из этих:
- не проставлен bot token
- отсутствует нужная env-переменная
- проект не слушает нужную точку входа
- webhook не переустановился после обновления deployment

Что делать в таком случае:
- открыть логи deployment
- проверить env
- переустановить webhook
- перезапустить deployment после правок

Хорошая практика — сначала сделать минимально рабочую версию бота:
- одно действие
- один понятный сценарий
- короткий и проверяемый ответ

Только после этого уже добавлять сложную логику, интеграции и длинные цепочки действий. Так вы быстрее получаете рабочий результат и не теряете время на отладку всего сразу.`,
    seo_title: 'Как быстро задеплоить Telegram-бота в LLMStore.pro',
    seo_description: 'Гайд по быстрому deployment Telegram-бота через LLMStore.pro: webhook, env-переменные, логи и проверка запуска.',
    curated_score: 93,
    featured: false,
    category_slugs: ['telegram-deployments'],
    tag_slugs: ['telegram', 'agent', 'api'],
    use_case_slugs: ['telegram-bots', 'automation'],
    meta: {
      pricing_type: 'free',
      deployment_type: 'cloud',
      privacy_type: 'public_api',
      language_support: 'ru',
      difficulty: 'intermediate',
      readiness: 'deployable',
      vendor_name: 'LLMStore.pro',
    },
  },
  {
    title: 'Как использовать галерею, runnable projects и повторять удачные запуски',
    slug: 'gallery-runnable-projects-guide',
    short_description: 'Как смотреть галерею с пользой, запускать runnable projects и быстро переходить к исходному чату для доработки.',
    full_description: `Галерея в LLMStore.pro — это не просто витрина красивых результатов. Это быстрый способ понять, что уже можно делать на платформе, и повторить удачный сценарий под свою задачу.

Как использовать галерею правильно:
- смотреть не только на визуал, но и на тип результата
- обращать внимание, это просто preview или runnable project
- запускать интересные сценарии и сравнивать результат со своей задачей

Runnable project полезен тогда, когда вы хотите не просто посмотреть итог, а реально попробовать запуск и понять, подходит ли вам такой подход.

Хороший сценарий работы с галереей:
- находите похожий пример
- запускаете runnable project
- оцениваете, насколько это близко к вашей задаче
- переходите в исходный чат и дорабатываете уже в контексте

Если результат понравился, не обязательно строить всё заново. Проще перейти в чат, где это запускалось, и использовать его как рабочую базу.

Когда галерея особенно полезна:
- вы не знаете, с чего начать
- хотите быстро показать пример команде или клиенту
- ищете рабочую форму лендинга, preview или проекта
- хотите сравнить несколько подходов перед своим запуском

Чтобы галерея приносила максимум пользы:
- сохраняйте удачные идеи
- отслеживайте, какие формулировки приводят к лучшим результатам
- не копируйте слепо, а адаптируйте под свою задачу

Лучшее использование галереи — не смотреть пассивно, а брать понравившийся результат как стартовую точку для собственного, более точного и сильного решения.`,
    seo_title: 'Как использовать галерею и runnable projects в LLMStore.pro',
    seo_description: 'Пошаговый гайд по галерее, runnable projects и повторению удачных сценариев через исходные чаты.',
    curated_score: 91,
    featured: false,
    category_slugs: ['gallery-launches', 'chat-workflows'],
    tag_slugs: ['chat', 'content'],
    use_case_slugs: ['chat', 'automation'],
    meta: {
      pricing_type: 'free',
      deployment_type: 'cloud',
      privacy_type: 'public_api',
      language_support: 'ru',
      difficulty: 'beginner',
      readiness: 'template',
      vendor_name: 'LLMStore.pro',
    },
  },
];

async function ensureCategories() {
  for (const category of guideCategories) {
    await db
      .insert(categories)
      .values({ ...category, parent_id: null })
      .onConflictDoNothing({ target: categories.slug });
  }
}

async function getAdminUserId() {
  const [adminByEmail] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'admin@llmstore.pro'))
    .limit(1);

  if (adminByEmail?.id) return adminByEmail.id;

  const [fallbackAdmin] = await db
    .select({ id: users.id })
    .from(users)
    .limit(1);

  if (!fallbackAdmin?.id) {
    throw new Error('No users found to assign as author');
  }

  return fallbackAdmin.id;
}

async function getCategoryIds(slugs: string[]): Promise<string[]> {
  if (slugs.length === 0) return [];
  const rows = await db
    .select({ id: categories.id, slug: categories.slug })
    .from(categories)
    .where(inArray(categories.slug, slugs));

  const idMap = new Map(rows.map((row) => [row.slug, row.id]));
  return slugs.map((slug) => idMap.get(slug)).filter((value): value is string => Boolean(value));
}

async function getTagIds(slugs: string[]): Promise<string[]> {
  if (slugs.length === 0) return [];
  const rows = await db
    .select({ id: tags.id, slug: tags.slug })
    .from(tags)
    .where(inArray(tags.slug, slugs));

  const idMap = new Map(rows.map((row) => [row.slug, row.id]));
  return slugs.map((slug) => idMap.get(slug)).filter((value): value is string => Boolean(value));
}

async function getUseCaseIds(slugs: string[]): Promise<string[]> {
  if (slugs.length === 0) return [];
  const rows = await db
    .select({ id: useCases.id, slug: useCases.slug })
    .from(useCases)
    .where(inArray(useCases.slug, slugs));

  const idMap = new Map(rows.map((row) => [row.slug, row.id]));
  return slugs.map((slug) => idMap.get(slug)).filter((value): value is string => Boolean(value));
}

async function upsertGuide(guide: GuideSeed, authorUserId: string) {
  const now = new Date();
  const [existing] = await db
    .select({ id: catalogItems.id })
    .from(catalogItems)
    .where(eq(catalogItems.slug, guide.slug))
    .limit(1);

  let itemId = existing?.id;

  if (itemId) {
    await db
      .update(catalogItems)
      .set({
        type: 'guide',
        title: guide.title,
        short_description: guide.short_description,
        full_description: guide.full_description,
        status: 'published',
        visibility: 'public',
        author_user_id: authorUserId,
        curated_score: guide.curated_score,
        featured: guide.featured,
        seo_title: guide.seo_title,
        seo_description: guide.seo_description,
        published_at: now,
      })
      .where(eq(catalogItems.id, itemId));
  } else {
    const [created] = await db
      .insert(catalogItems)
      .values({
        type: 'guide',
        title: guide.title,
        slug: guide.slug,
        short_description: guide.short_description,
        full_description: guide.full_description,
        status: 'published',
        visibility: 'public',
        author_user_id: authorUserId,
        curated_score: guide.curated_score,
        featured: guide.featured,
        seo_title: guide.seo_title,
        seo_description: guide.seo_description,
        published_at: now,
      })
      .returning({ id: catalogItems.id });

    itemId = created.id;
  }

  if (!itemId) {
    throw new Error(`Failed to upsert guide ${guide.slug}`);
  }

  await db.delete(catalogItemCategories).where(eq(catalogItemCategories.item_id, itemId));
  await db.delete(catalogItemTags).where(eq(catalogItemTags.item_id, itemId));
  await db.delete(catalogItemUseCases).where(eq(catalogItemUseCases.item_id, itemId));
  await db.delete(catalogItemMeta).where(eq(catalogItemMeta.item_id, itemId));

  const [categoryIds, tagIds, useCaseIds] = await Promise.all([
    getCategoryIds(guide.category_slugs),
    getTagIds(guide.tag_slugs),
    getUseCaseIds(guide.use_case_slugs),
  ]);

  if (categoryIds.length > 0) {
    await db.insert(catalogItemCategories).values(
      categoryIds.map((categoryId) => ({
        item_id: itemId!,
        category_id: categoryId,
      })),
    );
  }

  if (tagIds.length > 0) {
    await db.insert(catalogItemTags).values(
      tagIds.map((tagId) => ({
        item_id: itemId!,
        tag_id: tagId,
      })),
    );
  }

  if (useCaseIds.length > 0) {
    await db.insert(catalogItemUseCases).values(
      useCaseIds.map((useCaseId) => ({
        item_id: itemId!,
        use_case_id: useCaseId,
      })),
    );
  }

  await db.insert(catalogItemMeta).values({
    item_id: itemId,
    pricing_type: guide.meta.pricing_type,
    deployment_type: guide.meta.deployment_type,
    privacy_type: guide.meta.privacy_type,
    language_support: guide.meta.language_support,
    difficulty: guide.meta.difficulty,
    readiness: guide.meta.readiness,
    vendor_name: guide.meta.vendor_name,
    metadata_json: {
      section: 'knowledge-base',
    },
  });
}

async function main() {
  await ensureCategories();
  const authorUserId = await getAdminUserId();

  for (const guide of guides) {
    await upsertGuide(guide, authorUserId);
    console.log(`Published guide: ${guide.slug}`);
  }

  console.log(`Done. Published ${guides.length} guides.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
