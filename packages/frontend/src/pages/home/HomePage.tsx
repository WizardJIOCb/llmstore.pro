import { Link } from 'react-router-dom';
import { useLatestNews } from '../../hooks/useNews';
import type { NewsArticle } from '../../lib/api/news';

const sections = [
  {
    title: 'Быстрый старт агента',
    description: 'Пройдите короткие шаги, выберите роль, возможности и стиль работы, а на выходе получите готового агента.',
    href: '/builder/stack',
    label: 'Собрать агента',
  },
  {
    title: 'Мои агенты',
    description: 'Управляйте своими агентами, редактируйте их, запускайте в playground и открывайте для чатов.',
    href: '/my/agents',
    label: 'Открыть агентов',
  },
  {
    title: 'Чаты с агентами',
    description: 'Запускайте обычные чаты с моделями или выбирайте готовых агентов через поиск и начинайте диалог сразу.',
    href: '/chats',
    label: 'Открыть чаты',
  },
  {
    title: 'Что доступно на платформе',
    description: 'Смотрите модели, инструменты и другие компоненты, которые можно использовать в своих агентах и сценариях.',
    href: '/tools',
    label: 'Открыть каталог',
  },
  {
    title: 'Галерея результатов',
    description: 'Смотрите примеры того, что уже делают пользователи в чатах и агентах, и находите идеи для своих запусков.',
    href: '/gallery',
    label: 'Смотреть галерею',
  },
  {
    title: 'Планы и релизы',
    description: 'Следите за крупными вехами продукта, обновлениями платформы и тем, что уже вышло или готовится дальше.',
    href: '/milestones',
    label: 'Открыть планы',
  },
];

const workflowSteps = [
  {
    eyebrow: 'Шаг 1',
    title: 'Собираете агента под задачу',
    description: 'Быстрый конструктор помогает выбрать роль агента, стиль ответа, модель и нужные возможности.',
  },
  {
    eyebrow: 'Шаг 2',
    title: 'Подключаете инструменты и сценарии',
    description: 'Добавляйте поиск, HTTP/API, шаблоны, расчёты и другие инструменты, которые реально можно использовать в агентах.',
  },
  {
    eyebrow: 'Шаг 3',
    title: 'Запускаете в чатах и делитесь',
    description: 'Используйте агента в обычной работе, открывайте его для чатов, тестируйте сценарии и публикуйте результаты.',
  },
];

function formatLongDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatShortDate(value: string | null): string {
  if (!value) return 'Черновик';
  return new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
  });
}

function getExcerpt(article: NewsArticle): string {
  return article.excerpt || (article.content.length > 220 ? `${article.content.slice(0, 220)}...` : article.content);
}

