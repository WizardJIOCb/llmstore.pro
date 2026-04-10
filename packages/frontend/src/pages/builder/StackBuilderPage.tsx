import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Blocks,
  Bot,
  BrainCircuit,
  Briefcase,
  Calculator,
  Code2,
  FileText,
  Gauge,
  Globe2,
  Headphones,
  Newspaper,
  PenTool,
  Rocket,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  Webhook,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useBuiltinTools, useCreateAgent } from '../../hooks/useAgents';
import { useChatAgents, useCreateChat } from '../../hooks/useChats';
import type { ToolDefinition } from '../../lib/api/agents';
import { Badge, Button, Card, Input, Spinner, Textarea } from '../../components/ui';
import { ToolSelector } from '../../components/agents/ToolSelector';
import { cn } from '../../lib/utils';

type BuilderStep = 1 | 2 | 3 | 4 | 5;
type DirectionId =
  | 'research'
  | 'support'
  | 'sales'
  | 'content'
  | 'operations'
  | 'analytics'
  | 'media'
  | 'coding'
  | 'custom';
type WorkflowId = 'advisory' | 'production' | 'monitoring' | 'automation';
type CapabilityPackId = 'web_research' | 'structured_data' | 'integrations' | 'dtf_news' | 'templates';
type ToneId = 'professional' | 'friendly' | 'expert' | 'executive';
type AutonomyId = 'ask_first' | 'guided' | 'proactive';
type ModelProfileId = 'fast' | 'balanced' | 'deep';

interface DirectionOption {
  id: DirectionId;
  title: string;
  description: string;
  icon: LucideIcon;
  sample: string;
  defaultAudience: string;
  purposeHint: string;
  baseTasks: string[];
  starterPrompts: string[];
}

interface WorkflowOption {
  id: WorkflowId;
  title: string;
  description: string;
  icon: LucideIcon;
  deliverables: string[];
}

interface CapabilityPack {
  id: CapabilityPackId;
  title: string;
  description: string;
  icon: LucideIcon;
  toolSlugs: string[];
}

interface ToneOption {
  id: ToneId;
  title: string;
  description: string;
}

interface AutonomyOption {
  id: AutonomyId;
  title: string;
  description: string;
}

interface ModelProfile {
  id: ModelProfileId;
  title: string;
  description: string;
  model: string;
}

interface FullstackBlueprint {
  id: string;
  title: string;
  description: string;
  stackSummary: string;
  icon: LucideIcon;
  prompt: string;
}

const FALLBACK_FULLSTACK_SYSTEM_PROMPT = [
  'Ты - coding assistant для fullstack-проектов внутри LLMStore.',
  'Отвечай на русском.',
  'Если строишь runnable project bundle, обязательно возвращай проект в структурированном dev-report формате.',
  'Для fullstack-проектов старайся заполнять project.stack с frontend, backend и services.',
  'Если нужен backend для лендинга, делай так, чтобы фронт и backend можно было развернуть в одном проекте.',
].join('\n');

const fullstackBlueprints: FullstackBlueprint[] = [
  {
    id: 'landing-express-postgres',
    title: 'Лендинг + Express + PostgreSQL',
    description: 'Маркетинговый фронт с формой заявки, backend API и нормальной базой для лидов.',
    stackSummary: 'Frontend landing • Express API • PostgreSQL',
    icon: Globe2,
    prompt: [
      'Собери fullstack-проект для LLMStore: сильный лендинг плюс backend и база.',
      'Нужен стек: frontend landing, backend на Node.js/Express, база PostgreSQL.',
      'Сделай runnable project bundle в одном проекте.',
      'Важно: project.runtime пусть будет node, потому что deploy будет поднимать backend, а frontend должен раздаваться этим же backend как static build.',
      'В project.stack обязательно заполни:',
      '- frontend: runtime static или node, root_dir, framework, entrypoint если нужен',
      '- backend: runtime node, framework express, root_dir, entrypoint',
      '- services: postgres с mode managed и env_prefix APP',
      'Сценарий: красивый SaaS-лендинг, блоки преимуществ, тарифы, FAQ, форма "Оставить заявку".',
      'Backend API: GET /api/health, POST /api/leads, GET /api/leads/count.',
      'Frontend должен ходить в API относительными путями.',
      'Добавь SQL/ORM слой максимально просто, но с миграцией или init-логикой.',
      'Верни полный project bundle с файлами, командами install/run/test и notes.',
    ].join('\n'),
  },
  {
    id: 'landing-fastapi-postgres',
    title: 'Лендинг + FastAPI + PostgreSQL',
    description: 'Python-backend под форму, заявки и админский API, если хочется backend на FastAPI.',
    stackSummary: 'Frontend landing • FastAPI • PostgreSQL',
    icon: Rocket,
    prompt: [
      'Собери fullstack-проект для LLMStore: landing + backend на FastAPI + PostgreSQL.',
      'Это должен быть один runnable project bundle.',
      'Важно: project.runtime = python, потому что deploy будет поднимать backend на Python.',
      'Frontend должен жить в проекте как статические файлы и раздаваться через FastAPI.',
      'В project.stack обязательно заполни frontend, backend и services.',
      'Services: postgres с mode managed и env_prefix APP.',
      'Нужен лендинг для digital-продукта с формой "Запросить демо".',
      'Backend API: GET /api/health, POST /api/leads, GET /api/leads/recent.',
      'Сделай backend zero-friction: requirements.txt, main.py, простая работа с DATABASE_URL.',
      'Если используешь шаблоны или static-dir, опиши это в notes.',
      'Верни полный project bundle, пригодный для deploy внутри LLMStore.',
    ].join('\n'),
  },
  {
    id: 'telegram-bot-postgres-queue',
    title: 'Telegram Bot + PostgreSQL + Redis Queue',
    description: 'Webhook-бот с хранением данных и очередью для фоновых задач, уведомлений и ретраев.',
    stackSummary: 'Python/Node bot • PostgreSQL • Redis • Queue',
    icon: Bot,
    prompt: [
      'Собери production-minded Telegram webhook bot для LLMStore.',
      'Нужен runnable project bundle с backend и данными.',
      'Бот должен принимать входящие Telegram webhook запросы, хранить пользователей/сессии и уметь отправлять фоновое сообщение через очередь.',
      'Можно выбрать Node.js или Python, но проект должен быть простым для deploy.',
      'В project.stack обязательно заполни backend и services.',
      'Services:',
      '- postgres mode managed env_prefix APP',
      '- redis mode managed env_prefix CACHE',
      '- queue mode managed env_prefix JOBS',
      'Нужны env-переменные для TELEGRAM_BOT_TOKEN и TELEGRAM_SECRET_TOKEN.',
      'Сделай Telegram-совместимое форматирование исходящих сообщений.',
      'Добавь endpoint /webhook, health endpoint и пример фоновой задачи через очередь.',
      'Верни полный runnable bundle, как запустить, и notes по webhook/deploy.',
    ].join('\n'),
  },
  {
    id: 'mini-saas-dashboard',
    title: 'Мини-SaaS Dashboard + Auth + DB',
    description: 'Уже не просто лендинг, а маленькое приложение: auth, dashboard, CRUD и база.',
    stackSummary: 'Frontend app • Backend API • PostgreSQL • Redis',
    icon: Briefcase,
    prompt: [
      'Собери mini SaaS fullstack app для LLMStore.',
      'Нужен не просто лендинг, а маленькое рабочее приложение с auth и dashboard.',
      'Подходящий стек: frontend SPA, backend API на Node.js, PostgreSQL, Redis для сессий/кэша.',
      'project.runtime = node.',
      'В project.stack обязательно укажи frontend, backend и services.',
      'Services:',
      '- postgres mode managed env_prefix APP',
      '- redis mode managed env_prefix CACHE',
      'Функциональность: регистрация/логин, список записей, создание новой записи, simple metrics на dashboard.',
      'Если полноценный production auth слишком длинный, сделай честный lightweight auth с сессией или JWT и явно опиши ограничения.',
      'Frontend и backend должны жить в одном project bundle и быть разворачиваемыми внутри LLMStore.',
      'Верни полный runnable bundle и обязательно заполни project.stack.',
    ].join('\n'),
  },
];

