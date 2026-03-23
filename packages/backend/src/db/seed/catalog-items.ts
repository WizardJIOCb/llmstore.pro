import { eq } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { catalogItems, catalogItemMeta, catalogItemCategories, catalogItemTags, catalogItemUseCases, categories, tags, useCases } from '../schema/index.js';
import { users } from '../schema/auth.js';

async function getAdminId(): Promise<string> {
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, 'admin@llmstore.pro')).limit(1);
  return admin?.id ?? '';
}

async function getCategoryId(slug: string): Promise<string | null> {
  const [row] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug)).limit(1);
  return row?.id ?? null;
}

async function getTagIds(slugs: string[]): Promise<string[]> {
  const rows = await db.select({ id: tags.id, slug: tags.slug }).from(tags);
  return rows.filter((r) => slugs.includes(r.slug)).map((r) => r.id);
}

async function getUseCaseIds(slugs: string[]): Promise<string[]> {
  const rows = await db.select({ id: useCases.id, slug: useCases.slug }).from(useCases);
  return rows.filter((r) => slugs.includes(r.slug)).map((r) => r.id);
}

const sampleItems = [
  {
    type: 'tool' as const,
    title: 'LangChain — фреймворк для LLM-приложений',
    slug: 'langchain',
    short_description: 'Мощный Python/JS фреймворк для создания цепочек вызовов LLM с поддержкой RAG, агентов и инструментов.',
    full_description: 'LangChain — один из самых популярных фреймворков для разработки приложений на основе больших языковых моделей. Поддерживает цепочки вызовов, RAG-пайплайны, агентов с tool calling, и интеграции с десятками провайдеров.\n\nОсновные возможности:\n- Chains и LCEL для композиции операций\n- Агенты с автоматическим вызовом инструментов\n- Интеграции с OpenAI, Anthropic, Ollama и др.\n- Векторные хранилища для RAG\n- LangSmith для мониторинга',
    status: 'published' as const,
    curated_score: 95,
    featured: true,
    categorySlugs: ['tools', 'development'],
    tagSlugs: ['open-source', 'tool-calling', 'rag', 'agent'],
    useCaseSlugs: ['coding', 'agentic-workflows', 'rag'],
    meta: {
      pricing_type: 'open_source' as const,
      deployment_type: 'cloud' as const,
      privacy_type: 'public_api' as const,
      language_support: 'multilingual' as const,
      difficulty: 'intermediate' as const,
      readiness: 'production_ready' as const,
      vendor_name: 'LangChain Inc.',
      github_url: 'https://github.com/langchain-ai/langchain',
      docs_url: 'https://docs.langchain.com',
    },
  },
  {
    type: 'model' as const,
    title: 'GPT-4o — мультимодальная модель OpenAI',
    slug: 'gpt-4o',
    short_description: 'Флагманская модель OpenAI с поддержкой текста, изображений, аудио. Отлично подходит для сложных задач.',
    full_description: 'GPT-4o (omni) — передовая мультимодальная модель от OpenAI, которая принимает и генерирует текст, изображения и аудио. Модель демонстрирует высокое качество на задачах рассуждений, кодирования, анализа данных.\n\nКлючевые характеристики:\n- Контекстное окно: 128K токенов\n- Поддержка vision, audio, tool calling\n- Structured output через json_schema\n- Быстрый inference',
    status: 'published' as const,
    curated_score: 98,
    featured: true,
    categorySlugs: ['language-models'],
    tagSlugs: ['gpt-4', 'vision', 'tool-calling', 'structured-output', 'reasoning'],
    useCaseSlugs: ['coding', 'chat', 'content', 'data-extraction'],
    meta: {
      pricing_type: 'api_based' as const,
      deployment_type: 'cloud' as const,
      privacy_type: 'public_api' as const,
      language_support: 'multilingual' as const,
      difficulty: 'beginner' as const,
      readiness: 'production_ready' as const,
      vendor_name: 'OpenAI',
      website_url: 'https://openai.com',
      docs_url: 'https://platform.openai.com/docs',
    },
  },
  {
    type: 'prompt_pack' as const,
    title: 'Промпты для анализа данных',
    slug: 'data-analysis-prompts',
    short_description: 'Набор системных промптов для анализа CSV, SQL-запросов, визуализации данных и создания отчётов.',
    full_description: 'Коллекция из 12 проверенных системных промптов для задач анализа данных. Включает шаблоны для:\n- Парсинга и очистки CSV\n- Генерации SQL-запросов из естественного языка\n- Построения визуализаций через код\n- Суммаризации данных и создания отчётов\n\nВсе промпты оптимизированы для GPT-4o и Claude 3.5 Sonnet.',
    status: 'published' as const,
    curated_score: 82,
    featured: false,
    categorySlugs: ['analytics'],
    tagSlugs: ['gpt-4', 'claude', 'structured-output'],
    useCaseSlugs: ['analytics', 'data-extraction', 'summarization'],
    meta: {
      pricing_type: 'free' as const,
      deployment_type: 'cloud' as const,
      privacy_type: 'public_api' as const,
      language_support: 'ru' as const,
      difficulty: 'beginner' as const,
      readiness: 'template' as const,
    },
  },
  {
    type: 'business_agent' as const,
    title: 'Агент поддержки клиентов',
    slug: 'customer-support-agent',
    short_description: 'Готовый к deploy агент для обработки обращений клиентов с подключением к CRM и базе знаний.',
    full_description: 'Полноценный бизнес-агент для автоматизации первой линии поддержки клиентов. Работает с любым LLM через tool calling.\n\nВозможности:\n- Классификация и маршрутизация обращений\n- Ответы на FAQ из базы знаний (RAG)\n- Создание тикетов в CRM через webhook\n- Эскалация сложных вопросов на оператора\n- Мультиязычность (RU/EN)',
    status: 'published' as const,
    curated_score: 88,
    featured: true,
    categorySlugs: ['business', 'automation'],
    tagSlugs: ['agent', 'tool-calling', 'rag', 'russian-language'],
    useCaseSlugs: ['support', 'chat', 'automation'],
    meta: {
      pricing_type: 'freemium' as const,
      deployment_type: 'cloud' as const,
      privacy_type: 'public_api' as const,
      language_support: 'multilingual' as const,
      difficulty: 'intermediate' as const,
      readiness: 'deployable' as const,
      vendor_name: 'LLMStore Team',
    },
  },
  {
    type: 'local_build' as const,
    title: 'Ollama + Open WebUI — локальный чат',
    slug: 'ollama-open-webui',
    short_description: 'Комплект для запуска локального чат-интерфейса с поддержкой Llama 3, Mistral и других открытых моделей.',
    full_description: 'Готовая конфигурация Docker Compose для развёртывания полностью локального AI-ассистента.\n\nВ комплекте:\n- Ollama для запуска моделей (Llama 3, Mistral, Gemma)\n- Open WebUI — красивый веб-интерфейс чата\n- Docker Compose для однокомандного запуска\n- Инструкции по настройке GPU (NVIDIA/AMD)\n\nВсё работает 100% оффлайн, данные не покидают ваш компьютер.',
    status: 'published' as const,
    curated_score: 91,
    featured: true,
    categorySlugs: ['local-solutions'],
    tagSlugs: ['llama', 'mistral', 'open-source', 'local', 'privacy', 'free', 'chat'],
    useCaseSlugs: ['chat', 'coding'],
    meta: {
      pricing_type: 'free' as const,
      deployment_type: 'local' as const,
      privacy_type: 'offline' as const,
      language_support: 'multilingual' as const,
      difficulty: 'beginner' as const,
      readiness: 'deployable' as const,
    },
  },
  {
    type: 'workflow_pack' as const,
    title: 'Воркфлоу генерации контента',
    slug: 'content-generation-workflow',
    short_description: 'Цепочка промптов для создания SEO-статей: исследование → план → текст → редактура → SEO-оптимизация.',
    full_description: 'Многоэтапный воркфлоу для автоматической генерации SEO-оптимизированного контента.\n\nЭтапы:\n1. Исследование темы и анализ конкурентов\n2. Составление структуры статьи\n3. Генерация текста по секциям\n4. Автоматическая редактура и проверка фактов\n5. SEO-оптимизация (мета-теги, ключевые слова)\n\nКаждый этап использует специализированный промпт. Поддерживает GPT-4o, Claude 3.5.',
    status: 'published' as const,
    curated_score: 76,
    featured: false,
    categorySlugs: ['generation', 'business'],
    tagSlugs: ['gpt-4', 'claude', 'content'],
    useCaseSlugs: ['content', 'automation'],
    meta: {
      pricing_type: 'free' as const,
      deployment_type: 'cloud' as const,
      privacy_type: 'public_api' as const,
      language_support: 'ru' as const,
      difficulty: 'beginner' as const,
      readiness: 'template' as const,
    },
  },
  {
    type: 'developer_asset' as const,
    title: 'JSON-схемы для Structured Output',
    slug: 'structured-output-schemas',
    short_description: 'Коллекция JSON Schema для типичных задач: извлечение сущностей, классификация, парсинг документов.',
    full_description: 'Набор готовых JSON Schema для использования с режимом structured output в OpenAI и Anthropic API.\n\nВключает схемы для:\n- Извлечение именованных сущностей (NER)\n- Классификация текстов по категориям\n- Парсинг резюме и документов\n- Сентимент-анализ\n- Генерация тестовых данных\n\nВсе схемы валидны по JSON Schema Draft 2020-12.',
    status: 'published' as const,
    curated_score: 70,
    featured: false,
    categorySlugs: ['development'],
    tagSlugs: ['structured-output', 'api', 'coding'],
    useCaseSlugs: ['data-extraction', 'coding'],
    meta: {
      pricing_type: 'free' as const,
      deployment_type: 'cloud' as const,
      privacy_type: 'public_api' as const,
      language_support: 'multilingual' as const,
      difficulty: 'intermediate' as const,
      readiness: 'template' as const,
    },
  },
  {
    type: 'model' as const,
    title: 'YandexGPT — русскоязычная модель',
    slug: 'yandex-gpt',
    short_description: 'Нативная русскоязычная модель от Яндекса. Отлично понимает контекст на русском, есть бесплатный тариф.',
    full_description: 'YandexGPT — большая языковая модель от Яндекса, оптимизированная для русского языка.\n\nОсобенности:\n- Лучшее понимание русского языка среди коммерческих моделей\n- Интеграция с Yandex Cloud\n- Доступен бесплатный тариф для тестирования\n- API совместим с OpenAI-форматом (через адаптер)\n- Поддержка суммаризации, генерации, классификации\n\nИдеально для проектов, где критична работа с русским языком.',
    status: 'published' as const,
    curated_score: 85,
    featured: false,
    categorySlugs: ['language-models', 'russian-models'],
    tagSlugs: ['russian-language', 'api', 'chat'],
    useCaseSlugs: ['chat', 'content', 'summarization', 'translation'],
    meta: {
      pricing_type: 'freemium' as const,
      deployment_type: 'cloud' as const,
      privacy_type: 'private' as const,
      language_support: 'ru' as const,
      difficulty: 'beginner' as const,
      readiness: 'production_ready' as const,
      vendor_name: 'Яндекс',
      website_url: 'https://cloud.yandex.ru/services/yandexgpt',
      docs_url: 'https://cloud.yandex.ru/docs/yandexgpt/',
    },
  },
];

