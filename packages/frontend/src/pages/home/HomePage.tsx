import { Link } from 'react-router-dom';
import { useLatestNews } from '../../hooks/useNews';
import { NewsCard } from '../../components/news/NewsCard';

const sections = [
  {
    title: 'Инструменты и модели',
    description: 'Находите, сравнивайте и выбирайте лучшие LLM-решения для ваших задач.',
    href: '/tools',
    label: 'Смотреть инструменты',
  },
  {
    title: 'Быстрый конструктор агента',
    description: 'Пройдите короткие шаги, выберите роль, инструменты и стиль работы, а на выходе получите готового AI-агента.',
    href: '/builder/stack',
    label: 'Собрать агента',
  },
  {
    title: 'Конструктор агента',
    description: 'Создайте AI-агента, настройте модель, промпты и инструменты, и протестируйте прямо на сайте.',
    href: '/builder/agent',
    label: 'Создать агента',
  },
  {
    title: 'Локальные решения',
    description: 'Лучшие локальные сборки для Ollama, LM Studio, llama.cpp и других.',
    href: '/local',
    label: 'Локальные сборки',
  },
  {
    title: 'Статьи',
    description: 'Публичные материалы из каталога: обзоры, гайды и заметки.',
    href: '/articles',
    label: 'Смотреть статьи',
  },
  {
    title: 'Новости',
    description: 'Следите за обновлениями платформы, новыми публикациями и важными изменениями в продукте.',
    href: '/news',
    label: 'Открыть новости',
  },
];

export function HomePage() {
  const { data: newsData } = useLatestNews(3);
  const newsItems = newsData?.data ?? [];
  const totalNews = newsData?.meta?.total ?? 0;

  return (
    <div>
      <section className="bg-gradient-to-b from-primary/5 to-background py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl">
            Находите, сравнивайте и собирайте
            <br />
            <span className="text-primary">AI-решения</span>
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground">
            LLMStore.pro - единая платформа для поиска LLM-инструментов, моделей, промпт-паков,
            локальных сборок и создания AI-агентов.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              to="/tools"
              className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Каталог
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
        <div className="rounded-2xl border bg-white p-8">
          <div className="max-w-3xl">
            <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Как это работает</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">Цифровой сервис без физической доставки</h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              Пользователь регистрируется в LLMStore.pro, пополняет внутренний баланс и использует
              его для чатов с AI-моделями, запусков AI-агентов и других функций платформы.
              После успешной оплаты баланс зачисляется автоматически и сразу доступен в аккаунте.
            </p>
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
      </section>

      {newsItems.length > 0 && (
        <section className="container mx-auto px-4 py-12">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold">Последние новости</h2>
            {totalNews > 3 && (
              <Link to="/news" className="text-sm font-medium text-primary hover:underline">
                Показать все &rarr;
              </Link>
            )}
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {newsItems.map((article: any) => (
              <NewsCard key={article.id} article={article} />
            ))}
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
              <span className="text-sm font-medium text-primary">{section.label} &rarr;</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