const directionOptions: DirectionOption[] = [
  {
    id: 'research',
    title: 'Исследователь и аналитик',
    description: 'Собирает контекст, сравнивает решения, проверяет гипотезы и превращает хаос в выводы.',
    icon: Search,
    sample: 'Разобрать рынок, конкурентов, новые решения и собрать понятную сводку.',
    defaultAudience: 'команды продукта, фаундеров и исследователей',
    purposeHint: 'Например: помогает быстро собрать и проверить контекст по рынку и продуктовым решениям',
    baseTasks: [
      'собирать релевантный контекст и источники',
      'сравнивать варианты и выделять сильные и слабые стороны',
      'давать выводы и следующие шаги, а не только список фактов',
    ],
    starterPrompts: [
      'Собери обзор по теме и выдели ключевые выводы',
      'Сравни 3 подхода и покажи компромиссы',
      'Подготовь краткую аналитическую сводку по вопросу',
    ],
  },
  {
    id: 'support',
    title: 'Поддержка и сервис',
    description: 'Помогает отвечать клиентам, уточнять запросы и удерживать единый уровень сервиса.',
    icon: Headphones,
    sample: 'Подготовить ответы, собрать FAQ и давать сотрудникам опору в переписке.',
    defaultAudience: 'клиентской поддержки и аккаунт-менеджеров',
    purposeHint: 'Например: помогает сотрудникам поддержки быстро собирать точные и спокойные ответы клиентам',
    baseTasks: [
      'уточнять ситуацию короткими вопросами',
      'давать понятные и доброжелательные ответы',
      'оформлять ответы в готовом для отправки виде',
    ],
    starterPrompts: [
      'Помоги ответить клиенту на этот запрос',
      'Собери вежливый и точный ответ без воды',
      'Сформируй FAQ по типовым обращениям',
    ],
  },
  {
    id: 'sales',
    title: 'Продажи и пресейл',
    description: 'Готовит аргументацию, сравнения, офферы и помогает быстрее доводить до следующего шага.',
    icon: Briefcase,
    sample: 'Упаковать ценность, обработать возражения и подготовить follow-up.',
    defaultAudience: 'sales-команд, фаундеров и пресейл-специалистов',
    purposeHint: 'Например: помогает быстрее готовить аргументы, предложения и follow-up после звонков',
    baseTasks: [
      'выявлять потребность и контекст клиента',
      'переводить возможности продукта в выгоды для конкретного кейса',
      'готовить следующий шаг: письмо, summary, предложение, CTA',
    ],
    starterPrompts: [
      'Подготовь follow-up после демо-звонка',
      'Разбери возражения клиента и предложи ответы',
      'Собери короткий value proposition для сегмента',
    ],
  },
  {
    id: 'content',
    title: 'Контент и маркетинг',
    description: 'Пишет, структурирует, переформулирует и помогает выпускать материалы быстрее.',
    icon: PenTool,
    sample: 'Собрать контент-план, черновик статьи, серию постов или письмо.',
    defaultAudience: 'маркетологов, редакторов и контент-команд',
    purposeHint: 'Например: помогает быстро делать сильные черновики контента и редактурные варианты',
    baseTasks: [
      'предлагать структуру и несколько углов подачи',
      'писать черновики и улучшать существующие тексты',
      'адаптировать материалы под разные каналы и форматы',
    ],
    starterPrompts: [
      'Сделай план материала по теме',
      'Напиши черновик поста в деловом тоне',
      'Адаптируй текст под Telegram и рассылку',
    ],
  },
  {
    id: 'operations',
    title: 'Операции и автоматизация',
    description: 'Связывает шаги, готовит payload, помогает автоматизировать рутину и действия через интеграции.',
    icon: Settings2,
    sample: 'Собрать JSON, вызвать webhook и оформить результат в рабочий сценарий.',
    defaultAudience: 'операционных команд и no-code / ops-специалистов',
    purposeHint: 'Например: помогает автоматизировать повторяющиеся действия и работать с webhook/API сценариями',
    baseTasks: [
      'структурировать входные данные в рабочие payload',
      'подготавливать действия для интеграций и webhook',
      'объяснять, что именно будет сделано и какой будет результат',
    ],
    starterPrompts: [
      'Подготовь payload для webhook по этой задаче',
      'Разложи процесс на шаги автоматизации',
      'Преобразуй данные в JSON для внешней системы',
    ],
  },
  {
    id: 'analytics',
    title: 'Данные и расчёты',
    description: 'Работает с цифрами, формулами, JSON-структурами и превращает данные в решения.',
    icon: Calculator,
    sample: 'Посчитать показатели, собрать таблицу решений и объяснить влияние на бизнес.',
    defaultAudience: 'аналитиков, операционных лидов и менеджеров',
    purposeHint: 'Например: помогает быстро разбирать показатели, считать сценарии и объяснять выводы',
    baseTasks: [
      'считать показатели и сценарии',
      'приводить данные к понятной структуре',
      'объяснять, какие выводы следуют из цифр',
    ],
    starterPrompts: [
      'Посчитай сценарий и покажи выводы',
      'Преобразуй набор данных в удобный JSON',
      'Сравни два варианта по цифрам и рискам',
    ],
  },
  {
    id: 'media',
    title: 'Новости и медиа-мониторинг',
    description: 'Следит за источниками, собирает повестку и помогает быстро разбирать публикации.',
    icon: Newspaper,
    sample: 'Показывать свежие материалы, разбирать статьи и делать сводки.',
    defaultAudience: 'редакторов, контент-команд и людей, следящих за инфоповесткой',
    purposeHint: 'Например: помогает быстро отслеживать публикации и делать краткие понятные сводки',
    baseTasks: [
      'находить и показывать свежие материалы',
      'доставать ключевые тезисы и контекст из публикаций',
      'делать короткие понятные summaries для команды',
    ],
    starterPrompts: [
      'Покажи свежие публикации и выдели важное',
      'Сделай краткий разбор этой статьи',
      'Собери повестку дня по ключевым темам',
    ],
  },
  {
    id: 'coding',
    title: 'Разработка и техпомощник',
    description: 'Помогает разбирать задачи, проектировать решения и сопровождать техническую работу.',
    icon: Code2,
    sample: 'Разобрать ТЗ, дать план реализации, предложить архитектурный подход.',
    defaultAudience: 'разработчиков, технических лидов и продуктовых команд',
    purposeHint: 'Например: помогает разбирать технические задачи, проектировать решения и писать понятные планы',
    baseTasks: [
      'уточнять задачу и ограничения',
      'предлагать план реализации по шагам',
      'подсвечивать риски, компромиссы и варианты',
    ],
    starterPrompts: [
      'Разбери задачу и предложи план реализации',
      'Сравни 2 архитектурных подхода',
      'Собери чеклист для выполнения этой техзадачи',
    ],
  },
  {
    id: 'custom',
    title: 'Своя роль',
    description: 'Если у вас нетипичный сценарий, можно собрать роль вручную и всё равно быстро запуститься.',
    icon: WandSparkles,
    sample: 'Сделать внутреннего эксперта под ваш процесс и терминологию.',
    defaultAudience: 'вашей команды или конкретного процесса',
    purposeHint: 'Опишите, в чём должен быть полезен агент именно в вашем контексте',
    baseTasks: [
      'понимать вашу задачу и критерии успеха',
      'работать в нужном формате и тоне',
      'доводить ответ до применимого результата',
    ],
    starterPrompts: [
      'Помоги решить задачу в моём процессе',
      'Предложи следующий шаг по этому кейсу',
      'Собери для меня рабочий черновик решения',
    ],
  },
];

