import { Link } from 'react-router-dom';
import { useLatestNews } from '../../hooks/useNews';
import { useArticlesList } from '../../hooks/useArticles';
import { useAuth } from '../../hooks/useAuth';
import { UserLink } from '../../components/users/UserLink';
import type { NewsArticle } from '../../lib/api/news';
import {
  ComparisonSection,
  CostExamplesSection,
  ProductWorkflowSection,
  UseCaseCardsSection,
} from '../../components/product/ProductClaritySections';

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
  const { isAuthenticated } = useAuth();
  const { data: newsData } = useLatestNews(3);
  const { data: articleData } = useArticlesList({ sort: 'top_week', per_page: 3, page: 1, recommended: isAuthenticated });
  const newsItems: NewsArticle[] = newsData?.data ?? [];
  const articleItems = articleData?.data ?? [];
  const totalNews = newsData?.meta?.total ?? 0;

  return (
    <div>
      <section className="bg-gradient-to-b from-primary/5 to-background py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl">
            <span className="block md:hidden">
              <span className="block">AI-агенты</span>
              <span className="block">для живых</span>
              <span className="block text-primary">проектов</span>
            </span>
            <span className="hidden md:inline">
              AI-агенты, которые не просто отвечают,
              <br />
              <span className="text-primary">а собирают и запускают результат</span>
            </span>
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground">
            LLMStore.pro помогает собрать агента под задачу, выбрать модель и инструменты,
            получить runnable-проект, посмотреть логи, исправить ошибку и поделиться результатом.
          </p>
          <div className="mx-auto flex max-w-[420px] flex-col items-stretch gap-3 sm:hidden">
            <Link
              to="/builder/stack"
              className="inline-flex w-full items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Собрать агента
            </Link>
            <Link
              to="/gallery"
              className="inline-flex w-full items-center justify-center rounded-md border border-input bg-background px-6 py-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Смотреть галерею
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex w-full items-center justify-center rounded-md border border-input bg-background px-6 py-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Как это работает
            </a>
          </div>

          <div className="mx-auto hidden max-w-[760px] grid-cols-3 gap-4 sm:grid">
            <Link
              to="/builder/stack"
              className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Собрать агента
            </Link>
            <Link
              to="/gallery"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-6 py-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Смотреть галерею
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-6 py-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Как это работает
            </a>
          </div>
        </div>
      </section>

      <UseCaseCardsSection />
      <ProductWorkflowSection />
      <ComparisonSection />
      <CostExamplesSection />

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

            <div className="grid gap-6 lg:grid-cols-3">
              {newsItems.map((article) => (
                <article
                  key={article.id}
                  className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_60px_-44px_rgba(15,23,42,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_80px_-48px_rgba(15,23,42,0.32)]"
                >
                  <Link to={`/news/${article.slug}`} className="block">
                    {article.images[0]?.url ? (
                      <div className="overflow-hidden border-b border-slate-200 bg-slate-50">
                        <img
                          src={article.images[0].url}
                          alt={article.title}
                          className="h-56 w-full object-cover transition duration-300 hover:scale-[1.02]"
                        />
                      </div>
                    ) : (
                      <div className="flex h-56 items-center justify-center border-b border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-400">
                        Обложка новости пока не добавлена.
                      </div>
                    )}
                  </Link>

                  <div className="flex h-[calc(100%-14rem)] flex-col p-6">
                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                        {formatShortDate(article.published_at)}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                        {article.comments_count} комментариев
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                        {article.views_count ?? 0} просмотров
                      </span>
                    </div>

                    <Link to={`/news/${article.slug}`} className="mt-4 block">
                      <h3 className="text-2xl font-semibold tracking-tight text-slate-950 transition hover:text-primary">
                        {article.title}
                      </h3>
                    </Link>

                    <p className="mt-4 flex-1 text-sm leading-7 text-slate-600">
                      {getExcerpt(article)}
                    </p>

                    <div className="mt-5 text-sm text-slate-500">
                      Автор:{' '}
                      <UserLink
                        username={article.author?.username}
                        name={article.author?.name}
                        fallback="Команда LLMStore"
                        className="font-medium text-slate-700 hover:text-primary"
                      />
                    </div>

                    <div className="mt-6 flex items-center justify-between gap-4">
                      <span className="text-sm text-slate-500">
                        {formatLongDate(article.published_at) ?? formatShortDate(article.published_at)}
                      </span>
                      <Link
                        to={`/news/${article.slug}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Открыть →
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {totalNews > 3 && (
              <div className="mt-8 flex justify-center">
                <Link
                  to="/news"
                  className="inline-flex items-center justify-center rounded-md border border-input bg-background px-5 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  Показать все новости
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {articleItems.length > 0 && (
        <section className="container mx-auto px-4 py-12">
          <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.35)] md:p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Опыт сообщества</p>
                <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Популярные статьи недели</h2>
              </div>
              <Link to="/articles" className="text-sm font-medium text-primary hover:underline">
                Открыть все статьи →
              </Link>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {articleItems.map((article) => (
                <article
                  key={article.id}
                  className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_60px_-44px_rgba(15,23,42,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_80px_-48px_rgba(15,23,42,0.32)]"
                >
                  {article.hero_image_url ? (
                    <Link to={`/articles/${article.slug}`} className="block overflow-hidden border-b border-slate-200 bg-slate-50">
                      <img
                        src={article.hero_image_url}
                        alt={article.title}
                        className="h-56 w-full object-cover transition duration-300 hover:scale-[1.02]"
                      />
                    </Link>
                  ) : null}

                  <div className="p-6">
                    <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                        {article.likes_count ?? 0} лайков
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                        {article.comments_count ?? 0} комментариев
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                        {article.views_count ?? 0} просмотров
                      </span>
                    </div>

                    <Link to={`/articles/${article.slug}`} className="mt-4 block">
                      <h3 className="text-2xl font-semibold tracking-tight text-slate-950 transition hover:text-primary">
                        {article.title}
                      </h3>
                    </Link>

                    <p className="mt-4 text-sm leading-7 text-slate-600">
                      {article.short_description}
                    </p>

                    <div className="mt-6 flex items-center justify-between gap-4">
                      <span className="text-sm text-slate-500">
                        Score: {Math.round(article.ranking_score ?? 0)}
                      </span>
                      <Link to={`/articles/${article.slug}`} className="text-sm font-medium text-primary hover:underline">
                        Читать →
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
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
