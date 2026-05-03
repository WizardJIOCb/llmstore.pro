import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Bot,
  Code2,
  Coins,
  GitBranch,
  MessageSquare,
  Rocket,
  Share2,
  Terminal,
  Webhook,
  Wrench,
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface UseCaseCard {
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
  badge: string;
  icon: LucideIcon;
}

interface WorkflowStep {
  title: string;
  description: string;
  icon: LucideIcon;
}

const useCaseCards: UseCaseCard[] = [
  {
    title: 'Telegram News Agent',
    description: 'Агент читает источники, собирает дайджест, готовит пост и отдаёт результат в удобном виде.',
    href: '/builder/agent?template=telegram-news-agent',
    ctaLabel: 'Собрать похожего',
    badge: 'агент',
    icon: Bot,
  },
  {
    title: 'Landing Generator',
    description: 'Быстрый лендинг под услугу, книгу, игру или продукт: текст, структура, preview и дальнейшие правки.',
    href: '/gallery?scenario=landing',
    ctaLabel: 'Смотреть примеры',
    badge: 'preview',
    icon: Code2,
  },
  {
    title: 'Webhook Bot',
    description: 'Мини-бот или webhook-сценарий с логами, статусами запусков и понятным циклом исправлений.',
    href: '/builder/agent?template=webhook-bot',
    ctaLabel: 'Собрать бота',
    badge: 'run',
    icon: Webhook,
  },
  {
    title: 'RAG Docs Chat',
    description: 'Чат по документам, базе знаний или заметкам, где важны источники, контекст и повторяемый сценарий.',
    href: '/builder/agent?template=rag-docs-chat',
    ctaLabel: 'Выбрать шаблон',
    badge: 'docs',
    icon: MessageSquare,
  },
];

const workflowSteps: WorkflowStep[] = [
  {
    title: 'Chat',
    description: 'Пользователь формулирует задачу обычным языком, без отдельного ТЗ на три страницы.',
    icon: MessageSquare,
  },
  {
    title: 'Agent',
    description: 'Выбирается агент, модель и набор инструментов под конкретный рабочий сценарий.',
    icon: Bot,
  },
  {
    title: 'Workspace',
    description: 'Результат получает контекст проекта: файлы, состояние, историю и будущие checkpoints.',
    icon: GitBranch,
  },
  {
    title: 'Run',
    description: 'Runnable-артефакт можно открыть, запустить, проверить и вернуть в цикл правок.',
    icon: Terminal,
  },
  {
    title: 'Fix',
    description: 'Ошибка превращается в понятный prompt для исправления, а не в тупик для пользователя.',
    icon: Wrench,
  },
  {
    title: 'Share',
    description: 'Готовый preview, чат или проект можно показать, склонировать и использовать дальше.',
    icon: Share2,
  },
];

const comparisonRows = [
  {
    tool: 'ChatGPT',
    strong: 'Диалог, идеи, объяснения, быстрые черновики.',
    llmstore: 'Агенты, сценарии, галерея, баланс и путь от сообщения к runnable-результату.',
  },
  {
    tool: 'Cursor',
    strong: 'Работа с кодом внутри IDE и локального проекта.',
    llmstore: 'Публичные preview, агентные шаблоны, шаринг и продуктовая витрина результатов.',
  },
  {
    tool: 'Lovable',
    strong: 'Генерация приложений из prompt-а.',
    llmstore: 'Свои агенты, cost control, project history и сценарии вокруг чатов, ботов и запусков.',
  },
  {
    tool: 'Replit',
    strong: 'Онлайн-среда для запуска кода и проектов.',
    llmstore: 'AI-first поток: Chat -> Agent -> Workspace -> Run -> Fix -> Share.',
  },
];

const costExamples = [
  {
    label: 'Короткий запрос',
    title: 'Небольшие списания',
    description: 'Простые вопросы, правки текста и короткие ответы расходуют баланс мягко и сразу попадают в историю.',
  },
  {
    label: 'Preview',
    title: 'Цена видна по итерации',
    description: 'Для HTML-preview важны модель, длина промпта и число правок, поэтому показываем фактический расход.',
  },
  {
    label: 'Agent run',
    title: 'Контекст влияет на итог',
    description: 'Агентные сценарии могут быть дороже обычного чата, если добавляются код, логи и повторные исправления.',
  },
  {
    label: 'История',
    title: 'Без скрытых пакетов',
    description: 'Баланс работает как кошелёк: списания идут за реальные операции, а не за абстрактный тариф.',
  },
];