const workflowOptions: WorkflowOption[] = [
  {
    id: 'advisory',
    title: 'Советует и объясняет',
    description: 'Отвечает, сравнивает, структурирует и подсказывает лучшее решение.',
    icon: BrainCircuit,
    deliverables: ['разборы', 'сравнения', 'рекомендации'],
  },
  {
    id: 'production',
    title: 'Готовит материалы',
    description: 'Пишет черновики, документы, сообщения, summary и рабочие форматы для команды.',
    icon: FileText,
    deliverables: ['тексты', 'черновики', 'готовые форматы ответа'],
  },
  {
    id: 'monitoring',
    title: 'Следит и сообщает',
    description: 'Собирает обновления, делает дайджесты и помогает не терять важные сигналы.',
    icon: Globe2,
    deliverables: ['сводки', 'обновления', 'мониторинг тем'],
  },
  {
    id: 'automation',
    title: 'Действует через инструменты',
    description: 'Готовит payload, вызывает API/webhook и помогает построить рабочий автоматизированный сценарий.',
    icon: Rocket,
    deliverables: ['payload', 'webhook-вызовы', 'операционные шаги'],
  },
];

const capabilityPacks: CapabilityPack[] = [
  {
    id: 'web_research',
    title: 'Веб-поиск и открытые источники',
    description: 'Поиск по вебу и быстрый сбор контекста по открытым источникам.',
    icon: Globe2,
    toolSlugs: ['web-search-cascade'],
  },
  {
    id: 'structured_data',
    title: 'Числа, JSON и преобразования',
    description: 'Расчёты, JSON-структуры, преобразование данных и аккуратные шаблоны.',
    icon: Blocks,
    toolSlugs: ['calculator', 'json-transform', 'template-renderer'],
  },
  {
    id: 'integrations',
    title: 'API, webhook и внешние системы',
    description: 'HTTP-запросы, webhook-сценарии и действия через интеграции.',
    icon: Webhook,
    toolSlugs: ['http-request', 'webhook-call', 'json-transform'],
  },
  {
    id: 'dtf_news',
    title: 'Новости и DTF-источники',
    description: 'Лента DTF, популярные публикации и разбор конкретных материалов.',
    icon: Newspaper,
    toolSlugs: ['dtf-latest-feed', 'dtf-popular-feed', 'dtf-article-fetch'],
  },
  {
    id: 'templates',
    title: 'Готовые форматы ответа',
    description: 'Быстро собирать письма, сводки, шаблоны и аккуратные структуры ответа.',
    icon: Sparkles,
    toolSlugs: ['template-renderer'],
  },
];

const AUTO_EXCLUDED_TOOL_SLUGS = new Set<string>(['template-renderer']);

const toneOptions: ToneOption[] = [
  { id: 'professional', title: 'Профессиональный', description: 'Спокойный, ясный, деловой.' },
  { id: 'friendly', title: 'Дружелюбный', description: 'Тёплый, поддерживающий, понятный.' },
  { id: 'expert', title: 'Экспертный', description: 'Сильная аргументация, контекст, риски.' },
  { id: 'executive', title: 'Руководительский', description: 'Кратко, по делу, с акцентом на решение.' },
];

const autonomyOptions: AutonomyOption[] = [
  {
    id: 'ask_first',
    title: 'Сначала уточнить',
    description: 'Если данных мало, сначала задаёт вопросы и только потом действует.',
  },
  {
    id: 'guided',
    title: 'Делает с аккуратной инициативой',
    description: 'Сам предлагает следующий шаг, но не уходит далеко без сигнала.',
  },
  {
    id: 'proactive',
    title: 'Максимально инициативный',
    description: 'Сам выбирает лучший путь, использует инструменты и ведёт пользователя к результату.',
  },
];

