import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Compass,
  CreditCard,
  Layers3,
  Rocket,
  Sparkles,
} from 'lucide-react';
import { Badge, Card } from '../../components/ui';

type MilestoneStatus = 'shipped' | 'active' | 'planned';

interface MilestoneItem {
  period: string;
  title: string;
  description: string;
  status: MilestoneStatus;
  timelineOrder: number;
  label: string;
  icon: LucideIcon;
  highlights: string[];
}

interface FocusCard {
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
}

interface StatusMeta {
  eyebrow: string;
  title: string;
  description: string;
  badgeClassName: string;
  dotClassName: string;
}

const milestoneItems: MilestoneItem[] = [
  {
    period: 'Март 2026',
    title: 'Публичное открытие LLMStore.pro',
    description:
      'Запустили основу платформы: публичные страницы, каталог, статьи, новости и базовую витрину AI-направлений.',
    status: 'shipped',
    timelineOrder: 1,
    label: 'Запуск сайта',
    icon: Rocket,
    highlights: ['Главная витрина', 'Раздел новостей', 'Публичный каталог'],
  },
  {
    period: 'Апрель 2026',
    title: 'Подключение оплат и баланса',
    description:
      'Собираем понятный путь от пополнения до автоматического зачисления, чтобы сценарий оплаты был прозрачным и быстрым.',
    status: 'active',
    timelineOrder: 3,
    label: 'Платежный контур',
    icon: CreditCard,
    highlights: ['Пополнение баланса', 'Тарифные сценарии', 'Финансовые события'],
  },
  {
    period: 'Апрель - май 2026',
    title: 'Расширение библиотеки моделей и агентов',
    description:
      'Добавляем новые модели, тематические подборки и готовые AI-агенты под прикладные задачи бизнеса и разработки.',
    status: 'planned',
    timelineOrder: 4,
    label: 'Новые модели',
    icon: Sparkles,
    highlights: ['Новые модели', 'Готовые агенты', 'Подборки по кейсам'],
  },
  {
    period: 'Апрель 2026',
    title: 'Открытая страница планов и релизов',
    description:
      'Собираем крупные изменения в единый таймлайн, чтобы у пользователей была ясная картина: что уже вышло, что в работе и что идёт следующим.',
    status: 'shipped',
    timelineOrder: 2,
    label: 'Планы и релизы',
    icon: Layers3,
    highlights: ['История релизов', 'Крупные вехи', 'Статусы по этапам'],
  },
];

const focusCards: FocusCard[] = [
  {
    eyebrow: 'Сейчас в работе',
    title: 'Коммерческий контур',
    description: 'Делаем пополнение баланса и оплату понятными с первого касания.',
    points: ['Чёткий путь оплаты', 'Автоматическое зачисление', 'Публичные тарифные страницы'],
  },
  {
    eyebrow: 'Следующий релизный блок',
    title: 'Контент и модели',
    description: 'Расширяем продукт не только количественно, но и по сценариям использования.',
    points: ['Новые модели', 'Готовые AI-агенты', 'Более сильные тематические подборки'],
  },
  {
    eyebrow: 'На горизонте',
    title: 'Пульс продукта',
    description: 'Страница должна стать живым центром статуса продукта, а не просто архивом обновлений.',
    points: ['Крупные анонсы', 'Релизные заметки', 'Видимый план развития'],
  },
];

const statusStyles: Record<MilestoneStatus, { badge: string; dot: string; card: string; text: string }> = {
  shipped: {
    badge: 'bg-emerald-100 text-emerald-800',
    dot: 'border-emerald-400 bg-emerald-100',
    card: 'border-emerald-200/80 bg-emerald-50/70',
    text: 'Релиз доступен',
  },
  active: {
    badge: 'bg-sky-100 text-sky-800',
    dot: 'border-sky-400 bg-sky-100',
    card: 'border-sky-200/80 bg-sky-50/80',
    text: 'В активной работе',
  },
  planned: {
    badge: 'bg-amber-100 text-amber-900',
    dot: 'border-amber-400 bg-amber-100',
    card: 'border-amber-200/80 bg-amber-50/75',
    text: 'Запланировано',
  },
};

