import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { CatalogItemCard, TagSlim } from '@llmstore/shared';
import {
  ArrowRight,
  BookOpenText,
  Bot,
  Compass,
  LayoutTemplate,
  MessageSquareText,
  Rocket,
  Sparkles,
} from 'lucide-react';
import { useCatalogList } from '../../hooks/useCatalog';
import { Badge, Skeleton } from '../../components/ui';
import { cn } from '../../lib/utils';

type SectionPreset = {
  title: string;
  description: string;
  icon: typeof Compass;
  shellClassName: string;
  accentClassName: string;
};

type GuideSection = {
  slug: string;
  name: string;
  description: string;
  items: CatalogItemCard[];
  topics: TagSlim[];
  icon: typeof Compass;
  shellClassName: string;
  accentClassName: string;
};

const categoryOrder = [
  'getting-started',
  'chat-workflows',
  'agents-setup',
  'landing-pages',
  'telegram-deployments',
  'gallery-launches',
  'other',
] as const;

const sectionPresets: Record<string, SectionPreset> = {
  'getting-started': {
    title: 'С чего начать',
    description: 'Базовые материалы, чтобы быстро понять платформу и получить первый полезный результат.',
    icon: Compass,
    shellClassName: 'border-[#e8d9c8] bg-[#f8efe3]',
    accentClassName: 'bg-[#ead8bf] text-[#73553d]',
  },
  'chat-workflows': {
    title: 'Чаты и сценарии',
    description: 'Как ставить задачи в чатах, улучшать ответы и превращать удачные идеи в рабочие сценарии.',
    icon: MessageSquareText,
    shellClassName: 'border-[#e6dcc7] bg-[#f7f1e6]',
    accentClassName: 'bg-[#e8deca] text-[#5d5a48]',
  },
  'agents-setup': {
    title: 'Агенты и настройка',
    description: 'Практика по созданию агентов с нужной ролью, тоном и повторяемым поведением.',
    icon: Bot,
    shellClassName: 'border-[#e3d5cb] bg-[#f7ede8]',
    accentClassName: 'bg-[#e8d7cf] text-[#6a4d49]',
  },
  'landing-pages': {
    title: 'Лендинги и preview',
    description: 'Как собирать сильные посадочные страницы и доводить preview до аккуратного результата.',
    icon: LayoutTemplate,
    shellClassName: 'border-[#e7d7c9] bg-[#fbf2e7]',
    accentClassName: 'bg-[#efdcc8] text-[#7c5934]',
  },
  'telegram-deployments': {
    title: 'Telegram и deployment',
    description: 'Короткий путь от идеи до рабочего Telegram-бота и внешнего запуска.',
    icon: Rocket,
    shellClassName: 'border-[#e0d4cb] bg-[#f8eeea]',
    accentClassName: 'bg-[#e7d6cf] text-[#724d4a]',
  },
  'gallery-launches': {
    title: 'Галерея и запуски',
    description: 'Как использовать галерею как источник удачных примеров и быстро переходить к их развитию.',
    icon: Sparkles,
    shellClassName: 'border-[#e5dbcf] bg-[#f9f2ea]',
    accentClassName: 'bg-[#ece0d1] text-[#6e5943]',
  },
  other: {
    title: 'Ещё материалы',
    description: 'Дополнительные гайды, которые помогут углубиться в платформу.',
    icon: BookOpenText,
    shellClassName: 'border-[#e5dacd] bg-[#f7f0e7]',
    accentClassName: 'bg-[#eadfce] text-[#6c5742]',
  },
};

function formatTopicCount(count: number) {
  if (count % 10 === 1 && count % 100 !== 11) return `${count} тема`;
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return `${count} темы`;
  return `${count} тем`;
}

function getTopicSummary(topics: TagSlim[]) {
  if (topics.length === 0) return 'Без тегов';
  return topics.map((topic) => topic.name).join(' • ');
}

function getReadingHint(item: CatalogItemCard) {
  if (item.featured) return 'Рекомендуем начать с этого материала';
  if ((item.comments_count ?? 0) > 0 || (item.views_count ?? 0) > 0) return 'Один из заметных материалов раздела';
  return 'Короткий практический материал';
}

