import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNewsList } from '../../hooks/useNews';
import { UserLink } from '../../components/users/UserLink';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import type { NewsArticle } from '../../lib/api/news';
import { formatNewsDateParts } from '../../lib/newsDates';

function getExcerpt(article: NewsArticle): string {
  return article.excerpt || (article.content.length > 220 ? `${article.content.slice(0, 220)}...` : article.content);
}

export function NewsListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const perPage = 9;

  const { data, isLoading } = useNewsList({ page, per_page: perPage });

  const items = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, per_page: perPage, total_pages: 1 };
  const lead = items[0];
  const feed = items.slice(1);
  const leadDate = formatNewsDateParts(lead?.published_at ?? null);

  const openArticle = (slug: string, hash?: string) => {
    navigate(`/news/${slug}${hash ?? ''}`);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  };

  return (
    <div className="bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_24%,#f8fafc_100%)]">
      <div className="container mx-auto max-w-6xl px-4 py-10 md:py-14">
        <section className="rounded-[34px] border border-slate-200 bg-white p-6 shadow-[0_28px_90px_-50px_rgba(15,23,42,0.35)] md:p-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-end">
            <div>
              <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Пульс продукта</p>
              <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">
                Новости и релизы
                <br />
                <span className="text-primary">LLMStore.pro</span>
              </h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
                Здесь мы собираем крупные обновления платформы, новые сценарии для агентов, изменения в интерфейсе
                и важные продуктовые релизы в формате живой changelog-ленты.
              </p>
            </div>
            <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Сейчас в архиве</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">{meta.total}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                опубликованных новостей и релизных заметок
              </p>
            </div>
          </div>
        </section>

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">Новостей пока нет</div>
        ) : (
          <>
            {lead && (
              <section className="mt-10">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Главное обновление</p>
                  {meta.total_pages > 1 && (
                    <p className="text-sm text-slate-500">Страница {page} из {meta.total_pages}</p>
                  )}
                </div>
                <article className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_80px_-54px_rgba(15,23,42,0.32)]">
                  <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="p-6 md:p-8">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Последний релиз</p>
                      <button
                        type="button"
                        className="mt-4 text-left"
                        onClick={() => openArticle(lead.slug)}
                      >
                        <h2 className="text-3xl font-semibold tracking-tight text-slate-950 transition hover:text-primary md:text-4xl">
                          {lead.title}
                        </h2>
                      </button>
                      <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600">
                        {getExcerpt(lead)}
                      </p>
                      <div className="mt-6 flex flex-wrap gap-3">
                        {leadDate && (
                          <span className="flex flex-col rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
                            <span>{leadDate.date}</span>
                            <span className="text-xs text-slate-500">{leadDate.time}</span>
                          </span>
                        )}
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
                          Автор:{' '}
                          <UserLink
                            username={lead.author?.username}
                            name={lead.author?.name}
                            fallback="Команда LLMStore"
                            className="font-medium text-slate-900 hover:text-primary"
                          />
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
                          {lead.comments_count} комментариев
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
                          {lead.views_count ?? 0} просмотров
                        </span>
                      </div>
                      <div className="mt-8 flex flex-wrap gap-3">
                        <Button onClick={() => openArticle(lead.slug)}>Открыть новость</Button>
                        <Button variant="outline" onClick={() => openArticle(lead.slug, '#comment-form')}>
                          Комментировать
                        </Button>
                      </div>
                    </div>
                    <div className="border-t border-slate-200 bg-slate-50 lg:border-l lg:border-t-0">
                      {lead.images[0]?.url ? (
                        <button
                          type="button"
                          className="block h-full w-full text-left"
                          onClick={() => openArticle(lead.slug)}
                          aria-label={`Открыть новость ${lead.title}`}
                        >
                          <img
                            src={lead.images[0].url}
                            alt={lead.title}
                            className="h-full min-h-[260px] w-full object-cover transition duration-300 hover:scale-[1.01]"
                          />
                        </button>
                      ) : (
                        <div className="flex h-full min-h-[260px] items-center justify-center p-6 text-center text-sm text-slate-400">
                          В этой записи нет обложки, но внутри есть полное описание обновления.
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              </section>
            )}

            <section className="mt-12">
              <div className="mb-5 flex items-center justify-between gap-4">
                <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Лента обновлений</p>
                <p className="text-sm text-slate-500">Новые записи сверху, старые ниже</p>
              </div>

              <div className="space-y-4">
                {feed.map((article: NewsArticle) => (
                  <article
                    key={article.id}
                    className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_60px_-48px_rgba(15,23,42,0.25)] transition hover:border-slate-300 hover:shadow-[0_24px_80px_-50px_rgba(15,23,42,0.3)] md:p-6"
                  >
                    <div className="grid gap-5 lg:grid-cols-[88px_minmax(0,1fr)_160px] lg:items-start">
                      <div className="flex items-start gap-3 lg:block">
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Дата</div>
                        {formatNewsDateParts(article.published_at, { shortMonth: true }) ? (
                          <>
                            <div className="mt-1 text-sm font-medium text-slate-900">{formatNewsDateParts(article.published_at, { shortMonth: true })?.date}</div>
                            <div className="mt-1 text-xs text-slate-500">{formatNewsDateParts(article.published_at, { shortMonth: true })?.time}</div>
                          </>
                        ) : (
                          <div className="mt-1 text-sm font-medium text-slate-900">Черновик</div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <button
                          type="button"
                          className="text-left"
                          onClick={() => openArticle(article.slug)}
                        >
                          <h3 className="text-2xl font-semibold tracking-tight text-slate-950 transition hover:text-primary">
                            {article.title}
                          </h3>
                        </button>
                        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                          {getExcerpt(article)}
                        </p>
                        <p className="mt-3 text-sm text-slate-500">
                          Автор:{' '}
                          <UserLink
                            username={article.author?.username}
                            name={article.author?.name}
                            fallback="Команда LLMStore"
                            className="font-medium text-slate-700 hover:text-primary"
                          />
                        </p>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
                            {article.comments_count} комментариев
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
                            {article.views_count ?? 0} просмотров
                          </span>
                          <button
                            type="button"
                            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                            onClick={() => openArticle(article.slug, '#comment-form')}
                          >
                            Комментировать
                          </button>
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-slate-50">
                        {article.images[0]?.url ? (
                          <button
                            type="button"
                            className="block w-full text-left"
                            onClick={() => openArticle(article.slug)}
                            aria-label={`Открыть новость ${article.title}`}
                          >
                            <img
                              src={article.images[0].url}
                              alt={article.title}
                              className="h-[120px] w-full object-cover transition duration-300 hover:scale-[1.02]"
                            />
                          </button>
                        ) : (
                          <div className="flex h-[120px] items-center justify-center px-4 text-center text-xs text-slate-400">
                            Обложка не добавлена
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {meta.total_pages > 1 && (
              <div className="flex items-center justify-center gap-4 pt-10">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPage((current) => Math.max(1, current - 1));
                    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
                  }}
                  disabled={page <= 1}
                >
                  Назад
                </Button>
                <span className="text-sm text-slate-500">
                  Страница {page} из {meta.total_pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPage((current) => Math.min(meta.total_pages, current + 1));
                    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
                  }}
                  disabled={page >= meta.total_pages}
                >
                  Вперёд
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