const statusMeta: Record<MilestoneStatus, StatusMeta> = {
  shipped: {
    eyebrow: 'Пройдено',
    title: 'Уже вышло',
    description: 'Опубликованные и доступные пользователям вехи.',
    badgeClassName: 'bg-emerald-100 text-emerald-800',
    dotClassName: 'bg-emerald-500',
  },
  active: {
    eyebrow: 'Сейчас',
    title: 'В работе',
    description: 'То, на чём команда фокусируется прямо сейчас.',
    badgeClassName: 'bg-sky-100 text-sky-800',
    dotClassName: 'bg-sky-500',
  },
  planned: {
    eyebrow: 'Дальше',
    title: 'Запланировано',
    description: 'Крупные шаги, которые стоят следующими в очереди.',
    badgeClassName: 'bg-amber-100 text-amber-900',
    dotClassName: 'bg-amber-500',
  },
};

const statusOrder: MilestoneStatus[] = ['shipped', 'active', 'planned'];

const milestonesByStatus = {
  shipped: milestoneItems.filter((item) => item.status === 'shipped'),
  active: milestoneItems.filter((item) => item.status === 'active'),
  planned: milestoneItems.filter((item) => item.status === 'planned'),
};

const pulseItems = [
  ...milestonesByStatus.active,
  ...milestonesByStatus.shipped,
  ...milestonesByStatus.planned,
];

const timelineItems = [...milestoneItems].sort((a, b) => b.timelineOrder - a.timelineOrder);