export function GuidesPage() {
  const { data, isLoading, error } = useCatalogList({
    type: 'guide',
    sort: 'curated',
    limit: 50,
  });

  const guides = useMemo(
    () => (data?.pages.flatMap((page) => page.data) ?? []).filter((item) => item.type === 'guide'),
    [data],
  );

  const featuredGuides = useMemo(
    () => [...guides]
      .sort((a, b) => Number(b.featured) - Number(a.featured) || b.curated_score - a.curated_score)
      .slice(0, 3),
    [guides],
  );

  const topTopics = useMemo(() => {
    const topicMap = new Map<string, { tag: TagSlim; count: number }>();

    for (const guide of guides) {
      for (const tag of guide.tags) {
        const existing = topicMap.get(tag.slug);
        topicMap.set(tag.slug, {
          tag,
          count: (existing?.count ?? 0) + 1,
        });
      }
    }

    return [...topicMap.values()]
      .sort((a, b) => b.count - a.count || a.tag.name.localeCompare(b.tag.name, 'ru'))
      .slice(0, 8);
  }, [guides]);

  const sections = useMemo(() => {
    const sectionMap = new Map<string, GuideSection>();

    for (const guide of guides) {
      const primaryCategory = guide.categories[0];
      const slug = primaryCategory?.slug ?? 'other';
      const preset = sectionPresets[slug] ?? sectionPresets.other;
      const current = sectionMap.get(slug);

      if (current) {
        current.items.push(guide);
        continue;
      }

      sectionMap.set(slug, {
        slug,
        name: primaryCategory?.name ?? preset.title,
        description: preset.description,
        items: [guide],
        topics: [],
        icon: preset.icon,
        shellClassName: preset.shellClassName,
        accentClassName: preset.accentClassName,
      });
    }

    const prepared = [...sectionMap.values()].map((section) => {
      const topicMap = new Map<string, { tag: TagSlim; count: number }>();

      for (const guide of section.items) {
        for (const tag of guide.tags) {
          const existing = topicMap.get(tag.slug);
          topicMap.set(tag.slug, {
            tag,
            count: (existing?.count ?? 0) + 1,
          });
        }
      }

      section.items.sort((a, b) => b.curated_score - a.curated_score || a.title.localeCompare(b.title, 'ru'));
      section.topics = [...topicMap.values()]
        .sort((a, b) => b.count - a.count || a.tag.name.localeCompare(b.tag.name, 'ru'))
        .slice(0, 4)
        .map((entry) => entry.tag);

      return section;
    });

    return prepared.sort((a, b) => {
      const left = categoryOrder.indexOf(a.slug as typeof categoryOrder[number]);
      const right = categoryOrder.indexOf(b.slug as typeof categoryOrder[number]);
      const leftRank = left === -1 ? categoryOrder.length : left;
      const rightRank = right === -1 ? categoryOrder.length : right;
      return leftRank - rightRank || a.name.localeCompare(b.name, 'ru');
    });
  }, [guides]);

  const stats = useMemo(() => ({
    guides: guides.length,
    sections: sections.length,
    topics: topTopics.length,
  }), [guides.length, sections.length, topTopics.length]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f6efe7]">
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10">
          <div className="rounded-[32px] border border-[#eadccf] bg-[#fbf6f0] p-8 shadow-[0_30px_80px_rgba(122,93,59,0.08)] md:p-10">
            <Skeleton className="mb-4 h-6 w-40 rounded-full bg-[#ede1d3]" />
            <Skeleton className="mb-4 h-14 w-full max-w-3xl bg-[#e8dccf]" />
            <Skeleton className="h-5 w-full max-w-2xl bg-[#eee4d8]" />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-32 rounded-[28px] bg-[#ede1d3]" />
            ))}
          </div>

          <div className="mt-8 grid gap-6">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-72 rounded-[32px] bg-[#f1e6da]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#f6efe7]">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center md:px-6">
          <div className="rounded-[32px] border border-[#ead8ca] bg-[#fbf6f0] p-10 shadow-[0_24px_80px_rgba(122,93,59,0.08)]">
            <p className="text-sm uppercase tracking-[0.24em] text-[#8b6b4e]">База знаний</p>
            <h1 className="mt-4 text-3xl font-semibold text-[#3d2b1f]">Не удалось загрузить гайды</h1>
            <p className="mt-3 text-base leading-7 text-[#6d5748]">
              Попробуйте обновить страницу чуть позже. Если проблема повторяется, мы посмотрим, что мешает загрузке раздела.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f6efe7_0%,#f9f4ec_28%,#f4ede3_100%)]">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10">
        <section className="overflow-hidden rounded-[36px] border border-[#ead9c8] bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.92),rgba(247,239,230,0.96)_45%,rgba(238,225,208,0.98)_100%)] p-7 shadow-[0_32px_90px_rgba(122,93,59,0.10)] md:p-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_360px] lg:items-start">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#e6d5c2] bg-white/60 px-4 py-2 text-sm text-[#87674a]">
                <BookOpenText className="h-4 w-4" />
                База знаний LLMStore.pro
              </div>

              <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-tight tracking-[-0.03em] text-[#352519] md:text-6xl">
                Гайды, с которыми проще разобраться в платформе и быстрее получить результат
              </h1>

              <p className="mt-5 max-w-3xl text-base leading-8 text-[#6a5646] md:text-lg">
                Вместо сухого каталога здесь собраны понятные маршруты: как освоить чаты, собрать агента,
                сделать лендинг, запустить Telegram-бота и использовать галерею как рабочий инструмент.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                {topTopics.map(({ tag, count }) => (
                  <span
                    key={tag.slug}
                    className="rounded-full border border-[#e8d7c6] bg-[#fffaf4] px-4 py-2 text-sm text-[#6b5645]"
                  >
                    {tag.name}
                    <span className="ml-2 text-[#9a7d61]">{count}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-[30px] border border-[#e7d6c6] bg-white/60 p-5 backdrop-blur-sm">
              <p className="text-sm uppercase tracking-[0.22em] text-[#9a7b5e]">Что внутри</p>
              <div className="mt-5 grid gap-3">
                <div className="rounded-[24px] border border-[#eadbcf] bg-[#f8efe5] px-4 py-4">
                  <p className="text-sm text-[#8f6f53]">Материалов</p>
                  <p className="mt-1 text-3xl font-semibold text-[#3f2f22]">{stats.guides}</p>
                </div>
                <div className="rounded-[24px] border border-[#eadbcf] bg-[#fbf4eb] px-4 py-4">
                  <p className="text-sm text-[#8f6f53]">Крупных разделов</p>
                  <p className="mt-1 text-3xl font-semibold text-[#3f2f22]">{stats.sections}</p>
                </div>
                <div className="rounded-[24px] border border-[#eadbcf] bg-[#f7eee4] px-4 py-4">
                  <p className="text-sm text-[#8f6f53]">Популярных тем</p>
                  <p className="mt-1 text-3xl font-semibold text-[#3f2f22]">{stats.topics}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {featuredGuides.length > 0 && (
          <section className="mt-8">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-[#967558]">Подборка</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#37281c] md:text-3xl">С чего начать прямо сейчас</h2>
              </div>
              <p className="max-w-xl text-sm leading-6 text-[#735f4e]">
                Несколько материалов, которые быстрее всего вводят в курс дела и дают понятный маршрут по платформе.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              {featuredGuides[0] && (
                <Link
                  to={`/guides/${featuredGuides[0].slug}`}
                  className="group rounded-[32px] border border-[#e6d7c9] bg-[linear-gradient(180deg,#fdf8f1_0%,#f7eee4_100%)] p-7 transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="warning">Начните с этого</Badge>
                    {featuredGuides[0].categories[0] && (
                      <span className="rounded-full bg-[#ead9c8] px-3 py-1 text-xs text-[#75583d]">
                        {featuredGuides[0].categories[0].name}
                      </span>
                    )}
                  </div>

                  <h3 className="mt-5 max-w-2xl text-3xl font-semibold leading-tight text-[#312217]">
                    {featuredGuides[0].title}
                  </h3>
                  <p className="mt-4 max-w-2xl text-base leading-8 text-[#6d5948]">
                    {featuredGuides[0].short_description}
                  </p>

                  <div className="mt-6 flex flex-wrap gap-2">
                    {featuredGuides[0].tags.slice(0, 4).map((tag) => (
                      <span key={tag.id} className="rounded-full border border-[#e8d8c9] px-3 py-1 text-sm text-[#715846]">
                        {tag.name}
                      </span>
                    ))}
                  </div>

                  <div className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-[#6c5138]">
                    Открыть гайд
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </Link>
              )}

              <div className="grid gap-4">
                {featuredGuides.slice(1).map((guide) => (
                  <Link
                    key={guide.id}
                    to={`/guides/${guide.slug}`}
                    className="group rounded-[28px] border border-[#e6d8cb] bg-white/70 p-5 transition-colors hover:bg-[#fffaf4]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-[#9a7b5f]">
                          {guide.categories[0]?.name ?? 'Гайд'}
                        </p>
                        <h3 className="mt-3 text-xl font-semibold leading-snug text-[#35271d]">
                          {guide.title}
                        </h3>
                      </div>
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#8d6f53] transition-transform group-hover:translate-x-1" />
                    </div>

                    <p className="mt-3 text-sm leading-7 text-[#6a5647]">{guide.short_description}</p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {guide.tags.slice(0, 3).map((tag) => (
                        <span key={tag.id} className="rounded-full bg-[#f3e7d9] px-3 py-1 text-xs text-[#6f5846]">
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {sections.length > 0 && (
          <section className="mt-8">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-[#98775a]">Навигация по темам</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#38291e] md:text-3xl">Большие разделы</h2>
              </div>
              <p className="max-w-xl text-sm leading-6 text-[#755f4f]">
                Здесь можно быстро понять, какой блок вам нужен, сколько в нём материалов и какие темы там встречаются чаще всего.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sections.map((section) => {
                const Icon = section.icon;
                return (
                  <a
                    key={section.slug}
                    href={`#${section.slug}`}
                    className={cn(
                      'rounded-[30px] border p-6 transition-transform duration-200 hover:-translate-y-0.5',
                      section.shellClassName,
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className={cn('rounded-2xl p-3', section.accentClassName)}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="rounded-full bg-white/70 px-3 py-1 text-sm text-[#6c5543]">
                        {section.items.length} {section.items.length === 1 ? 'гайд' : section.items.length < 5 ? 'гайда' : 'гайдов'}
                      </span>
                    </div>

                    <h3 className="mt-5 text-2xl font-semibold text-[#332318]">{section.name}</h3>
                    <p className="mt-3 text-sm leading-7 text-[#685446]">{section.description}</p>

                    <div className="mt-5 flex flex-wrap gap-2">
                      {section.topics.map((topic) => (
                        <span key={topic.id} className="rounded-full bg-white/70 px-3 py-1 text-xs text-[#6f5946]">
                          {topic.name}
                        </span>
                      ))}
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-10 space-y-8">
          {sections.map((section) => {
            const [leadGuide, ...otherGuides] = section.items;
            const Icon = section.icon;

            return (
              <section
                key={section.slug}
                id={section.slug}
                className={cn('scroll-mt-24 rounded-[34px] border p-6 md:p-8', section.shellClassName)}
              >
                <div className="flex flex-col gap-4 border-b border-black/5 pb-6 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className={cn('rounded-2xl p-3', section.accentClassName)}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm uppercase tracking-[0.2em] text-[#8f7054]">Раздел</p>
                        <h2 className="text-3xl font-semibold text-[#342419]">{section.name}</h2>
                      </div>
                    </div>
                    <p className="mt-4 max-w-3xl text-base leading-8 text-[#6e5949]">{section.description}</p>
                  </div>

                  <div className="rounded-[24px] bg-white/65 px-4 py-4 text-sm text-[#6e5947]">
                    <p>{section.items.length} материалов</p>
                    <p className="mt-1">{getTopicSummary(section.topics)}</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                  {leadGuide && (
                    <Link
                      to={`/guides/${leadGuide.slug}`}
                      className="group rounded-[30px] border border-white/70 bg-white/65 p-6 transition-colors hover:bg-white/80"
                    >
                      <p className="text-xs uppercase tracking-[0.22em] text-[#9d7c5f]">Главный материал раздела</p>
                      <h3 className="mt-4 text-3xl font-semibold leading-tight text-[#302116]">
                        {leadGuide.title}
                      </h3>
                      <p className="mt-4 text-base leading-8 text-[#695546]">{leadGuide.short_description}</p>

                      <div className="mt-5 flex flex-wrap gap-2">
                        {leadGuide.tags.slice(0, 5).map((tag) => (
                          <span key={tag.id} className="rounded-full border border-[#ead9c8] px-3 py-1 text-sm text-[#725846]">
                            {tag.name}
                          </span>
                        ))}
                      </div>

                      <div className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[#654b35]">
                        {getReadingHint(leadGuide)}
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </div>
                    </Link>
                  )}

                  <div className="space-y-3">
                    {otherGuides.map((guide) => (
                      <Link
                        key={guide.id}
                        to={`/guides/${guide.slug}`}
                        className="group block rounded-[26px] border border-white/70 bg-white/55 px-5 py-4 transition-colors hover:bg-white/80"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-lg font-semibold leading-snug text-[#35261a]">{guide.title}</h3>
                            <p className="mt-2 text-sm leading-7 text-[#6f5b4c]">{guide.short_description}</p>
                          </div>
                          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#8f7156] transition-transform group-hover:translate-x-1" />
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {guide.tags.slice(0, 4).map((tag) => (
                            <span key={tag.id} className="rounded-full bg-[#f4eadf] px-3 py-1 text-xs text-[#6f5948]">
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </section>
            );
          })}
        </section>

        {guides.length === 0 && (
          <section className="mt-10 rounded-[34px] border border-[#ead8ca] bg-[#fbf6f0] p-10 text-center shadow-[0_24px_80px_rgba(122,93,59,0.08)]">
            <h2 className="text-3xl font-semibold text-[#37281d]">Гайды скоро появятся</h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-[#6f5a4b]">
              Мы уже собираем базу знаний по чатам, агентам, лендингам, деплою и практическим сценариям использования платформы.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