const modelProfiles: ModelProfile[] = [
  {
    id: 'fast',
    title: 'Быстрый запуск',
    description: 'Для частых диалогов, быстрых ответов и лёгких сценариев.',
    model: 'google/gemini-2.5-flash',
  },
  {
    id: 'balanced',
    title: 'Сбалансированный',
    description: 'Хороший дефолт для большинства бизнес- и продуктовых агентов.',
    model: 'openai/gpt-4o-mini',
  },
  {
    id: 'deep',
    title: 'Глубокий reasoning',
    description: 'Для сложных задач, разборов, проектирования и более дорогих сценариев.',
    model: 'anthropic/claude-sonnet-4.6',
  },
];

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function toggleArrayValue<T>(items: T[], value: T): T[] {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

function directionById(id: DirectionId) {
  return directionOptions.find((option) => option.id === id) ?? directionOptions[0];
}

function workflowById(id: WorkflowId) {
  return workflowOptions.find((option) => option.id === id) ?? workflowOptions[0];
}

function modelProfileById(id: ModelProfileId) {
  return modelProfiles.find((profile) => profile.id === id) ?? modelProfiles[0];
}

function getSuggestedPackIds(direction: DirectionId, workflow: WorkflowId): CapabilityPackId[] {
  const suggested = new Set<CapabilityPackId>();

  if (direction === 'research' || direction === 'sales' || direction === 'analytics' || direction === 'coding') {
    suggested.add('web_research');
  }
  if (direction === 'support' || direction === 'sales' || direction === 'content' || direction === 'analytics') {
    suggested.add('structured_data');
  }
  if (direction === 'operations') {
    suggested.add('integrations');
    suggested.add('structured_data');
  }
  if (direction === 'media') {
    suggested.add('dtf_news');
    suggested.add('web_research');
  }
  if (direction === 'content') {
    suggested.add('templates');
    suggested.add('web_research');
  }
  if (direction === 'support') {
    suggested.add('templates');
  }

  if (workflow === 'monitoring') suggested.add('web_research');
  if (workflow === 'production') suggested.add('templates');
  if (workflow === 'automation') {
    suggested.add('integrations');
    suggested.add('structured_data');
  }

  return unique(Array.from(suggested));
}

function getRecommendedModelProfile(direction: DirectionId, workflow: WorkflowId): ModelProfileId {
  if (direction === 'coding' || direction === 'research' || direction === 'analytics') return 'deep';
  if (workflow === 'monitoring' || workflow === 'automation') return 'fast';
  return 'balanced';
}

function getToneInstruction(tone: ToneId): string {
  if (tone === 'friendly') return 'Тон: дружелюбный, поддерживающий, без сухости.';
  if (tone === 'expert') return 'Тон: экспертный, аргументированный, с пояснением причин и рисков.';
  if (tone === 'executive') return 'Тон: руководительский, краткий, с акцентом на решение и следующий шаг.';
  return 'Тон: профессиональный, спокойный, структурированный.';
}

function getAutonomyInstruction(autonomy: AutonomyId): string {
  if (autonomy === 'ask_first') {
    return 'Если контекста не хватает, сначала задавай уточняющие вопросы и не делай лишних предположений.';
  }
  if (autonomy === 'proactive') {
    return 'Сам предлагай лучший следующий шаг, используй инструменты там, где это повышает качество результата.';
  }
  return 'Действуй с аккуратной инициативой: предлагай следующий шаг, но не уводи пользователя слишком далеко без сигнала.';
}

function getWorkflowInstruction(workflow: WorkflowOption): string {
  if (workflow.id === 'production') {
    return 'На выходе старайся давать не только советы, но и готовые черновики, тексты или оформленные материалы.';
  }
  if (workflow.id === 'monitoring') {
    return 'Старайся превращать поток обновлений в короткие понятные дайджесты и выделять, что действительно важно.';
  }
  if (workflow.id === 'automation') {
    return 'Когда задача требует действия через интеграции, сначала кратко объясни план, затем подготовь payload или вызов инструмента максимально прозрачно.';
  }
  return 'Отвечай с фокусом на анализ, объяснение и практические рекомендации.';
}

function getGeneratedStarterPrompts(
  direction: DirectionOption,
  workflow: WorkflowOption,
  audience: string,
  purpose: string,
): string[] {
  const prompts = [...direction.starterPrompts];

  if (workflow.id === 'automation') prompts.unshift('Подготовь действие через webhook или API для этой задачи');
  if (workflow.id === 'monitoring') prompts.unshift('Собери свежие обновления и выдели главное');
  if (purpose.trim()) prompts.push(`Помоги мне с задачей: ${purpose.trim()}`);
  if (audience.trim()) prompts.push(`Адаптируй ответ под аудиторию: ${audience.trim()}`);

  return unique(prompts).slice(0, 5);
}

function getToolIdsBySlugs(tools: ToolDefinition[], slugs: string[]): string[] {
  const toolBySlug = new Map(tools.map((tool) => [tool.slug, tool.id]));
  return unique(slugs.map((slug) => toolBySlug.get(slug)).filter((id): id is string => Boolean(id)));
}

function getGeneratedName(direction: DirectionOption, workflow: WorkflowOption): string {
  if (direction.id === 'custom') return 'Новый AI-агент';
  return `${direction.title} • ${workflow.title}`;
}

function getGeneratedDescription(direction: DirectionOption, workflow: WorkflowOption, audience: string, purpose: string): string {
  const base = purpose.trim() || direction.description;
  const audiencePart = audience.trim() || direction.defaultAudience;
  return `${base} Для: ${audiencePart}. Формат работы: ${workflow.title.toLowerCase()}.`;
}

function getGeneratedChatIntro(direction: DirectionOption, workflow: WorkflowOption): string {
  return `Я помогу как ${direction.title.toLowerCase()}: ${workflow.description.toLowerCase()} Начните с задачи или контекста, а я предложу лучший следующий шаг.`;
}

function getTemperature(direction: DirectionId, workflow: WorkflowId): number {
  if (direction === 'content') return 0.7;
  if (workflow === 'automation' || direction === 'support' || direction === 'operations') return 0.2;
  return 0.35;
}

function getMaxIterations(workflow: WorkflowId, autonomy: AutonomyId): number {
  const base = workflow === 'automation' ? 8 : workflow === 'monitoring' ? 6 : 5;
  return autonomy === 'proactive' ? Math.min(base + 1, 10) : base;
}

function getMaxTokens(workflow: WorkflowId): number {
  if (workflow === 'production') return 6144;
  if (workflow === 'monitoring') return 5120;
  return 4096;
}

function SelectionCard({
  title,
  description,
  icon: Icon,
  selected,
  onClick,
  accent,
  extra,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  selected: boolean;
  onClick: () => void;
  accent?: string;
  extra?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-[22px] border p-5 text-left transition-all',
        selected
          ? 'border-slate-900 bg-slate-950 text-white shadow-[0_18px_45px_-28px_rgba(15,23,42,0.8)]'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className={cn('rounded-2xl p-3', selected ? 'bg-white/10' : accent ?? 'bg-slate-100')}>
          <Icon className={cn('h-5 w-5', selected ? 'text-white' : 'text-slate-800')} />
        </div>
        {selected && <Badge className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white">Выбрано</Badge>}
      </div>
      <h3 className="mt-5 text-lg font-semibold">{title}</h3>
      <p className={cn('mt-2 text-sm leading-6', selected ? 'text-slate-300' : 'text-slate-600')}>{description}</p>
      {extra && <div className="mt-4">{extra}</div>}
    </button>
  );
}

export function StackBuilderPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { data: tools = [], isLoading: toolsLoading } = useBuiltinTools();
  const { data: chatAgents = [] } = useChatAgents();
  const createAgent = useCreateAgent();
  const createChat = useCreateChat();

  const [step, setStep] = useState<BuilderStep>(1);
  const [directionId, setDirectionId] = useState<DirectionId>('research');
  const [workflowId, setWorkflowId] = useState<WorkflowId>('advisory');
  const [purpose, setPurpose] = useState('');
  const [audience, setAudience] = useState('');
  const [selectedPackIds, setSelectedPackIds] = useState<CapabilityPackId[]>([]);
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([]);
  const [hasCustomizedPacks, setHasCustomizedPacks] = useState(false);
  const [hasCustomizedTools, setHasCustomizedTools] = useState(false);
  const [toneId, setToneId] = useState<ToneId>('professional');
  const [autonomyId, setAutonomyId] = useState<AutonomyId>('guided');
  const [extraRules, setExtraRules] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [modelProfileId, setModelProfileId] = useState<ModelProfileId>('balanced');
  const [hasCustomizedModelProfile, setHasCustomizedModelProfile] = useState(false);
  const [name, setName] = useState('');
  const [hasCustomName, setHasCustomName] = useState(false);
  const [customChatIntro, setCustomChatIntro] = useState('');

  const direction = useMemo(() => directionById(directionId), [directionId]);
  const workflow = useMemo(() => workflowById(workflowId), [workflowId]);
  const suggestedPackIds = useMemo(() => getSuggestedPackIds(directionId, workflowId), [directionId, workflowId]);
  const recommendedProfileId = useMemo(() => getRecommendedModelProfile(directionId, workflowId), [directionId, workflowId]);
  const modelProfile = useMemo(() => modelProfileById(modelProfileId), [modelProfileId]);

  useEffect(() => {
    if (!hasCustomizedPacks) setSelectedPackIds(suggestedPackIds);
  }, [suggestedPackIds, hasCustomizedPacks]);

  useEffect(() => {
    if (!hasCustomizedModelProfile) {
      setModelProfileId(recommendedProfileId);
    }
  }, [recommendedProfileId, hasCustomizedModelProfile]);

  const recommendedToolIds = useMemo(() => {
    const packSlugs = selectedPackIds.flatMap((packId) => capabilityPacks.find((pack) => pack.id === packId)?.toolSlugs ?? []);
    const autoIncludedSlugs = unique(packSlugs).filter((slug) => !AUTO_EXCLUDED_TOOL_SLUGS.has(slug));
    return getToolIdsBySlugs(tools, autoIncludedSlugs);
  }, [selectedPackIds, tools]);

  useEffect(() => {
    if (!hasCustomizedTools) setSelectedToolIds(recommendedToolIds);
  }, [recommendedToolIds, hasCustomizedTools]);

  const generatedName = useMemo(() => getGeneratedName(direction, workflow), [direction, workflow]);

  useEffect(() => {
    if (!hasCustomName) setName(generatedName);
  }, [generatedName, hasCustomName]);

  const generatedDescription = useMemo(
    () => getGeneratedDescription(direction, workflow, audience, purpose),
    [direction, workflow, audience, purpose],
  );
  const generatedChatIntro = useMemo(() => getGeneratedChatIntro(direction, workflow), [direction, workflow]);
  const starterPrompts = useMemo(
    () => getGeneratedStarterPrompts(direction, workflow, audience, purpose),
    [direction, workflow, audience, purpose],
  );

  const selectedTools = useMemo(
    () => tools.filter((tool) => selectedToolIds.includes(tool.id)),
    [tools, selectedToolIds],
  );

  const generatedSystemPrompt = useMemo(() => {
    const sections: string[] = [];

    sections.push(`Ты — ${name.trim() || generatedName}.`);
    sections.push(`Роль агента: ${direction.title}.`);
    sections.push(`Основной режим работы: ${workflow.title}.`);
    sections.push(`Главная цель: ${purpose.trim() || direction.sample}.`);
    sections.push(`Целевая аудитория: ${audience.trim() || direction.defaultAudience}.`);
    sections.push(getToneInstruction(toneId));
    sections.push(getAutonomyInstruction(autonomyId));
    sections.push(getWorkflowInstruction(workflow));
    sections.push(`Ключевые задачи:\n${direction.baseTasks.map((task) => `- ${task}`).join('\n')}`);

    if (selectedTools.length > 0) {
      sections.push(
        `Доступные инструменты:\n${selectedTools.map((tool) => `- ${tool.name}: ${tool.description ?? 'используй по назначению'}`).join('\n')}`,
      );
      sections.push('Используй инструменты только там, где они реально повышают качество ответа. Не выдумывай результат вызова инструмента.');
    } else {
      sections.push('Сейчас агент работает без внешних инструментов и опирается на диалог, логику и встроенные знания модели.');
    }

    if (extraRules.trim()) sections.push(`Дополнительные правила:\n${extraRules.trim()}`);

    sections.push('Если задачу можно довести до следующего действия, обязательно предложи пользователю понятный следующий шаг.');
    sections.push('Отвечай структурированно: сначала краткий вывод, затем детали, затем конкретное продолжение.');

    return sections.join('\n\n');
  }, [name, generatedName, direction, workflow, purpose, audience, toneId, autonomyId, selectedTools, extraRules]);
  const runtimeConfig = useMemo(() => ({
    model_external_id: modelProfile.model,
    temperature: getTemperature(directionId, workflowId),
    max_iterations: getMaxIterations(workflowId, autonomyId),
    max_tokens: getMaxTokens(workflowId),
    chat_intro: customChatIntro.trim() || generatedChatIntro,
    starter_prompts: starterPrompts,
  }), [modelProfile, directionId, workflowId, autonomyId, customChatIntro, generatedChatIntro, starterPrompts]);

  const selectedPackObjects = capabilityPacks.filter((pack) => selectedPackIds.includes(pack.id));
  const preferredCodingAgent = useMemo(
    () => chatAgents.find((agent) => agent.is_coding_model && /(orchestrator|fullstack|kimi)/i.test(agent.name))
      ?? chatAgents.find((agent) => agent.is_coding_model && /coding/i.test(agent.name))
      ?? chatAgents.find((agent) => agent.is_coding_model)
      ?? null,
    [chatAgents],
  );
  const canContinue = useMemo(() => {
    if (step === 1) return Boolean(directionId);
    if (step === 2) return Boolean(workflowId);
    return true;
  }, [step, directionId, workflowId]);

  const launchAgent = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    const agent = await createAgent.mutateAsync({
      name: name.trim() || generatedName,
      description: generatedDescription,
      visibility,
      system_prompt: generatedSystemPrompt,
      tool_ids: selectedToolIds,
      runtime_config: runtimeConfig,
    });

    const chat = await createChat.mutateAsync({
      mode: 'agent',
      title: 'Новый чат',
      agent_id: agent.id,
    });

    navigate(`/chats?chat=${chat.id}`);
  };

  const launchBlueprintChat = async (blueprint: FullstackBlueprint) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    const chat = preferredCodingAgent
      ? await createChat.mutateAsync({
        mode: 'agent',
        title: blueprint.title,
        agent_id: preferredCodingAgent.id,
      })
      : await createChat.mutateAsync({
        mode: 'general',
        title: blueprint.title,
        model_external_id: 'openai/gpt-5.4',
        system_prompt: FALLBACK_FULLSTACK_SYSTEM_PROMPT,
      });

    navigate(`/chats?chat=${chat.id}&prefill=${encodeURIComponent(blueprint.prompt)}`);
  };

  if (toolsLoading) {
    return (
      <div className="container mx-auto flex min-h-[50vh] max-w-5xl items-center justify-center px-4 py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_30%,#f8fafc_100%)]">
      <div className="container mx-auto max-w-7xl px-4 py-8 md:py-12">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="space-y-6">
            <section className="rounded-[30px] border border-slate-200 bg-white p-8 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.35)]">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="rounded-full bg-slate-950 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white">
                  Конструктор реального агента
                </Badge>
                <Badge variant="outline" className="rounded-full px-4 py-1 text-xs text-slate-600">
                  Итог: создаём и запускаем
                </Badge>
              </div>

              <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">
                Соберите AI-агента, которого можно сразу начать использовать
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">
                Это уже не подбор абстрактного стека. На выходе получится реальный агент с ролью, моделью,
                инструментами, системным промптом и стартовыми сценариями. После финального шага мы создадим его
                в системе и откроем в playground.
              </p>

              <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-600">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">исследователь</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">поддержка</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">продажи</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">контент</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">автоматизация</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">новости</span>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/builder/agent"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Экспертный ручной режим
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </section>

            <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.35)] md:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Fullstack blueprints</p>
                  <h2 className="mt-2 text-3xl font-semibold text-slate-950">Готовые шаблоны для фронта, бэка и базы в одном чате</h2>
                  <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
                    Это быстрый вход в новый fullstack-flow: открываем chat с coding-agent и сразу подставляем большой стартовый prompt под конкретный стек.
                  </p>
                </div>
                <Badge variant="outline" className="rounded-full px-4 py-1 text-xs text-slate-600">
                  {preferredCodingAgent ? `Coding agent: ${preferredCodingAgent.name}` : 'Fallback: GPT-5.4'}
                </Badge>
              </div>

              <div className="mt-6 grid gap-4 xl:grid-cols-2">
                {fullstackBlueprints.map((blueprint) => {
                  const Icon = blueprint.icon;
                  return (
                    <Card key={blueprint.id} className="rounded-[24px] border-slate-200 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="rounded-2xl bg-slate-100 p-3">
                          <Icon className="h-5 w-5 text-slate-800" />
                        </div>
                        <Badge variant="outline" className="rounded-full bg-slate-50 px-3 py-1 text-[11px] text-slate-600">
                          {blueprint.stackSummary}
                        </Badge>
                      </div>
                      <h3 className="mt-5 text-lg font-semibold text-slate-950">{blueprint.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{blueprint.description}</p>
                      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-600">
                        {blueprint.prompt}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            void navigator.clipboard.writeText(blueprint.prompt);
                          }}
                        >
                          Скопировать prompt
                        </Button>
                        <Button
                          type="button"
                          onClick={() => { void launchBlueprintChat(blueprint); }}
                          disabled={createChat.isPending}
                        >
                          {createChat.isPending ? 'Создаю чат...' : 'Открыть в чате'}
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.35)] md:p-8">
              <div className="flex flex-wrap items-center gap-3">
                {[1, 2, 3, 4, 5].map((value) => (
                  <div
                    key={value}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
                      step === value
                        ? 'border-slate-900 bg-slate-950 text-white'
                        : step > value
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-slate-50 text-slate-500',
                    )}
                  >
                    <span className="font-semibold">{value}</span>
                    <span>
                      {value === 1 && 'Направление'}
                      {value === 2 && 'Формат'}
                      {value === 3 && 'Возможности'}
                      {value === 4 && 'Стиль'}
                      {value === 5 && 'Запуск'}
                    </span>
                  </div>
                ))}
              </div>

              {step === 1 && (
                <div className="mt-8">
                  <div className="mb-6">
                    <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Шаг 1</p>
                    <h2 className="mt-2 text-3xl font-semibold text-slate-950">Какого агента вы хотите собрать</h2>
                    <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                      Выберите направление. Уже на этом шаге видно, насколько широко можно запускать агентов на текущих возможностях платформы.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {directionOptions.map((option) => (
                      <SelectionCard
                        key={option.id}
                        title={option.title}
                        description={option.description}
                        icon={option.icon}
                        selected={directionId === option.id}
                        onClick={() => setDirectionId(option.id)}
                        accent="bg-sky-50"
                        extra={
                          <p className={cn('text-xs leading-5', directionId === option.id ? 'text-slate-300' : 'text-slate-500')}>
                            {option.sample}
                          </p>
                        }
                      />
                    ))}
                  </div>

                  <div className="mt-8 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Что он должен делать для вас</label>
                      <Textarea
                        value={purpose}
                        onChange={(event) => setPurpose(event.target.value)}
                        placeholder={direction.purposeHint}
                        className="min-h-[188px]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Для кого этот агент</label>
                      <Input
                        value={audience}
                        onChange={(event) => setAudience(event.target.value)}
                        placeholder={direction.defaultAudience}
                      />
                      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Сейчас собираем</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{direction.title}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{direction.sample}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="mt-8">
                  <div className="mb-6">
                    <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Шаг 2</p>
                    <h2 className="mt-2 text-3xl font-semibold text-slate-950">Как агент должен работать</h2>
                    <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                      Один и тот же агент можно сделать советником, генератором материалов, мониторингом или операционным исполнителем.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {workflowOptions.map((option) => (
                      <SelectionCard
                        key={option.id}
                        title={option.title}
                        description={option.description}
                        icon={option.icon}
                        selected={workflowId === option.id}
                        onClick={() => setWorkflowId(option.id)}
                        accent="bg-amber-50"
                        extra={
                          <div className="flex flex-wrap gap-2">
                            {option.deliverables.map((deliverable) => (
                              <span
                                key={deliverable}
                                className={cn(
                                  'rounded-full px-2.5 py-1 text-xs font-medium',
                                  workflowId === option.id ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-600',
                                )}
                              >
                                {deliverable}
                              </span>
                            ))}
                          </div>
                        }
                      />
                    ))}
                  </div>

                  <div className="mt-6 rounded-[24px] border border-slate-200 bg-gradient-to-r from-sky-50 to-white p-5">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Рекомендация на этом шаге</p>
                    <p className="mt-3 text-base font-semibold text-slate-900">
                      Для направления «{direction.title}» хорошо подходит формат «{workflow.title.toLowerCase()}».
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Это влияет на инструменты, модель и стиль ответа. Например, production-поток делает упор на готовые черновики,
                      а automation-поток ведёт к webhook/API сценариям и более инициативному поведению.
                    </p>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="mt-8">
                  <div className="mb-6">
                    <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Шаг 3</p>
                    <h2 className="mt-2 text-3xl font-semibold text-slate-950">Какие возможности дать агенту</h2>
                    <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                      Здесь мы уже работаем с реальными инструментами платформы. Сначала выбираете capability-паки, затем при желании
                      вручную дотачиваете фактический набор инструментов.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {capabilityPacks.map((pack) => (
                      <SelectionCard
                        key={pack.id}
                        title={pack.title}
                        description={pack.description}
                        icon={pack.icon}
                        selected={selectedPackIds.includes(pack.id)}
                        onClick={() => {
                          setHasCustomizedPacks(true);
                          setSelectedPackIds((current) => toggleArrayValue(current, pack.id));
                        }}
                        accent="bg-emerald-50"
                      />
                    ))}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setHasCustomizedPacks(false);
                        setSelectedPackIds(suggestedPackIds);
                      }}
                    >
                      Вернуть рекомендуемые capability-паки
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setHasCustomizedTools(false);
                        setSelectedToolIds(recommendedToolIds);
                      }}
                    >
                      Вернуть рекомендуемые инструменты
                    </Button>
                  </div>

                  <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-slate-700" />
                      <p className="text-sm font-semibold text-slate-900">Сейчас агент сможет</p>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedPackObjects.length > 0 ? (
                        selectedPackObjects.map((pack) => (
                          <Badge key={pack.id} variant="outline" className="rounded-full bg-white px-3 py-1">
                            {pack.title}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-slate-500">Пока выбран базовый режим без дополнительных capability-паков.</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="mb-2 flex items-center justify-between gap-4">
                      <label className="block text-sm font-medium text-slate-700">Фактические инструменты агента</label>
                      <span className="text-xs text-slate-500">Можно тонко докрутить вручную</span>
                    </div>
                    <ToolSelector
                      tools={tools}
                      selected={selectedToolIds}
                      onChange={(ids) => {
                        setHasCustomizedTools(true);
                        setSelectedToolIds(ids);
                      }}
                    />
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="mt-8">
                  <div className="mb-6">
                    <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Шаг 4</p>
                    <h2 className="mt-2 text-3xl font-semibold text-slate-950">Как агент должен вести диалог</h2>
                    <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                      На этом шаге мы превращаем функциональность в характер: какой будет тон, насколько инициативным будет агент и какие правила ему задать.
                    </p>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-2">
                    <div>
                      <p className="mb-3 text-sm font-medium text-slate-700">Тон общения</p>
                      <div className="space-y-3">
                        {toneOptions.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setToneId(option.id)}
                            className={cn(
                              'w-full rounded-2xl border px-4 py-4 text-left transition-colors',
                              toneId === option.id ? 'border-slate-900 bg-slate-950 text-white' : 'border-slate-200 bg-white hover:bg-slate-50',
                            )}
                          >
                            <p className="font-semibold">{option.title}</p>
                            <p className={cn('mt-1 text-sm', toneId === option.id ? 'text-slate-300' : 'text-slate-600')}>
                              {option.description}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-3 text-sm font-medium text-slate-700">Уровень инициативы</p>
                      <div className="space-y-3">
                        {autonomyOptions.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setAutonomyId(option.id)}
                            className={cn(
                              'w-full rounded-2xl border px-4 py-4 text-left transition-colors',
                              autonomyId === option.id ? 'border-slate-900 bg-slate-950 text-white' : 'border-slate-200 bg-white hover:bg-slate-50',
                            )}
                          >
                            <p className="font-semibold">{option.title}</p>
                            <p className={cn('mt-1 text-sm', autonomyId === option.id ? 'text-slate-300' : 'text-slate-600')}>
                              {option.description}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <label className="mb-1 block text-sm font-medium text-slate-700">Дополнительные правила и ограничения</label>
                    <Textarea
                      value={extraRules}
                      onChange={(event) => setExtraRules(event.target.value)}
                      placeholder={'Например:\n- не придумывать факты\n- если инструмент не дал ответ, честно говорить об этом\n- всегда завершать ответ конкретным следующим шагом'}
                      className="min-h-[140px]"
                    />
                  </div>
                </div>
              )}

              {step === 5 && (
                <div className="mt-8">
                  <div className="mb-6">
                    <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Шаг 5</p>
                    <h2 className="mt-2 text-3xl font-semibold text-slate-950">Запуск реального агента</h2>
                    <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                      Осталось выбрать launch-параметры. После этого агент создастся в системе и откроется для использования.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Название агента</label>
                      <Input
                        value={name}
                        onChange={(event) => {
                          setHasCustomName(true);
                          setName(event.target.value);
                        }}
                        placeholder={generatedName}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Видимость</label>
                      <select
                        value={visibility}
                        onChange={(event) => setVisibility(event.target.value as 'public' | 'private')}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="private">Приватный</option>
                        <option value="public">Публичный</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-6">
                    <p className="mb-3 text-sm font-medium text-slate-700">Профиль модели</p>
                    <div className="grid gap-4 md:grid-cols-3">
                      {modelProfiles.map((profile) => (
                        <SelectionCard
                          key={profile.id}
                          title={profile.title}
                          description={profile.description}
                          icon={Gauge}
                          selected={modelProfileId === profile.id}
                          onClick={() => {
                            setHasCustomizedModelProfile(true);
                            setModelProfileId(profile.id);
                          }}
                          accent="bg-purple-50"
                          extra={
                            <p className={cn('text-xs', modelProfileId === profile.id ? 'text-slate-300' : 'text-slate-500')}>
                              {profile.model}
                            </p>
                          }
                        />
                      ))}
                    </div>
                    <p className="mt-3 text-sm text-slate-500">
                      Сейчас рекомендуем профиль: <span className="font-medium text-slate-700">{modelProfileById(recommendedProfileId).title}</span>
                    </p>
                  </div>

                  <div className="mt-6">
                    <label className="mb-1 block text-sm font-medium text-slate-700">Описание в чате</label>
                    <Textarea
                      value={customChatIntro}
                      onChange={(event) => setCustomChatIntro(event.target.value)}
                      placeholder={generatedChatIntro}
                      className="min-h-[120px]"
                    />
                  </div>

                  <div className="mt-6 grid gap-4 lg:grid-cols-2">
                    <Card className="rounded-[24px] border-slate-200 bg-slate-50 p-5">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Что создадим</p>
                      <p className="mt-3 text-lg font-semibold text-slate-950">{name.trim() || generatedName}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{generatedDescription}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Badge variant="outline" className="rounded-full bg-white px-3 py-1">{modelProfile.title}</Badge>
                        <Badge variant="outline" className="rounded-full bg-white px-3 py-1">{selectedToolIds.length} инструментов</Badge>
                        <Badge variant="outline" className="rounded-full bg-white px-3 py-1">{visibility === 'public' ? 'Публичный' : 'Приватный'}</Badge>
                      </div>
                    </Card>
                    <Card className="rounded-[24px] border-slate-200 bg-slate-50 p-5">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Быстрые сценарии старта</p>
                      <div className="mt-3 space-y-2">
                        {starterPrompts.map((prompt) => (
                          <div key={prompt} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                            {prompt}
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>

                  <div className="mt-6">
                    <label className="mb-1 block text-sm font-medium text-slate-700">Предпросмотр системного промпта</label>
                    <Textarea value={generatedSystemPrompt} readOnly className="min-h-[260px] font-mono text-sm" />
                  </div>

                  {!isAuthenticated && (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      Для финального запуска нужен вход в аккаунт. После входа можно сразу создать агента.
                    </div>
                  )}
                </div>
              )}

              <div className="mt-8 flex flex-wrap items-center gap-3">
                {step > 1 && (
                  <Button type="button" variant="outline" onClick={() => setStep((step - 1) as BuilderStep)}>
                    Назад
                  </Button>
                )}
                {step < 5 && (
                  <Button type="button" onClick={() => setStep((step + 1) as BuilderStep)} disabled={!canContinue}>
                    Далее
                  </Button>
                )}
                {step === 5 && (
                  <Button type="button" onClick={launchAgent} disabled={createAgent.isPending}>
                    {createAgent.isPending ? 'Создаём агента...' : isAuthenticated ? 'Создать и открыть агента' : 'Войти и запустить'}
                  </Button>
                )}
              </div>

              {createAgent.isError && (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  Ошибка создания агента: {(createAgent.error as Error).message}
                </div>
              )}
            </section>
          </div>

          <aside className="lg:sticky lg:top-24">
            <Card className="rounded-[30px] border-slate-200 bg-slate-950 p-6 text-white shadow-[0_30px_80px_-40px_rgba(15,23,42,0.8)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Живой итог</p>
                  <h2 className="mt-2 text-2xl font-semibold">Что получится на выходе</h2>
                </div>
                <div className="rounded-2xl bg-white/10 p-3">
                  <Bot className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-6 rounded-[24px] border border-white/10 bg-white/5 p-5">
                <p className="text-sm font-medium text-slate-300">Агент</p>
                <p className="mt-2 text-xl font-semibold">{name.trim() || generatedName}</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">{generatedDescription}</p>
              </div>

              <div className="mt-6 space-y-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Направление</p>
                  <p className="mt-1 text-sm font-medium">{direction.title}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Формат работы</p>
                  <p className="mt-1 text-sm font-medium">{workflow.title}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Профиль модели</p>
                  <p className="mt-1 text-sm font-medium">{modelProfile.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{modelProfile.model}</p>
                </div>
              </div>

              <div className="mt-6">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Доступные возможности</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedPackObjects.length > 0 ? (
                    selectedPackObjects.map((pack) => (
                      <span key={pack.id} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                        {pack.title}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">Пока без дополнительных capability-паков.</span>
                  )}
                </div>
              </div>

              <div className="mt-6">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Инструменты агента</p>
                <div className="mt-3 space-y-2">
                  {selectedTools.length > 0 ? (
                    selectedTools.map((tool) => (
                      <div key={tool.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <p className="text-sm font-medium">{tool.name}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{tool.description}</p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-500">
                      Агент пока без внешних инструментов. Это тоже рабочий вариант для чисто диалоговых сценариев.
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 rounded-[24px] border border-emerald-400/20 bg-emerald-400/10 p-5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-300" />
                  <p className="text-sm font-semibold text-emerald-200">Что будет после финального шага</p>
                </div>
                <p className="mt-3 text-sm leading-6 text-emerald-50/90">
                  Мы создадим настоящего агента в системе, сохраним модель, инструменты, промпт и быстрые сценарии,
                  а затем сразу откроем его в playground, где можно начать диалог и проверить результат вживую.
                </p>
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
