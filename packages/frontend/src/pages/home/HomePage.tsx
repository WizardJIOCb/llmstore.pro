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
    title: 'Русский рынок',
    description: 'Лучшие модели и инструменты для русского языка.',
    href: '/russian-market',
    label: 'Обзор',
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
      {/* Hero */}
      <section className="bg-gradient-to-b from-primary/5 to-background py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">
            Находите, сравнивайте и собирайте
            <br />
            <span className="text-primary">AI-решения</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            LLMStore.pro — единая платформа для поиска LLM-инструментов, моделей, промпт-паков,
            локальных сборок и создания AI-агентов.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              to="/tools"
              className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Каталог
            </Link>
            <Link
              to="/builder/stack"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-6 py-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Собрать стек
            </Link>
          </div>
        </div>
      </section>

      {/* Latest News */}
      {newsItems.length > 0 && (
        <section className="container mx-auto px-4 py-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Последние новости</h2>
            {totalNews > 3 && (
              <Link to="/news" className="text-sm text-primary font-medium hover:underline">
                Показать все &rarr;
              </Link>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {newsItems.map((article: any) => (
              <NewsCard key={article.id} article={article} />
            ))}
          </div>
        </section>
      )}

      {/* Sections grid */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sections.map((section) => (
            <Link
              key={section.href}
              to={section.href}
              className="block rounded-lg border p-6 hover:shadow-md transition-shadow"
            >
              <h3 className="font-semibold text-lg mb-2">{section.title}</h3>
              <p className="text-sm text-muted-foreground mb-4">{section.description}</p>
              <span className="text-sm text-primary font-medium">{section.label} &rarr;</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
