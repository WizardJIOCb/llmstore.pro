import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Compass,
  Search,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, Card } from '../../components/ui';

type MilestoneStatus = 'done' | 'inProgress' | 'planned' | 'research';

interface MilestoneItem {
  id: number;
  title: string;
  status: MilestoneStatus;
  description: string;
}

interface StatusMeta {
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
  badgeClassName: string;
  sectionClassName: string;
  cardClassName: string;
}

interface FocusCard {
  eyebrow: string;
  title: string;
  description: string;
}

const milestones: MilestoneItem[] = [
  {
    id: 1,
    title: 'Coding Agents Preview',
    status: 'done',
    description:
      'LLMStore уже умеет больше, чем просто чат с моделью. Мы двигаемся в сторону coding agents, которые не только отвечают текстом, но и реально помогают собирать, запускать и править проекты.',
  },
  {
    id: 2,
    title: 'Preview Editor Upgrade',
    status: 'done',
    description:
      'Прокачали Preview Editor: авто-Beautify при первом открытии, более удобное расположение действий и в целом более приятная работа с HTML-preview. Редактор стал меньше раздражать и больше помогать.',
  },
  {
    id: 3,
    title: 'Project Gallery',
    status: 'done',
    description:
      'Появилась галерея проектов, чтобы runnable и demo-истории не терялись в хаосе. Теперь проекты можно не только запускать, но и нормально показывать, смотреть и переиспользовать.',
  },
  {
    id: 4,
    title: 'Balance, Usage & History',
    status: 'done',
    description:
      'Добавили более внятную работу с балансом, историей запросов и расходом токенов. Хочется не магию "где-то что-то списалось", а нормальное понимание, что именно происходило и сколько это стоило.',
  },
  {
    id: 5,
    title: 'Private Links & Sharing',
    status: 'done',
    description:
      'Сделали приватные ссылки и более удобный шаринг. Проекты, превью и результаты работы теперь проще показывать точечно, без лишнего мусора и лишних открытых дверей.',
  },
  {
    id: 6,
    title: 'Reactions & Small UX Fixes',
    status: 'done',
    description:
      'Докрутили реакции и пачку мелких UX-улучшений. Не самая громкая часть продукта, но именно такие штуки делают сервис живым, а не просто набором экранов.',
  },
  {
    id: 7,
    title: 'Agent Chat Tools',
    status: 'inProgress',
    description:
      'Следующий нормальный шаг — полноценные инструменты внутри чата. Не просто "агент подумал", а агент реально может работать с файлами, командами, проектом и контекстом задачи.',
  },
  {
    id: 8,
    title: 'Runnable Project Bundles',
    status: 'inProgress',
    description:
      'LLMStore движется к формату Project Bundle: готовая связка проекта, окружения и логики запуска. Чтобы можно было открыть, понять, запустить и не тратить полдня на ручную сборку по кускам.',
  },
  {
    id: 9,
    title: 'Fix From Error Flow',
    status: 'inProgress',
    description:
      'Хотим довести до ума сценарий, где после ошибки не начинается цирк с ручными правками, а можно быстро дать агенту исправить проблему по логам и контексту. Ошибка должна быть не тупиком, а частью рабочего цикла.',
  },
  {
    id: 10,
    title: 'Deploy for Bots & Webhooks',
    status: 'inProgress',
    description:
      'Двигаем нормальный deploy для webhook-ботов и похожих сценариев. С логами, статусами, историей запусков и без ощущения, что ты опять руками собираешь серверную магию из палок.',
  },
  {
    id: 11,
    title: 'Workspace per Chat / Project',
    status: 'planned',
    description:
      'У каждого чата или проекта должен быть свой workspace: файлы, состояние, история действий, окружение. Без этого агентность быстро упирается в игрушечный режим.',
  },
  {
    id: 12,
    title: 'GitHub Import & Project Forks',
    status: 'planned',
    description:
      'Импорт проектов из GitHub, форки runnable-проектов и удобный старт от чужой заготовки. Чтобы LLMStore был не только про "создать с нуля", но и про "быстро подхватить и развить".',
  },
  {
    id: 13,
    title: 'Model Routing & Cost Control',
    status: 'planned',
    description:
      'Нужен умный роутинг моделей и нормальный контроль расходов. Какая модель лучше под код, какая дешевле, где fallback, сколько сожрёт запуск — всё это должно быть видно, а не угадываться по звёздам.',
  },
  {
    id: 14,
    title: 'Templates for Real Use Cases',
    status: 'planned',
    description:
      'Готовые шаблоны под реальные задачи: Telegram-боты, лендинги, вебхуки, мини-сервисы, research-агенты, code helpers. Людям нужен не "AI ради AI", а быстрый путь к рабочему результату.',
  },
  {
    id: 15,
    title: 'Shareable Demos & Public Project Pages',
    status: 'planned',
    description:
      'Хотим, чтобы проекты было удобно показывать другим: демо-страницы, публичные карточки, запуск примеров, быстрый форк. Если проект нельзя нормально показать, он почти не существует.',
  },
  {
    id: 16,
    title: 'Logs, Runs & Observability',
    status: 'planned',
    description:
      'Нужна внятная наблюдаемость: история раннов, логи, ошибки, токены, время выполнения, статусы деплоя. Когда проект исполняется, прозрачность становится не "фичей", а базовой необходимостью.',
  },
  {
    id: 17,
    title: 'Secrets & Safe Execution',
    status: 'planned',
    description:
      'Работа с секретами, переменными окружения и безопасным запуском должна быть встроенной частью платформы. Чем ближе LLMStore к реальному продакшену, тем меньше права на бардак.',
  },
  {
    id: 18,
    title: 'Team Workspaces',
    status: 'planned',
    description:
      'Дальше — командный режим: общие workspace, совместная работа, история изменений, доступы. Пока фокус на core-механике, но без этого платформа не вырастет в серьёзный инструмент.',
  },
  {
    id: 19,
    title: 'Telegram-first Integrations',
    status: 'research',
    description:
      'Интеграции с Telegram выглядят как один из самых живых сценариев для LLMStore. Агент, который можно быстро собрать, запустить и подключить к реальному каналу общения — это уже не демка, а полезная штука.',
  },
  {
    id: 20,
    title: 'Local + Cloud Hybrid Flow',
    status: 'research',
    description:
      'Интересный вектор — связка локальных моделей и облачных провайдеров в одном рабочем сценарии. Где-то важна цена, где-то скорость, где-то приватность. Хочется дать гибкость, а не навязывать один путь.',
  },
];