export function MilestonesPage() {
  return (
    <div className="overflow-hidden bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_42%,#f7f8fc_100%)]">
      <section className="relative isolate">
        <div className="absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.55),rgba(255,255,255,0))]" />
        <div className="container mx-auto px-4 py-14 md:py-20">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_420px] lg:items-center">
            <div>
              <div className="mb-5 flex flex-wrap gap-2">
                <Badge className="rounded-full bg-white/85 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700 shadow-sm">
                  Планы продукта
                </Badge>
                <Badge variant="outline" className="rounded-full bg-white/70 px-4 py-1 text-xs text-slate-600">
                  Roadmap + releases
                </Badge>
              </div>

              <h1 className="max-w-4xl text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">
                Планы, вехи и большие релизы LLMStore.pro
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
                Здесь собираем важные события по продукту: запуск сайта, подключение оплаты, новые модели,
                крупные обновления каталога и всё, что двигает платформу вперёд по понятному таймлайну.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/news"
                  className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
                >
                  Читать новости
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/builder/agent"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-5 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-white"
                >
                  Смотреть, что уже работает
                </Link>
              </div>
            </div>

            <Card className="relative overflow-hidden rounded-[28px] border-white/80 bg-white/80 p-6 shadow-[0_30px_80px_-36px_rgba(15,23,42,0.45)] backdrop-blur">
              <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-sky-300 to-transparent" />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Пульс релизов</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">Большая картина по продукту</h2>
                </div>
                <div className="rounded-2xl bg-slate-950 p-3 text-white shadow-lg">
                  <Compass className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-2xl font-semibold text-slate-950">{milestonesByStatus.shipped.length}</p>
                  <p className="mt-1 text-sm text-slate-500">Уже вышло</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-2xl font-semibold text-slate-950">{milestonesByStatus.active.length}</p>
                  <p className="mt-1 text-sm text-slate-500">В работе</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-2xl font-semibold text-slate-950">{milestonesByStatus.planned.length}</p>
                  <p className="mt-1 text-sm text-slate-500">Дальше по плану</p>
                </div>
              </div>

              <div className="mt-7 space-y-3">
                {pulseItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.title}
                      className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3"
                    >
                      <div className="rounded-2xl bg-slate-950 p-2 text-white">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{item.period}</p>
                        <p className="text-sm font-medium leading-5 text-slate-800">{item.label}</p>
                      </div>
                      <Badge className={`${statusStyles[item.status].badge} rounded-full px-3 py-1 text-[11px] font-semibold`}>
                        {statusStyles[item.status].text}
                      </Badge>
                    </div>
                  );
                })}
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
              <div className="mt-5 flex flex-wrap gap-2">
                {card.points.map((point) => (
                  <span
                    key={point}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600"
                  >
                    {point}
                  </span>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4 pb-8">
        <div className="mb-6 max-w-2xl">
          <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Статусы</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Что уже пройдено, что активно и что дальше</h2>
          <p className="mt-4 text-base leading-7 text-slate-600">
            Чтобы это читалось без догадок, разделили все вехи по трём понятным состояниям. Сейчас в активной работе
            остаётся подключение оплаты и баланса, а страница планов и релизов уже вынесена в опубликованные этапы.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {statusOrder.map((status) => {
            const meta = statusMeta[status];
            const items = milestonesByStatus[status];

            return (
              <Card
                key={status}
                className="rounded-[28px] border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.4)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{meta.eyebrow}</p>
                    <h3 className="mt-2 text-2xl font-semibold text-slate-950">{meta.title}</h3>
                  </div>
                  <Badge className={`${meta.badgeClassName} rounded-full px-3 py-1 text-[11px] font-semibold`}>
                    {items.length}
                  </Badge>
                </div>

                <p className="mt-3 text-sm leading-6 text-slate-600">{meta.description}</p>

                <div className="mt-6 space-y-3">
                  {items.map((item) => (
                    <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className={`h-2.5 w-2.5 rounded-full ${meta.dotClassName}`} />
                        <p className="text-sm font-medium text-slate-900">{item.label}</p>
                      </div>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">{item.period}</p>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="container mx-auto px-4 py-12 md:py-16">
        <div className="mb-8 max-w-2xl">
          <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Таймлайн</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Ключевые вехи по времени</h2>
          <p className="mt-4 text-base leading-7 text-slate-600">
            Ниже тот же список, но уже по времени: сверху самые свежие и будущие вехи, а ниже более ранние этапы.
            У каждой карточки есть явный статус: что пройдено, что в работе и что запланировано.
          </p>
        </div>

        <div className="relative">
          <div className="absolute bottom-0 left-[15px] top-0 w-px bg-gradient-to-b from-sky-200 via-slate-200 to-transparent md:left-[19px]" />
          <div className="space-y-6">
            {timelineItems.map((item) => {
              const Icon = item.icon;
              const styles = statusStyles[item.status];

              return (
                <article key={item.title} className="relative pl-12 md:pl-16">
                  <div className={`absolute left-0 top-7 h-8 w-8 rounded-full border-4 ${styles.dot} shadow-sm`} />
                  <Card className={`rounded-[28px] border p-6 shadow-[0_24px_80px_-46px_rgba(15,23,42,0.55)] ${styles.card}`}>
                    <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                      <div className="max-w-3xl">
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-500">
                            <CalendarDays className="h-4 w-4" />
                            {item.period}
                          </p>
                          <Badge className={`${styles.badge} rounded-full px-3 py-1 text-[11px] font-semibold`}>
                            {item.label}
                          </Badge>
                        </div>
                        <h3 className="mt-4 text-2xl font-semibold text-slate-950">{item.title}</h3>
                        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">{item.description}</p>
                      </div>

                      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/85 text-slate-900 shadow-sm">
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="mt-6 flex flex-wrap gap-2">
                      {item.highlights.map((highlight) => (
                        <span
                          key={highlight}
                          className="rounded-full border border-white/70 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-700"
                        >
                          {highlight}
                        </span>
                      ))}
                    </div>
                  </Card>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 pb-16">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="rounded-[30px] border-slate-200 bg-slate-950 p-8 text-white shadow-[0_30px_90px_-40px_rgba(2,6,23,0.65)]">
            <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Как читать этот раздел</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Планы, релизы и крупные события в одном месте</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
              Если новость отвечает на вопрос «что случилось сейчас», то этот раздел отвечает на вопрос
              «куда движется продукт в целом». Он удобен для больших анонсов, статусов интеграций и понятного
              ритма развития платформы.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                <p className="mt-4 text-sm font-medium">Что уже вышло</p>
                <p className="mt-2 text-sm text-slate-400">Запуск сайта, релизные блоки и опубликованные продуктовые части.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <Clock3 className="h-5 w-5 text-sky-300" />
                <p className="mt-4 text-sm font-medium">Что сейчас делаем</p>
                <p className="mt-2 text-sm text-slate-400">Активные направления, где команда фокусируется прямо сейчас.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <Layers3 className="h-5 w-5 text-amber-300" />
                <p className="mt-4 text-sm font-medium">Что готовим дальше</p>
                <p className="mt-2 text-sm text-slate-400">Крупные шаги, которые уже стоят в очереди на следующие релизы.</p>
              </div>
            </div>
          </Card>

          <Card className="rounded-[30px] border-slate-200 bg-white/90 p-8 shadow-[0_24px_70px_-44px_rgba(15,23,42,0.4)]">
            <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Навигация</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-950">С чем это лучше сочетается</h2>
            <div className="mt-6 space-y-3">
              <Link
                to="/news"
                className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Новости
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/articles"
                className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Статьи
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/my/agents"
                className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Агенты
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
