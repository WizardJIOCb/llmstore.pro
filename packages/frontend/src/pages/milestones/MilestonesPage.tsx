import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { useGalleryPreviews } from '../../hooks/useChats';
import type { GalleryPreviewItem } from '../../lib/api/chats';
import { appApi, type ProjectCommitActivity } from '../../lib/api/app';
import { Badge, Card } from '../../components/ui';

type MilestoneStatus = 'done' | 'inProgress' | 'planned' | 'research';

interface MilestoneItem {
  id: number;
  title: string;
  status: MilestoneStatus;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}

interface StatusMeta {
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  badgeClassName: string;
  sectionClassName: string;
  cardClassName: string;
  accentClassName: string;
}

interface RouteCard {
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
}

interface CommitHeatmapCell {
  date: string;
  count: number;
  level: number;
  inRange: boolean;
}

interface CommitHeatmapWeek {
  key: string;
  monthLabel: string;
  cells: CommitHeatmapCell[];
}

const HEATMAP_ROW_LABELS = ['', 'Пн', '', 'Ср', '', 'Пт', ''];
const HEATMAP_LEVEL_CLASSES = [
  'border-slate-200/80 bg-slate-100',
  'border-emerald-100 bg-emerald-100',
  'border-emerald-200 bg-emerald-200',
  'border-emerald-300 bg-emerald-400',
  'border-emerald-500 bg-emerald-600',
];
const monthFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'short', timeZone: 'UTC' });

function buildGalleryPreviewUrl(item: GalleryPreviewItem): string | null {
  if (!item.preview_url) return null;
  try {
    const url = new URL(item.preview_url, window.location.origin);
    url.searchParams.set('gallery', '1');
    url.searchParams.set('previewId', `milestones-${item.message_id}`);
    return url.toString();
  } catch {
    return item.preview_url;
  }
}

function formatViews(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

function parseIsoDate(dateIso: string): Date {
  const [year, month, day] = dateIso.split('-').map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatMonthLabel(date: Date): string {
  const label = monthFormatter.format(date).replace('.', '');
  return label.slice(0, 1).toUpperCase() + label.slice(1);
}

function getContributionLevel(count: number, maxCount: number): number {
  if (count <= 0 || maxCount <= 0) return 0;
  const ratio = count / maxCount;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.25) return 2;
  return 1;
}

function buildCommitHeatmap(activity: ProjectCommitActivity | undefined): CommitHeatmapWeek[] {
  if (!activity || activity.days.length === 0) return [];

  const counts = new Map(activity.days.map((day) => [day.date, day.count]));
  const rangeStart = parseIsoDate(activity.range_start);
  const rangeEnd = parseIsoDate(activity.range_end);
  const gridStart = addUtcDays(rangeStart, -rangeStart.getUTCDay());
  const gridEnd = addUtcDays(rangeEnd, 6 - rangeEnd.getUTCDay());
  const weeks: CommitHeatmapWeek[] = [];
  let previousMonthKey = '';

  for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor = addUtcDays(cursor, 7)) {
    const weekCells: CommitHeatmapCell[] = [];
    let monthLabel = '';

    for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
      const currentDate = addUtcDays(cursor, dayOffset);
      const dateIso = toIsoDate(currentDate);
      const count = counts.get(dateIso) ?? 0;
      const monthKey = `${currentDate.getUTCFullYear()}-${currentDate.getUTCMonth()}`;

      if (!monthLabel && monthKey !== previousMonthKey) {
        monthLabel = formatMonthLabel(currentDate);
        previousMonthKey = monthKey;
      }

      weekCells.push({
        date: dateIso,
        count,
        level: getContributionLevel(count, activity.max_commits_per_day),
        inRange: dateIso >= activity.range_start && dateIso <= activity.range_end,
      });
    }

    weeks.push({
      key: toIsoDate(cursor),
      monthLabel,
      cells: weekCells,
    });
  }

  return weeks;
}

function formatActivityRange(activity: ProjectCommitActivity): string {
  const startYear = parseIsoDate(activity.range_start).getUTCFullYear();
  const endYear = parseIsoDate(activity.range_end).getUTCFullYear();
  return startYear === endYear ? `${startYear} год` : `${startYear} - ${endYear} год`;
}