const focusCards: FocusCard[] = [
  {
    eyebrow: 'Следующий фокус',
    title: 'Tools inside chat',
    description:
      'Агент внутри чата должен не только отвечать, но и реально работать с файлами, командами и контекстом проекта.',
  },
  {
    eyebrow: 'Runnable flow',
    title: 'Bundles + deploy',
    description:
      'Связка Project Bundles, deploy для ботов и webhook-сценариев и более внятный путь от идеи до запуска.',
  },
  {
    eyebrow: 'Рабочий цикл',
    title: 'Run → error → fix → share',
    description:
      'Нормальный цикл разработки: запустил, увидел ошибку, быстро починил через агента и сразу показал результат.',
  },
];

const statusOrder: MilestoneStatus[] = ['done', 'inProgress', 'planned', 'research'];

const statusMeta: Record<MilestoneStatus, StatusMeta> = {
  done: {
    label: 'Done',
    title: 'Уже сделано',
    description: 'То, что уже shipped или частично shipped и уже двигает продукт вперёд.',
    icon: CheckCircle2,
    badgeClassName: 'border border-emerald-200 bg-emerald-100 text-emerald-800',
    sectionClassName: 'border-emerald-200/80 bg-emerald-50/70',
    cardClassName: 'border-emerald-100 bg-white/85',
  },
  inProgress: {
    label: 'In Progress',
    title: 'Сейчас в работе',
    description: 'Ближайшие продуктовые шаги, которые уже превращаются из идеи в рабочий контур.',
    icon: Clock3,
    badgeClassName: 'border border-sky-200 bg-sky-100 text-sky-800',
    sectionClassName: 'border-sky-200/80 bg-sky-50/75',
    cardClassName: 'border-sky-100 bg-white/85',
  },
  planned: {
    label: 'Planned',
    title: 'Запланировано',
    description: 'Следующий слой платформы, без которого агентность быстро упрётся в потолок.',
    icon: Compass,
    badgeClassName: 'border border-amber-200 bg-amber-100 text-amber-900',
    sectionClassName: 'border-amber-200/80 bg-amber-50/80',
    cardClassName: 'border-amber-100 bg-white/90',
  },
  research: {
    label: 'Research',
    title: 'Исследуем',
    description: 'Направления, которые уже выглядят перспективно, но требуют аккуратной проверки и формализации.',
    icon: Search,
    badgeClassName: 'border border-violet-200 bg-violet-100 text-violet-800',
    sectionClassName: 'border-violet-200/80 bg-violet-50/75',
    cardClassName: 'border-violet-100 bg-white/90',
  },
};