export function UseCaseCardsSection() {
  return (
    <section className="container mx-auto px-4 py-12">
      <div className="max-w-3xl">
        <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Use cases</p>
        <h2 className="mt-3 text-3xl font-bold text-slate-950">Что можно собрать за 5 минут</h2>
        <p className="mt-4 text-base leading-7 text-slate-600">
          Не абстрактные AI-возможности, а понятные сценарии: агент, мини-проект, бот, лендинг или рабочий прототип.
        </p>
      </div>

      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {useCaseCards.map((card) => {
          const Icon = card.icon;

          return (
            <article key={card.title} className="flex min-h-[260px] flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-900">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  {card.badge}
                </span>
              </div>

              <h3 className="mt-5 text-xl font-semibold text-slate-950">{card.title}</h3>
              <p className="mt-3 flex-1 text-sm leading-6 text-slate-600">{card.description}</p>

              <Link to={card.href} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
                {card.ctaLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function ProductWorkflowSection() {
  return (
    <section id="how-it-works" className="bg-slate-950 py-14 text-white">
      <div className="container mx-auto px-4">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm uppercase tracking-[0.18em] text-sky-200">Рабочий цикл</p>
            <h2 className="mt-3 text-3xl font-bold">От сообщения к результату, который можно открыть</h2>
            <p className="mt-4 text-base leading-7 text-slate-300">
              LLMStore.pro объясняет продукт через один цикл: написал задачу, выбрал агента, получил артефакт,
              запустил, увидел логи, исправил ошибку и поделился результатом.
            </p>
          </div>
          <Link
            to="/builder/stack"
            className="inline-flex w-fit items-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
          >
            Начать с агента
            <Rocket className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {workflowSteps.map((step, index) => {
            const Icon = step.icon;

            return (
              <article key={step.title} className="rounded-lg border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <Icon className="h-5 w-5 text-sky-200" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{step.description}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function ComparisonSection() {
  return (
    <section className="container mx-auto px-4 py-12">
      <div className="max-w-3xl">
        <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Positioning</p>
        <h2 className="mt-3 text-3xl font-bold text-slate-950">LLMStore.pro не пытается заменить всё подряд</h2>
        <p className="mt-4 text-base leading-7 text-slate-600">
          Смысл не в ещё одном чате. Смысл в слое, где агенты, runnable-проекты, preview, история и расходы живут в одном рабочем потоке.
        </p>
      </div>

      <div className="mt-7 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)] border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 md:grid">
          <div className="px-4 py-3">Инструмент</div>
          <div className="px-4 py-3">Где силён</div>
          <div className="px-4 py-3">Что добавляет LLMStore.pro</div>
        </div>
        {comparisonRows.map((row) => (
          <div key={row.tool} className="grid gap-3 border-b border-slate-200 px-4 py-4 last:border-b-0 md:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="font-semibold text-slate-950">{row.tool}</div>
            <div className="text-sm leading-6 text-slate-600">{row.strong}</div>
            <div className="text-sm leading-6 text-slate-700">{row.llmstore}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CostExamplesSection() {
  return (
    <section className="container mx-auto px-4 py-12">
      <div className="rounded-lg border border-slate-200 bg-[linear-gradient(135deg,#f8fafc,#ffffff_45%,#ecfdf5)] p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Расходы</p>
            <h2 className="mt-3 text-3xl font-bold text-slate-950">Прозрачные списания без сюрпризов</h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Баланс не означает, что один сценарий стоит всю сумму пополнения. Это запас для запросов к моделям,
              генераций, preview и запусков; итог зависит от модели, контекста и числа итераций.
            </p>
          </div>
          <Link
            to="/pricing"
            className="inline-flex w-fit items-center gap-2 rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Как считается баланс
            <Coins className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {costExamples.map((example) => (
            <article key={example.label} className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">
                {example.label}
              </p>
              <h3 className="mt-3 text-lg font-semibold text-slate-950">{example.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{example.description}</p>
            </article>
          ))}
        </div>

        <p className="mt-5 text-sm leading-6 text-slate-500">
          На странице pricing показываем реальные примеры и фиксированные пополнения, но не обещаем “ровно N сообщений”:
          разные модели и задачи расходуют баланс по-разному.
        </p>
      </div>
    </section>
  );
}
