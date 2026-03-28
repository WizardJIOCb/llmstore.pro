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
    title: 'Конструктор стека',
    description: 'Ответьте на вопросы и получите персональную рекомендацию AI-стека.',
    href: '/builder/stack',
    label: 'Собрать стек',
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
    title: 'Паки и ассеты',
    description: 'Готовые наборы промптов, воркфлоу, шаблоны и компоненты для разработчиков.',
    href: '/packs',
    label: 'Каталог паков',
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
              Собрать стек
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
