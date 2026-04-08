import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Eye, Heart, MessageSquare, PenSquare, TrendingUp } from 'lucide-react';
import { useArticlesList, useMyArticleAnalytics, useMyArticles, useMyBookmarkedArticles } from '../../hooks/useArticles';
import { useAuth } from '../../hooks/useAuth';
import { Button, Input, Skeleton } from '../../components/ui';

const SORT_OPTIONS = [
  { value: 'top_day', label: 'Лучшие за день' },
  { value: 'top_week', label: 'Лучшие за неделю' },
  { value: 'top_month', label: 'Лучшие за месяц' },
  { value: 'top_all', label: 'Лучшие за всё время' },
  { value: 'newest', label: 'Новые' },
] as const;

function compact(value: number | undefined) {
  return new Intl.NumberFormat('ru-RU').format(value ?? 0);
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Черновик';
  return new Date(value).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
}

export function ArticlesPage() {
  const { isAuthenticated } = useAuth();
  const cabinetRef = useRef<HTMLElement | null>(null);
  const cabinetHighlightTimerRef = useRef<number | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]['value']>('top_week');
  const [cabinetHighlighted, setCabinetHighlighted] = useState(false);
  const { data, isLoading } = useArticlesList({
    sort,
    search: search || undefined,
    per_page: 12,
    page: 1,
    recommended: isAuthenticated && !search,
  });
  const { data: myArticles } = useMyArticles(isAuthenticated);
  const { data: bookmarkedArticles } = useMyBookmarkedArticles(isAuthenticated);
  const { data: analytics } = useMyArticleAnalytics(isAuthenticated);

  const featuredItems = useMemo(() => (data?.data ?? []).filter((item) => item.featured).slice(0, 3), [data]);
  const articleItems = data?.data ?? [];
  const analyticsItems = analytics?.items ?? [];

  const scrollToCabinet = () => {
    if (!cabinetRef.current) return;

    cabinetRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });

    if (cabinetHighlightTimerRef.current) {
      window.clearTimeout(cabinetHighlightTimerRef.current);
    }

    setCabinetHighlighted(true);
    cabinetHighlightTimerRef.current = window.setTimeout(() => {
      setCabinetHighlighted(false);
      cabinetHighlightTimerRef.current = null;
    }, 1800);
  };

  useEffect(() => {
    if (!isAuthenticated || typeof window === 'undefined') return;
    if (window.location.hash !== '#my-articles') return;

    const timer = window.setTimeout(() => {
      scrollToCabinet();
    }, 60);

    return () => window.clearTimeout(timer);
  }, [isAuthenticated]);

  useEffect(() => () => {
    if (cabinetHighlightTimerRef.current) {
      window.clearTimeout(cabinetHighlightTimerRef.current);
    }
  }, []);

  return (
    <div className="bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_18%,#f8fafc_100%)]">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10">
        <section className="overflow-hidden rounded-[36px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.08),transparent_26%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-7 shadow-[0_32px_90px_rgba(15,23,42,0.08)] md:p-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-700">
                <TrendingUp className="h-4 w-4" />
                Истории и связки пользователей LLMStore.pro
              </div>
              <h1 className="mt-5 text-[2rem] font-semibold leading-[1.15] tracking-[-0.03em] text-slate-950">
                Статьи, из которых можно сразу перейти к агенту, preview или готовой связке
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 md:text-lg">
                Готовые лендинги, телеграм боты, рабочие кейсы: как собрать сильного Telegram-агента, какие
                инструменты связать, как получить такой лендинг, что реально сработало и как это запустить у себя.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link to="/guides">
                <Button variant="outline" className="w-full sm:w-auto">Как?</Button>
              </Link>
              {isAuthenticated ? (
                <>
                  <Link to="/articles/new">
                    <Button className="w-full sm:w-auto">
                      <PenSquare className="mr-2 h-4 w-4" />
                      Написать
                    </Button>
                  </Link>
                  <Button variant="outline" className="w-full sm:w-auto" onClick={scrollToCabinet}>
                    Кабинет
                  </Button>
                </>
              ) : (
                <Link to="/login">
                  <Button className="w-full sm:w-auto">Войти и опубликовать статью</Button>
                </Link>
              )}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-[30px] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex gap-3">
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Поиск по заголовку или краткому описанию"
              />
              <Button variant="outline" onClick={() => setSearch(searchInput.trim())}>Найти</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {SORT_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={sort === option.value ? 'primary' : 'outline'}
                  onClick={() => setSort(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </section>

        {featuredItems.length > 0 && (
          <section className="mt-8">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Фичеринг</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">Что стоит открыть прямо сейчас</h2>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              {featuredItems[0] && (
                <Link
                  to={`/articles/${featuredItems[0].slug}`}
                  className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 shadow-sm transition hover:-translate-y-0.5"
                >
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-700">
                    Featured now
                  </span>
                  <h3 className="mt-5 text-3xl font-semibold tracking-tight text-slate-950">
                    {featuredItems[0].title}
                  </h3>
                  <p className="mt-4 text-base leading-8 text-slate-600">{featuredItems[0].short_description}</p>
                  <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-500">
                    <span className="inline-flex items-center gap-1"><Heart className="h-4 w-4" /> {compact(featuredItems[0].likes_count)}</span>
                    <span className="inline-flex items-center gap-1"><Bookmark className="h-4 w-4" /> {compact(featuredItems[0].bookmarks_count)}</span>
                    <span className="inline-flex items-center gap-1"><MessageSquare className="h-4 w-4" /> {compact(featuredItems[0].comments_count)}</span>
                    <span className="inline-flex items-center gap-1"><Eye className="h-4 w-4" /> {compact(featuredItems[0].views_count)}</span>
                  </div>
                </Link>
              )}

              <div className="grid gap-4">
                {featuredItems.slice(1).map((item) => (
                  <Link
                    key={item.id}
                    to={`/articles/${item.slug}`}
                    className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5"
                  >
                    <h3 className="text-xl font-semibold text-slate-950">{item.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-600">{item.short_description}</p>
                    <div className="mt-4 flex gap-3 text-xs text-slate-500">
                      <span>{compact(item.likes_count)} лайков</span>
                      <span>{compact(item.bookmarks_count)} закладок</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="mt-8">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-72 rounded-[28px]" />
              ))}
            </div>
          ) : articleItems.length === 0 ? (
            <div className="rounded-[28px] border border-slate-200 bg-white p-10 text-center shadow-sm">
              <h2 className="text-2xl font-semibold text-slate-950">Статей пока нет</h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600">
                Начните с первого кейса: расскажите, какую связку собрали, для какой задачи и как читатель может её попробовать.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {articleItems.map((item) => (
                <article key={item.id} className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5">
                  {item.hero_image_url && (
                    <Link to={`/articles/${item.slug}`} className="block aspect-[16/10] overflow-hidden border-b border-slate-200 bg-slate-50">
                      <img src={item.hero_image_url} alt={item.title} className="h-full w-full object-cover transition duration-300 hover:scale-[1.02]" />
                    </Link>
                  )}

                  <div className="p-5">
                    <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                      {item.featured && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
                          Featured
                        </span>
                      )}
                      {item.categories[0] && (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                          {item.categories[0].name}
                        </span>
                      )}
                    </div>

                    <Link to={`/articles/${item.slug}`} className="mt-4 block">
                      <h3 className="text-2xl font-semibold tracking-tight text-slate-950 transition hover:text-primary">
                        {item.title}
                      </h3>
                    </Link>

                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      {item.short_description}
                    </p>

                    <div className="mt-5 flex flex-wrap gap-2">
                      {item.tags.slice(0, 4).map((tag) => (
                        <span key={tag.id} className="rounded-full bg-slate-50 px-3 py-1 text-xs text-slate-500">
                          #{tag.slug}
                        </span>
                      ))}
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1"><Heart className="h-4 w-4" /> {compact(item.likes_count)}</span>
                      <span className="inline-flex items-center gap-1"><Bookmark className="h-4 w-4" /> {compact(item.bookmarks_count)}</span>
                      <span className="inline-flex items-center gap-1"><MessageSquare className="h-4 w-4" /> {compact(item.comments_count)}</span>
                      <span className="inline-flex items-center gap-1"><Eye className="h-4 w-4" /> {compact(item.views_count)}</span>
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-3">
                      <span className="text-xs text-slate-500">
                        Score: {Math.round(item.ranking_score ?? 0)}
                      </span>
                      <Link to={`/articles/${item.slug}`} className="text-sm font-medium text-primary hover:underline">
                        Открыть →
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {isAuthenticated && (
          <section
            id="my-articles"
            ref={cabinetRef}
            className={`mt-8 rounded-[32px] border bg-white p-6 shadow-sm transition-all duration-500 md:p-8 ${cabinetHighlighted ? 'border-sky-300 ring-4 ring-sky-100 shadow-[0_24px_80px_rgba(14,165,233,0.18)]' : 'border-slate-200'}`}
          >
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Авторская зона</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">Кабинет статей</h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
                  Здесь видно, какие публикации уже тянут просмотры, где появляются закладки и на какие статьи стоит
                  дать повторный пуш.
                </p>
              </div>
              <Link to="/articles/new">
                <Button variant="outline" size="sm">Новый черновик</Button>
              </Link>
            </div>

            {analytics && (
              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Статей</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{compact(analytics.totals.articles)}</p>
                  <p className="mt-1 text-xs text-slate-500">{compact(analytics.totals.published)} опубликовано</p>
                </div>
                <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Просмотры</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{compact(analytics.totals.views)}</p>
                  <p className="mt-1 text-xs text-emerald-700">+{compact(analytics.totals.views_last_7_days)} за 7 дней</p>
                </div>
                <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Лайки и комменты</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">
                    {compact(analytics.totals.likes + analytics.totals.comments)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {compact(analytics.totals.likes)} лайков и {compact(analytics.totals.comments)} комментариев
                  </p>
                </div>
                <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Закладки</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{compact(analytics.totals.bookmarks)}</p>
                  <p className="mt-1 text-xs text-slate-500">Сильный сигнал на фичеринг</p>
                </div>
                <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Открытые жалобы</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{compact(analytics.totals.open_reports)}</p>
                  <p className="mt-1 text-xs text-slate-500">Нужно держать качество карточек</p>
                </div>
              </div>
            )}

            {myArticles && myArticles.length > 0 ? (
              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {myArticles.slice(0, 6).map((item) => {
                  const stats = analyticsItems.find((entry) => entry.id === item.id);

                  return (
                    <article key={item.id} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-500">{item.status}</span>
                        <Link to={`/articles/edit/${item.id}`} className="text-sm font-medium text-primary hover:underline">
                          Редактировать
                        </Link>
                      </div>
                      <h3 className="mt-4 text-lg font-semibold text-slate-950">{item.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-slate-600">{item.short_description}</p>

                      {stats && (
                        <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {compact(stats.views_count)}</span>
                          <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> {compact(stats.likes_count)}</span>
                          <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> {compact(stats.comments_count)}</span>
                          <span className="inline-flex items-center gap-1"><Bookmark className="h-3.5 w-3.5" /> {compact(stats.bookmarks_count)}</span>
                        </div>
                      )}

                      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
                        <span>Обновлено {formatDate(item.updated_at)}</span>
                        {item.status === 'published' && (
                          <Link to={`/articles/${item.slug}`} className="font-medium text-primary hover:underline">
                            Открыть →
                          </Link>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="mt-6 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-7 text-slate-600">
                Пока нет ни одной своей статьи. Первый кейс лучше всего публиковать как практический разбор с CTA:
                что собрали, где запустить и почему это реально полезно.
              </div>
            )}

            {bookmarkedArticles && bookmarkedArticles.length > 0 && (
              <div className="mt-8">
                <div className="mb-4 flex items-center gap-2">
                  <Bookmark className="h-4 w-4 text-slate-500" />
                  <h3 className="text-lg font-semibold text-slate-950">Сохранённые статьи</h3>
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  {bookmarkedArticles.slice(0, 3).map((item) => (
                    <Link
                      key={item.id}
                      to={`/articles/${item.slug}`}
                      className="rounded-[24px] border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5"
                    >
                      <h4 className="text-lg font-semibold text-slate-950">{item.title}</h4>
                      <p className="mt-2 text-sm leading-7 text-slate-600">{item.short_description}</p>
                      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                        <span>{compact(item.bookmarks_count)} в закладках</span>
                        <span>Читать →</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