export function HomePage() {
  const { data: newsData } = useLatestNews(3);
  const newsItems: NewsArticle[] = newsData?.data ?? [];
  const totalNews = newsData?.meta?.total ?? 0;
  const leadNews = newsItems[0];
  const feedNews: NewsArticle[] = newsItems.slice(1);

  return (
    <div>
      <section className="bg-gradient-to-b from-primary/5 to-background py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl">
            Создавайте AI-агентов,
            <br />
            <span className="text-primary">запускайте их в чатах</span>
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground">
            LLMStore.pro помогает собрать агента под задачу, выбрать модель и инструменты,
            запускать чаты с агентами и находить готовых публичных агентов в одном месте.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              to="/tools"
              className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Инструменты
            </Link>
            <Link
              to="/builder/stack"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-6 py-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Быстрый запуск агента
            </Link>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-12">
        <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.35)] md:p-8">
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)] xl:items-start">
            <div>
              <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Как это работает</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
                Платформа для реальных агентных сценариев, а не просто каталог
              </h2>
              <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
                Пользователь регистрируется в LLMStore.pro и сразу получает доступ к чатам с моделями,
                конструкторам агентов, инструментам и готовым публичным сценариям. Для первых тестов мы
                начисляем стартовый бонус, чтобы можно было попробовать платформу без лишнего трения, а когда
                сценарий уже подходит для рабочей задачи, баланс можно пополнить прямо внутри аккаунта.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Сценарии</div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">Агенты, чаты, инструменты</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Запуск</div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">Сразу после настройки</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Оплата</div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">Стартовый бонус и баланс</div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/pricing"
                  className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Оплата и тарифы
                </Link>
                <Link
                  to="/offer"
                  className="inline-flex items-center justify-center rounded-md border border-input bg-background px-5 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  Публичная оферта
                </Link>
                <Link
                  to="/contacts"
                  className="inline-flex items-center justify-center rounded-md border border-input bg-background px-5 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  Контакты и реквизиты
                </Link>
              </div>
            </div>

            <div className="grid gap-4">
              {workflowSteps.map((step) => (
                <div
                  key={step.title}
                  className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5"
                >
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{step.eyebrow}</p>
                  <h3 className="mt-3 text-lg font-semibold text-slate-950">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {newsItems.length > 0 && (
        <section className="container mx-auto px-4 py-12">
          <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.35)] md:p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Пульс продукта</p>
                <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Последние новости</h2>
              </div>
              <Link to="/news" className="text-sm font-medium text-primary hover:underline">
                Открыть все новости →
              </Link>
            </div>

            {leadNews && (
              <div className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                <article className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_60px_-44px_rgba(15,23,42,0.28)]">
                  <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="p-6 md:p-7">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Главное обновление</p>
                      <Link to={`/news/${leadNews.slug}`} className="mt-4 block text-left">
                        <h3 className="text-3xl font-semibold tracking-tight text-slate-950 transition hover:text-primary">
                          {leadNews.title}
                        </h3>
                      </Link>
                      <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">
                        {getExcerpt(leadNews)}
                      </p>
                      <div className="mt-6 flex flex-wrap gap-3">
                        {formatLongDate(leadNews.published_at) && (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
                            {formatLongDate(leadNews.published_at)}
                          </span>
                        )}
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
                          {leadNews.comments_count} комментариев
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
                          {leadNews.views_count ?? 0} просмотров
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 bg-slate-50 lg:border-l lg:border-t-0">
                      {leadNews.images[0]?.url ? (
                        <Link to={`/news/${leadNews.slug}`} className="block h-full w-full">
                          <img
                            src={leadNews.images[0].url}
                            alt={leadNews.title}
                            className="h-full min-h-[240px] w-full object-cover transition duration-300 hover:scale-[1.01]"
                          />
                        </Link>
                      ) : (
                        <div className="flex h-full min-h-[240px] items-center justify-center p-6 text-center text-sm text-slate-400">
                          В этой новости нет обложки, но внутри есть полное описание обновления.
                        </div>
                      )}
                    </div>
                  </div>
                </article>

                <div className="space-y-4">
                  {feedNews.map((article) => (
                    <article
                      key={article.id}
                      className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_50px_-44px_rgba(15,23,42,0.28)]"
                    >
                      <div className="grid gap-4 sm:grid-cols-[76px_minmax(0,1fr)]">
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Дата</div>
                          <div className="mt-1 text-sm font-medium text-slate-900">{formatShortDate(article.published_at)}</div>
                        </div>
                        <div className="min-w-0">
                          <Link to={`/news/${article.slug}`} className="block">
                            <h3 className="text-xl font-semibold tracking-tight text-slate-950 transition hover:text-primary">
                              {article.title}
                            </h3>
                          </Link>
                          <p className="mt-3 text-sm leading-7 text-slate-600">
                            {getExcerpt(article)}
                          </p>
                          <div className="mt-4 flex flex-wrap gap-3">
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
                              {article.comments_count} комментариев
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
                              {article.views_count ?? 0} просмотров
                            </span>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}

                  {totalNews > 3 && (
                    <Link
                      to="/news"
                      className="inline-flex items-center justify-center rounded-md border border-input bg-background px-5 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      Показать весь архив новостей
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => (
            <Link
              key={section.href}
              to={section.href}
              className="block rounded-lg border p-6 transition-shadow hover:shadow-md"
            >
              <h3 className="mb-2 text-lg font-semibold">{section.title}</h3>
              <p className="mb-4 text-sm text-muted-foreground">{section.description}</p>
              <span className="text-sm font-medium text-primary">{section.label} →</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