const summaryText =
  'LLMStore развивается из каталога AI-инструментов в рабочую платформу для runnable AI-проектов, coding agents и deploy-сценариев. Мы уже двигаем Preview Editor, галерею, баланс, приватные ссылки и первые agent-like возможности. Следующий фокус — tools inside chat, Project Bundles, deploy, логи, workspace и нормальный цикл "запустил → получил ошибку → быстро починил → показал результат".';

function getItemsByStatus(status: MilestoneStatus) {
  return milestones.filter((item) => item.status === status);
}

export function MilestonesPage() {
  const counts = {
    done: getItemsByStatus('done').length,
    inProgress: getItemsByStatus('inProgress').length,
    planned: getItemsByStatus('planned').length,
    research: getItemsByStatus('research').length,
  };

  return (
    <div className="overflow-hidden bg-[linear-gradient(180deg,#f7fbff_0%,#ffffff_36%,#f8fafc_100%)]">
      <section className="relative isolate">
        <div className="absolute inset-x-0 top-0 -z-10 h-[36rem] bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.55),rgba(255,255,255,0))]" />
        <div className="container mx-auto px-4 py-14 md:py-20">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_420px] lg:items-start">
            <div>
              <Badge className="rounded-full border border-sky-200 bg-white/85 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700 shadow-sm">
                Milestones
              </Badge>
              <h1 className="mt-5 max-w-4xl text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">
                Реальное движение продукта, а не список фантазий
              </h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
                Поэтому здесь сначала то, что уже сделано или partially shipped, потом то, что сейчас в работе, и только
                потом запланированное. Так лучше видно, как LLMStore реально превращается из каталога в платформу для
                runnable AI-проектов и coding agents.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/gallery"
                  className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
                >
                  Смотреть gallery
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/news"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/85 px-5 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-white"
                >
                  Читать новости
                </Link>
              </div>
            </div>

            <Card className="rounded-[28px] border-white/80 bg-white/85 p-6 shadow-[0_30px_80px_-36px_rgba(15,23,42,0.45)] backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Hero / intro</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">Короткая версия</h2>
                </div>
                <div className="rounded-2xl bg-slate-950 p-3 text-white shadow-lg">
                  <Sparkles className="h-5 w-5" />
                </div>
              </div>

              <p className="mt-6 text-base leading-7 text-slate-600">{summaryText}</p>

              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-2xl font-semibold text-slate-950">{counts.done}</p>
                  <p className="mt-1 text-sm text-slate-500">Done</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-2xl font-semibold text-slate-950">{counts.inProgress}</p>
                  <p className="mt-1 text-sm text-slate-500">In Progress</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-2xl font-semibold text-slate-950">{counts.planned}</p>
                  <p className="mt-1 text-sm text-slate-500">Planned</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-2xl font-semibold text-slate-950">{counts.research}</p>
                  <p className="mt-1 text-sm text-slate-500">Research</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 pb-8">
        <div className="grid gap-4 md:grid-cols-3">
          {focusCards.map((card) => (
            <Card
              key={card.title}
              className="rounded-[24px] border-white/80 bg-white/85 p-6 shadow-[0_18px_55px_-35px_rgba(15,23,42,0.4)] backdrop-blur"
            >
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{card.eyebrow}</p>
              <h2 className="mt-3 text-xl font-semibold text-slate-950">{card.title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">{card.description}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4 py-8 md:py-12">
        <div className="mb-8 max-w-3xl">
          <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Roadmap by status</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Что уже есть, что делаем сейчас и что дальше</h2>
          <p className="mt-4 text-base leading-7 text-slate-600">
            Ниже весь список milestones в том порядке, который читается честно: сначала shipped-часть, потом активная
            работа, потом запланированные блоки и отдельным слоем исследовательские направления.
          </p>
        </div>

        <div className="space-y-6">
          {statusOrder.map((status) => {
            const meta = statusMeta[status];
            const Icon = meta.icon;
            const items = getItemsByStatus(status);

            return (
              <section key={status}>
                <Card className={`rounded-[30px] border p-6 shadow-[0_24px_70px_-44px_rgba(15,23,42,0.35)] ${meta.sectionClassName}`}>
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="max-w-2xl">
                      <div className="flex items-center gap-3">
                        <div className="rounded-2xl bg-white/85 p-3 text-slate-900 shadow-sm">
                          <Icon className="h-5 w-5" />
                        </div>
                        <Badge className={`rounded-full px-3 py-1 text-[11px] font-semibold ${meta.badgeClassName}`}>
                          {meta.label}
                        </Badge>
                      </div>
                      <h3 className="mt-4 text-2xl font-semibold text-slate-950">{meta.title}</h3>
                      <p className="mt-3 text-base leading-7 text-slate-600">{meta.description}</p>
                    </div>

                    <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm text-slate-600">
                      {items.length} milestones
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 lg:grid-cols-2">
                    {items.map((item) => (
                      <article key={item.id} className={`rounded-[24px] border p-5 shadow-sm ${meta.cardClassName}`}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            #{String(item.id).padStart(2, '0')}
                          </span>
                          <Badge className={`rounded-full px-3 py-1 text-[11px] font-semibold ${meta.badgeClassName}`}>
                            {meta.label}
                          </Badge>
                        </div>
                        <h4 className="mt-4 text-xl font-semibold text-slate-950">{item.title}</h4>
                        <p className="mt-3 text-sm leading-7 text-slate-600">{item.description}</p>
                      </article>
                    ))}
                  </div>
                </Card>
              </section>
            );
          })}
        </div>
      </section>

      <section className="container mx-auto px-4 pb-16 pt-8">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="rounded-[30px] border-slate-200 bg-slate-950 p-8 text-white shadow-[0_30px_90px_-40px_rgba(2,6,23,0.65)]">
            <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Как читать эту страницу</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">LLMStore движется в сторону рабочей агентной платформы</h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
              Важная идея здесь простая: milestones должны показывать продуктовый ритм. Не набор обещаний, а понятную
              картину того, что уже появилось, что прямо сейчас собирается и какие системные слои будут добавляться
              дальше.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                <p className="mt-4 text-sm font-medium">Уже сделано</p>
                <p className="mt-2 text-sm text-slate-400">
                  Preview Editor, gallery, balance, sharing, UX и первые coding-agent шаги.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <Clock3 className="h-5 w-5 text-sky-300" />
                <p className="mt-4 text-sm font-medium">В работе</p>
                <p className="mt-2 text-sm text-slate-400">
                  Tools inside chat, Project Bundles, fix-from-error flow и deploy для ботов и webhook-сценариев.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <Compass className="h-5 w-5 text-amber-300" />
                <p className="mt-4 text-sm font-medium">Дальше по плану</p>
                <p className="mt-2 text-sm text-slate-400">
                  Workspace, observability, templates, team mode, safe execution и исследовательские векторы.
                </p>
              </div>
            </div>
          </Card>

          <Card className="rounded-[30px] border-slate-200 bg-white/90 p-8 shadow-[0_24px_70px_-44px_rgba(15,23,42,0.4)]">
            <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Навигация</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-950">Что смотреть рядом</h2>
            <div className="mt-6 space-y-3">
              <Link
                to="/gallery"
                className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Галерея проектов
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/news"
                className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Новости
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/guides"
                className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Guides / articles
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