export async function seedCatalogItems() {
  const adminId = await getAdminId();
  if (!adminId) {
    console.log('Skipping catalog items seed: admin user not found');
    return;
  }

  for (const item of sampleItems) {
    const { categorySlugs, tagSlugs, useCaseSlugs, meta, ...itemData } = item;

    // Skip if already exists
    const [existing] = await db
      .select({ id: catalogItems.id })
      .from(catalogItems)
      .where(eq(catalogItems.slug, itemData.slug))
      .limit(1);

    if (existing) continue;

    const now = new Date();
    const [inserted] = await db.insert(catalogItems).values({
      ...itemData,
      author_user_id: adminId,
      published_at: itemData.status === 'published' ? now : null,
    }).returning({ id: catalogItems.id });

    // Insert meta
    await db.insert(catalogItemMeta).values({
      item_id: inserted.id,
      ...meta,
    });

    // Link categories
    const catIds = (await Promise.all(categorySlugs.map(getCategoryId))).filter(Boolean) as string[];
    if (catIds.length) {
      await db.insert(catalogItemCategories).values(
        catIds.map((cid) => ({ item_id: inserted.id, category_id: cid })),
      );
    }

    // Link tags
    const tIds = await getTagIds(tagSlugs);
    if (tIds.length) {
      await db.insert(catalogItemTags).values(
        tIds.map((tid) => ({ item_id: inserted.id, tag_id: tid })),
      );
    }

    // Link use cases
    const ucIds = await getUseCaseIds(useCaseSlugs);
    if (ucIds.length) {
      await db.insert(catalogItemUseCases).values(
        ucIds.map((uid) => ({ item_id: inserted.id, use_case_id: uid })),
      );
    }

    console.log(`  Seeded: ${itemData.title}`);
  }

  console.log(`Seeded ${sampleItems.length} catalog items`);
}