function ProjectCommitHeatmap({
  activity,
  isLoading,
}: {
  activity: ProjectCommitActivity | undefined;
  isLoading: boolean;
}) {
  const weeks = useMemo(() => buildCommitHeatmap(activity), [activity]);
  const mobileWeeks = useMemo(() => weeks.slice(-18), [weeks]);

  return (
    <div className="mt-8 rounded-[28px] border border-slate-200/80 bg-white/80 p-4 shadow-[0_20px_60px_-38px_rgba(15,23,42,0.35)] backdrop-blur sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Commit activity</p>
          <p className="mt-2 text-sm text-slate-600">
            {isLoading
              ? 'Собираем реальную git-активность проекта за последний год.'
              : activity
                ? `${new Intl.NumberFormat('ru-RU').format(activity.total_commits)} commits за ${formatActivityRange(activity)}`
                : 'Не удалось загрузить commit activity.'}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span>Less</span>
          {HEATMAP_LEVEL_CLASSES.map((className, index) => (
            <span key={index} className={`h-3 w-3 rounded-[4px] border ${className}`} />
          ))}
          <span>More</span>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 animate-pulse space-y-3">
          <div className="h-3 w-56 rounded-full bg-slate-200" />
          <div className="grid grid-cols-[auto_1fr] gap-3 sm:hidden">
            <div className="space-y-[5px] pt-4">
              {Array.from({ length: 7 }).map((_, index) => (
                <div key={index} className="h-[11px] w-5 rounded bg-slate-100" />
              ))}
            </div>
            <div className="space-y-[5px]">
              <div className="flex gap-[3px]">
                {Array.from({ length: 18 }).map((_, index) => (
                  <div key={index} className="h-3 w-[13px] rounded bg-slate-100" />
                ))}
              </div>
              {Array.from({ length: 7 }).map((_, rowIndex) => (
                <div key={rowIndex} className="flex gap-[3px]">
                  {Array.from({ length: 18 }).map((_, index) => (
                    <div key={`${rowIndex}-${index}`} className="h-3 w-[13px] rounded bg-slate-100" />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="hidden grid-cols-[auto_1fr] gap-3 sm:grid">
            <div className="space-y-[5px] pt-4">
              {Array.from({ length: 7 }).map((_, index) => (
                <div key={index} className="h-[11px] w-5 rounded bg-slate-100" />
              ))}
            </div>
            <div className="space-y-[5px]">
              <div className="flex gap-[3px]">
                {Array.from({ length: 26 }).map((_, index) => (
                  <div key={index} className="h-3 w-[13px] rounded bg-slate-100" />
                ))}
              </div>
              {Array.from({ length: 7 }).map((_, rowIndex) => (
                <div key={rowIndex} className="flex gap-[3px]">
                  {Array.from({ length: 26 }).map((_, index) => (
                    <div key={`${rowIndex}-${index}`} className="h-3 w-[13px] rounded bg-slate-100" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : activity && weeks.length > 0 ? (
        <>
          <div className="mt-4 sm:hidden">
            <div>
              <div className="mb-[6px] flex gap-[3px] pl-8">
                {mobileWeeks.map((week) => (
                  <div key={week.key} className="w-[13px] text-[10px] text-slate-400">
                    {week.monthLabel}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-[auto_1fr] gap-3">
                <div className="grid grid-rows-7 gap-[3px] pt-[1px] text-[10px] text-slate-400">
                  {HEATMAP_ROW_LABELS.map((label, index) => (
                    <div key={`${label}-${index}`} className="h-3 leading-3">
                      {label}
                    </div>
                  ))}
                </div>

                <div className="grid grid-rows-7 gap-[3px]">
                  {Array.from({ length: 7 }).map((_, rowIndex) => (
                    <div key={rowIndex} className="flex gap-[3px]">
                      {mobileWeeks.map((week) => {
                        const cell = week.cells[rowIndex];
                        return (
                          <div
                            key={`${week.key}-${cell.date}`}
                            title={`${cell.count} commits on ${cell.date}`}
                            className={[
                              'h-3 w-[13px] rounded-[4px] border',
                              HEATMAP_LEVEL_CLASSES[cell.level],
                              cell.inRange ? 'opacity-100' : 'opacity-35',
                            ].join(' ')}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 hidden overflow-x-auto pb-2 sm:block">
            <div className="min-w-max">
              <div className="mb-[6px] flex gap-[3px] pl-8">
                {weeks.map((week) => (
                  <div key={week.key} className="w-[13px] text-[10px] text-slate-400">
                    {week.monthLabel}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-[auto_1fr] gap-3">
                <div className="grid grid-rows-7 gap-[3px] pt-[1px] text-[10px] text-slate-400">
                  {HEATMAP_ROW_LABELS.map((label, index) => (
                    <div key={`${label}-${index}`} className="h-3 leading-3">
                      {label}
                    </div>
                  ))}
                </div>

                <div className="grid grid-rows-7 gap-[3px]">
                  {Array.from({ length: 7 }).map((_, rowIndex) => (
                    <div key={rowIndex} className="flex gap-[3px]">
                      {weeks.map((week) => {
                        const cell = week.cells[rowIndex];
                        return (
                          <div
                            key={`${week.key}-${cell.date}`}
                            title={`${cell.count} commits on ${cell.date}`}
                            className={[
                              'h-3 w-[13px] rounded-[4px] border transition-transform hover:scale-110',
                              HEATMAP_LEVEL_CLASSES[cell.level],
                              cell.inRange ? 'opacity-100' : 'opacity-35',
                            ].join(' ')}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <p className="mt-3 text-xs leading-5 text-slate-500">
            <strong className="font-semibold text-slate-700">Проект стартовал 23 марта 2026 года.</strong>{' '}
            Это реальная активность git-репозитория LLMStore за последний год.
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-slate-500">
          История коммитов сейчас недоступна, но блок milestones продолжает показывать фактически shipped и запланированные
          этапы развития.
        </p>
      )}
    </div>
  );
}

function GalleryMilestonePreviewCard({ item }: { item: GalleryPreviewItem }) {
  const previewUrl = useMemo(() => buildGalleryPreviewUrl(item), [item]);
  const title = item.preview_title || item.project_title || item.chat_title;
  const chatUrl = item.chat_url || `/chats?chat=${encodeURIComponent(item.chat_id)}`;

  if (!previewUrl) return null;

  return (
    <article className="overflow-hidden rounded-[24px] border border-white/10 bg-white/6 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.8)]">
      <div className="aspect-[16/10] border-b border-white/10 bg-white">
        {item.preview_type === 'html' ? (
          <iframe
            title={title}
            src={previewUrl}
            className="h-full w-full bg-white"
            sandbox="allow-scripts"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-full items-center justify-center bg-[linear-gradient(135deg,#0f172a,#1e293b)] p-6 text-center text-sm font-medium text-slate-100"
          >
            Открыть preview
          </a>
        )}
      </div>

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          <span className="rounded-full border border-white/10 bg-white/6 px-2.5 py-1">Preview</span>
          <span className="rounded-full border border-white/10 bg-white/6 px-2.5 py-1">
            {formatViews(item.total_view_count)} просмотров
          </span>
        </div>

        <h3 className="line-clamp-2 text-base font-semibold text-white">{title}</h3>

        <p className="line-clamp-2 text-sm leading-6 text-slate-300">
          {item.author_name}
          {item.author_username ? ` • @${item.author_username}` : ''}
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-2 text-sm font-semibold text-white transition-colors hover:border-sky-300/40 hover:text-sky-200"
          >
            Открыть preview
            <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href={chatUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-transparent px-3 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-white/25 hover:text-white"
          >
            Перейти в чат
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </article>
  );
}

const milestones: MilestoneItem[] = [
  {
    id: 1,
    title: 'Coding Agents Preview',
    status: 'done',
    description: 'LLMStore уже вышел за рамки обычного чата и двигается к агентам, которые помогают собирать и править проекты.',
    ctaLabel: 'Читать релизы',
    ctaHref: '/news',
  },
  {
    id: 2,
    title: 'Preview Editor Upgrade',
    status: 'done',
    description: 'Preview Editor стал чище и удобнее: авто-Beautify, лучшее расположение действий и меньше трения в HTML-preview.',
    ctaLabel: 'Открыть новости',
    ctaHref: '/news',
  },
  {
    id: 3,
    title: 'Project Gallery',
    status: 'done',
    description: 'Галерея собрала runnable и demo-проекты в одно место, чтобы их можно было нормально смотреть и переиспользовать.',
    ctaLabel: 'Открыть gallery',
    ctaHref: '/gallery',
  },
  {
    id: 4,
    title: 'Balance, Usage & History',
    status: 'done',
    description: 'Баланс, история запросов и расход токенов стали прозрачнее и понятнее без эффекта "где-то что-то списалось".',
    ctaLabel: 'Смотреть оплату',
    ctaHref: '/pricing',
  },
  {
    id: 5,
    title: 'Private Links & Sharing',
    status: 'done',
    description: 'Приватные ссылки и шаринг упростили точечный показ проектов, превью и результатов работы.',
    ctaLabel: 'Смотреть gallery',
    ctaHref: '/gallery',
  },
  {
    id: 6,
    title: 'Reactions & Small UX Fixes',
    status: 'done',
    description: 'Реакции и мелкие UX-фиксы сделали сервис живее и приятнее в ежедневном использовании.',
    ctaLabel: 'Открыть релизы',
    ctaHref: '/news',
  },
  {
    id: 7,
    title: 'Payments & Billing Setup',
    status: 'inProgress',
    description: 'Подключаем ЮKassa для платёжки: сейчас идёт оформление нужных документов, прохождение шагов через Госуслуги и подготовка к официальной работе платёжной системы.',
    ctaLabel: 'Смотреть оплату',
    ctaHref: '/pricing',
  },
  {
    id: 8,
    title: 'Agent Chat Tools',
    status: 'inProgress',
    description: 'Следующий шаг: агент внутри чата должен работать с файлами, командами и проектным контекстом, расширение инструментов и возможностей агентов.',
    ctaLabel: 'Открыть инструменты',
    ctaHref: '/tools',
  },
  {
    id: 22,
    title: 'Alice Skill Integration',
    status: 'inProgress',
    description: 'Сейчас в работе подключение навыка Алисы: интеграция с Яндексом, сценарии диалога, связка с агентами и подготовка нормального пользовательского потока для voice-first и assistant-first использования.',
    ctaLabel: 'Читать гайды',
    ctaHref: '/guides',
  },
  {
    id: 23,
    title: 'Backend + Database Runtime',
    status: 'inProgress',
    description: 'Параллельно двигаем fullstack-слой: хотим, чтобы к лендингам и preview-проектам можно было сразу подключать backend и базу данных в одном рабочем контуре. В фокусе несколько backend-направлений сразу, например Node.js/Express или FastAPI, а по данным и инфраструктуре - PostgreSQL, MySQL, SQLite, Redis и очереди для фоновых задач. Идея простая: собрать нормальный поток, где фронт, бэк, база, env, рантайм и дальнейшие правки живут внутри одного чата и одного проекта, без разрыва между "красивый лендинг" и "реально работающее приложение".',
    ctaLabel: 'Открыть gallery',
    ctaHref: '/gallery',
  },
  {
    id: 9,
    title: 'Runnable Project Bundles + Fix From Error',
    status: 'done',
    description: 'Project Bundle должен собирать проект, окружение и запуск в один runnable-формат, а после ошибки агент должен быстро чинить проблему по логам и контексту без ручного цирка.',
    ctaLabel: 'Смотреть demo',
    ctaHref: '/gallery',
  },
  {
    id: 10,
    title: 'Deploy for Bots & Webhooks',
    status: 'done',
    description: 'Двигаем deploy для webhook-ботов и похожих сценариев с логами, статусами и историей запусков.',
    ctaLabel: 'Читать гайды',
    ctaHref: '/guides',
  },
  {
    id: 11,
    title: 'Workspace per Chat / Project',
    status: 'planned',
    description: 'Каждому чату или проекту нужен свой workspace с файлами, состоянием и историей действий.',
    ctaLabel: 'Читать roadmap',
    ctaHref: '/guides',
  },
  {
    id: 12,
    title: 'GitHub Import & Project Forks',
    status: 'planned',
    description: 'Импорт из GitHub и форки нужны, чтобы не стартовать с нуля каждый раз.',
    ctaLabel: 'Смотреть gallery',
    ctaHref: '/gallery',
  },
  {
    id: 13,
    title: 'Model Routing & Cost Control',
    status: 'planned',
    description: 'Выбор модели, fallback и стоимость запуска должны быть видимыми, а не угадываться по звёздам.',
    ctaLabel: 'Смотреть цены',
    ctaHref: '/pricing',
  },
  {
    id: 14,
    title: 'Templates for Real Use Cases',
    status: 'done',
    description: 'Нужны готовые шаблоны под ботов, лендинги, вебхуки, мини-сервисы и code helpers.',
    ctaLabel: 'Читать гайды',
    ctaHref: '/guides',
  },
  {
    id: 21,
    title: 'User Articles & Creator Layer',
    status: 'done',
    description: '8 апреля 2026 запустили статьи пользователей: редактор на Tiptap, публичную витрину, лайки, комментарии, закладки и рейтинги лучших материалов по времени.',
    ctaLabel: 'Открыть статьи',
    ctaHref: '/articles',
  },
  {
    id: 15,
    title: 'Shareable Demos & Public Project Pages',
    status: 'planned',
    description: 'Проекты должно быть легко показывать: демо-страницы, публичные карточки, запуск примеров и быстрый форк.',
    ctaLabel: 'Открыть gallery',
    ctaHref: '/gallery',
  },
  {
    id: 16,
    title: 'Logs, Runs & Observability',
    status: 'planned',
    description: 'История раннов, логи, ошибки и статусы должны стать базовым слоем платформы, а не бонусом.',
    ctaLabel: 'Читать подробнее',
    ctaHref: '/guides',
  },
  {
    id: 17,
    title: 'Secrets & Safe Execution',
    status: 'planned',
    description: 'Секреты, env-переменные и безопасный запуск должны быть встроены по умолчанию.',
    ctaLabel: 'Читать гайды',
    ctaHref: '/guides',
  },
  {
    id: 18,
    title: 'Team Workspaces',
    status: 'planned',
    description: 'Общие workspace, доступы и история изменений нужны для нормального командного режима.',
    ctaLabel: 'Читать roadmap',
    ctaHref: '/guides',
  },
  {
    id: 19,
    title: 'Telegram-first Integrations',
    status: 'done',
    description: '8 апреля 2026 это уже часть shipped-слоя: Telegram-связки и быстрые runnable-сценарии перестали быть исследованием и перешли в реальную продуктовую поверхность.',
    ctaLabel: 'Открыть гайд',
    ctaHref: 'https://llmstore.pro/guides/fast-telegram-bot-deploy',
  },
  {
    id: 20,
    title: 'Local + Cloud Hybrid Flow',
    status: 'research',
    description: 'Локальные и облачные модели хочется собрать в один гибкий сценарий без навязывания одного пути.',
    ctaLabel: 'Открыть инструменты',
    ctaHref: '/tools',
  },
];

const focusCards = [
  {
    eyebrow: 'Следующий фокус',
    title: 'Tools inside chat',
    description: 'Агент внутри чата должен не только отвечать, но и реально работать с файлами, командами и контекстом проекта.',
  },
  {
    eyebrow: 'Runnable flow',
    title: 'Bundles + deploy',
    description: 'Project Bundles, deploy и более внятный путь от идеи до запуска в одном рабочем контуре.',
  },
  {
    eyebrow: 'Рабочий цикл',
    title: 'Run -> error -> fix -> share',
    description: 'Нужен нормальный цикл: запустил, увидел ошибку, быстро починил через агента и показал результат.',
  },
];

const currentRouteCards: RouteCard[] = [
  {
    title: 'Посмотреть runnable-проекты',
    description: 'Галерея уже показывает, как результаты выглядят в живом виде, а не только в виде описания.',
    href: '/gallery',
    ctaLabel: 'Открыть gallery',
  },
  {
    title: 'Почитать релизы и изменения',
    description: 'Новости дают фактуру: что уже вышло, что менялось и как продукт реально двигается по шагам.',
    href: '/news',
    ctaLabel: 'Открыть новости',
  },
  {
    title: 'Изучить инструменты и сценарии',
    description: 'Гайды и раздел инструментов помогают понять, как это использовать в реальном рабочем потоке.',
    href: '/guides',
    ctaLabel: 'Читать гайды',
  },
];

const nextStepCards: RouteCard[] = [
  {
    title: 'Галерея runnable-проектов',
    description: 'Посмотреть, что уже можно открыть, показать и переиспользовать.',
    href: '/gallery',
    ctaLabel: 'Открыть',
  },
  {
    title: 'Новости релизов',
    description: 'Понять, какие обновления уже ушли в прод и как меняется продукт.',
    href: '/news',
    ctaLabel: 'Читать',
  },
  {
    title: 'Гайды по агентам',
    description: 'Быстрее схватить сценарии использования, а не только список возможностей.',
    href: '/guides',
    ctaLabel: 'Изучить',
  },
  {
    title: 'Инструменты агентов',
    description: 'Увидеть, какие tool-like возможности уже формируют следующий слой платформы.',
    href: '/tools',
    ctaLabel: 'Открыть',
  },
];

const statusOrder: MilestoneStatus[] = ['done', 'inProgress', 'planned', 'research'];

const statusMeta: Record<MilestoneStatus, StatusMeta> = {
  done: {
    label: 'Done',
    eyebrow: 'Shipped',
    title: 'Уже сделано',
    description: 'То, что уже shipped или partially shipped и уже двигает продукт вперёд.',
    icon: CheckCircle2,
    badgeClassName: 'border border-emerald-200 bg-emerald-100 text-emerald-800',
    sectionClassName: 'border-emerald-200/80 bg-emerald-50/70',
    cardClassName: 'border-emerald-100 bg-white/92',
    accentClassName: 'text-emerald-700',
  },
  inProgress: {
    label: 'In Progress',
    eyebrow: 'Current focus',
    title: 'Сейчас в работе',
    description: 'Это главный фокус сейчас: ближайшие шаги, которые уже превращаются из идеи в рабочий контур.',
    icon: Clock3,
    badgeClassName: 'border border-sky-200 bg-sky-100 text-sky-800',
    sectionClassName:
      'border-sky-300/90 bg-[linear-gradient(180deg,rgba(224,242,254,0.95),rgba(240,249,255,0.9))] ring-1 ring-sky-200/70',
    cardClassName: 'border-sky-200 bg-white/95',
    accentClassName: 'text-sky-700',
  },
  planned: {
    label: 'Planned',
    eyebrow: 'Next layer',
    title: 'Запланировано',
    description: 'Следующий слой платформы, без которого агентность быстро упрётся в потолок.',
    icon: Compass,
    badgeClassName: 'border border-amber-200 bg-amber-100 text-amber-900',
    sectionClassName: 'border-amber-200/80 bg-amber-50/80',
    cardClassName: 'border-amber-100 bg-white/92',
    accentClassName: 'text-amber-700',
  },
  research: {
    label: 'Research',
    eyebrow: 'Research',
    title: 'Исследуем',
    description: 'Направления, которые уже выглядят перспективно, но ещё требуют аккуратной проверки.',
    icon: Search,
    badgeClassName: 'border border-violet-200 bg-violet-100 text-violet-800',
    sectionClassName: 'border-violet-200/80 bg-violet-50/75',
    cardClassName: 'border-violet-100 bg-white/92',
    accentClassName: 'text-violet-700',
  },
};

const summaryText =
  'LLMStore уже выглядит не как каталог-обложка, а как рабочая платформа для runnable AI-проектов, статей с реальными CTA, галереи результатов и agent-first сценариев. Сейчас у продукта уже есть builder-поток, Tiptap-редактор статей, рейтинги по окнам времени, social-layer вокруг публикаций и живой галерейный слой. Следующий фокус: tools inside chat, bundles + deploy, наблюдаемость раннов, safe execution и нормальный цикл "запустил -> увидел проблему -> быстро починил -> показал результат".';

function getItemsByStatus(status: MilestoneStatus) {
  return milestones.filter((item) => item.status === status);
}

export function MilestonesPage() {
  const { data: galleryItems } = useGalleryPreviews(60);
  const { data: commitActivity, isLoading: commitActivityLoading } = useQuery({
    queryKey: ['app', 'project-activity'],
    queryFn: () => appApi.getProjectCommitActivity(),
    staleTime: 10 * 60_000,
  });
  const counts = {
    done: getItemsByStatus('done').length,
    inProgress: getItemsByStatus('inProgress').length,
    planned: getItemsByStatus('planned').length,
    research: getItemsByStatus('research').length,
  };
  const topGalleryPreviews = useMemo(
    () =>
      (galleryItems ?? [])
        .filter((item) => (item.kind === 'preview' || item.kind === 'hybrid') && Boolean(item.preview_url))
        .sort((a, b) => b.total_view_count - a.total_view_count)
        .slice(0, 4),
    [galleryItems],
  );

  return (
    <div className="overflow-hidden bg-[linear-gradient(180deg,#f7fbff_0%,#ffffff_36%,#f8fafc_100%)]">
      <section className="relative isolate">
        <div className="absolute inset-x-0 top-0 -z-10 h-[36rem] bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.55),rgba(255,255,255,0))]" />
        <div className="container mx-auto px-4 py-14 md:py-20">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_500px] lg:items-start">
            <div>
              <Badge className="rounded-full border border-sky-200 bg-white/85 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700 shadow-sm">
                Milestones
              </Badge>
              <h1 className="mt-5 max-w-4xl text-[2rem] font-bold leading-[1.25] tracking-tight text-slate-950">
                Реальное движение продукта, а не список фантазий
              </h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
                Поэтому здесь сначала то, что уже сделано или partially shipped, потом то, что сейчас в работе, и только
                потом запланированное. Так лучше видно, как LLMStore реально превращается из каталога в платформу для
                runnable AI-проектов и coding agents.
              </p>

              <ProjectCommitHeatmap activity={commitActivity} isLoading={commitActivityLoading} />

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

            <Card className="rounded-[28px] border-white/80 bg-white/88 p-6 shadow-[0_30px_80px_-36px_rgba(15,23,42,0.45)] backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Hero / intro</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">Короткая версия</h2>
                </div>
                <div className="rounded-2xl bg-slate-950 p-3 text-white shadow-lg">
                  <Sparkles className="h-5 w-5" />
                </div>
              </div>

              <p className="mt-6 text-[15px] leading-7 text-slate-600 md:text-base">{summaryText}</p>

              <div className="mt-7 grid grid-cols-4 gap-1.5 sm:gap-3">
                <div className="min-w-0 rounded-2xl border border-emerald-200 bg-emerald-50 px-1.5 py-3 text-center sm:p-4">
                  <p className="text-xl font-semibold text-slate-950 sm:text-2xl">{counts.done}</p>
                  <p className="mt-1 whitespace-nowrap text-[13px] leading-tight tracking-tight text-emerald-700 sm:text-sm">Done</p>
                </div>
                <div className="min-w-0 rounded-2xl border border-sky-200 bg-sky-50 px-1.5 py-3 text-center sm:p-4">
                  <p className="text-xl font-semibold text-slate-950 sm:text-2xl">{counts.inProgress}</p>
                  <p className="mt-1 whitespace-nowrap text-[13px] leading-tight tracking-tight text-sky-700 sm:text-sm">In Progress</p>
                </div>
                <div className="min-w-0 rounded-2xl border border-amber-200 bg-amber-50 px-1.5 py-3 text-center sm:p-4">
                  <p className="text-xl font-semibold text-slate-950 sm:text-2xl">{counts.planned}</p>
                  <p className="mt-1 whitespace-nowrap text-[13px] leading-tight tracking-tight text-amber-700 sm:text-sm">Planned</p>
                </div>
                <div className="min-w-0 rounded-2xl border border-violet-200 bg-violet-50 px-1.5 py-3 text-center sm:p-4">
                  <p className="text-xl font-semibold text-slate-950 sm:text-2xl">{counts.research}</p>
                  <p className="mt-1 whitespace-nowrap text-[13px] leading-tight tracking-tight text-violet-700 sm:text-sm">Research</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-8 md:py-12">
        <div className="mb-8 max-w-3xl">
          <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Roadmap by status</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Что уже есть, что делаем сейчас и что дальше</h2>
          <p className="mt-4 text-base leading-7 text-slate-600">
            Ниже весь список milestones в порядке, который читается честно: сначала shipped-часть, потом активная работа,
            потом запланированные блоки и отдельным слоем исследовательские направления.
          </p>
        </div>

        <div className="space-y-6">
          {statusOrder.map((status) => {
            const meta = statusMeta[status];
            const Icon = meta.icon;
            const items = getItemsByStatus(status);
            const isCurrentFocus = status === 'inProgress';

            return (
              <section key={status}>
                <Card className={`rounded-[30px] border p-6 shadow-[0_24px_70px_-44px_rgba(15,23,42,0.35)] ${meta.sectionClassName}`}>
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="max-w-2xl">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="rounded-2xl bg-white/85 p-3 text-slate-900 shadow-sm">
                          <Icon className="h-5 w-5" />
                        </div>
                        <Badge className={`rounded-full px-3 py-1 text-[11px] font-semibold ${meta.badgeClassName}`}>
                          {meta.label}
                        </Badge>
                        {isCurrentFocus ? (
                          <Badge className="rounded-full border border-sky-300 bg-sky-600 px-3 py-1 text-[11px] font-semibold text-white">
                            Главный фокус сейчас
                          </Badge>
                        ) : null}
                      </div>
                      <p className={`mt-4 text-xs font-semibold uppercase tracking-[0.22em] ${meta.accentClassName}`}>
                        {meta.eyebrow}
                      </p>
                      <h3 className={`mt-2 tracking-tight text-slate-950 ${isCurrentFocus ? 'text-3xl font-bold' : 'text-2xl font-semibold'}`}>
                        {meta.title}
                      </h3>
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
                        <p className="mt-3 text-[15px] leading-7 text-slate-700 md:text-base">{item.description}</p>

                        <div className="mt-5 border-t border-slate-200/80 pt-4">
                          <Link
                            to={item.ctaHref}
                            className={`inline-flex items-center gap-2 text-sm font-semibold transition-colors hover:underline ${meta.accentClassName}`}
                          >
                            {item.ctaLabel}
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </div>
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
            <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Что уже можно попробовать</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Не просто читать milestones, а идти по живому маршруту</h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
              Если страница показывает движение продукта, то следующий шаг должен быть прикладным: открыть runnable-проект,
              посмотреть релизы, зайти в инструменты или быстро понять сценарий через гайды.
            </p>

            {topGalleryPreviews.length > 0 ? (
              <div className="mt-8 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                {topGalleryPreviews.map((item) => (
                  <GalleryMilestonePreviewCard key={item.message_id} item={item} />
                ))}
              </div>
            ) : null}

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {currentRouteCards.map((card) => (
                <div key={card.title} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="text-base font-semibold text-white">{card.title}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-300">{card.description}</p>
                  <Link
                    to={card.href}
                    className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white transition-colors hover:text-sky-200"
                  >
                    {card.ctaLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              ))}
            </div>
          </Card>

          <Card className="rounded-[30px] border-slate-200 bg-white/92 p-8 shadow-[0_24px_70px_-44px_rgba(15,23,42,0.4)]">
            <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Следующий шаг</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-950">Куда идти дальше</h2>
            <div className="mt-6 space-y-3">
              {nextStepCards.map((card) => (
                <Link
                  key={card.title}
                  to={card.href}
                  className="block rounded-2xl border border-slate-200 bg-white px-4 py-4 transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">{card.title}</p>
                    <ArrowRight className="h-4 w-4 text-slate-500" />
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{card.ctaLabel}</p>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
