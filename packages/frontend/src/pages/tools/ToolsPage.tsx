import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBuiltinTools } from '../../hooks/useAgents';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Spinner } from '../../components/ui';
import type { ToolDefinition } from '../../lib/api/agents';

type ToolGroupKey = 'research' | 'data' | 'automation';

interface ToolGroupDefinition {
  key: ToolGroupKey;
  title: string;
  description: string;
  audience: string;
  slugs: string[];
}

const TOOL_GROUPS: ToolGroupDefinition[] = [
  {
    key: 'research',
    title: 'Поиск и работа с источниками',
    description: 'Для ресерча, новостей, фактчекинга и агентов, которые должны опираться на внешние данные.',
    audience: 'Подходит для поисковых, новостных и аналитических агентов.',
    slugs: ['web-search-cascade', 'dtf-latest-feed', 'dtf-article-fetch', 'dtf-popular-feed', 'http-request'],
  },
  {
    key: 'data',
    title: 'Расчёты и обработка данных',
    description: 'Для логики, вычислений, структурирования JSON и генерации текстов по шаблонам.',
    audience: 'Подходит для продуктовых, операционных и помощников по внутренним процессам.',
    slugs: ['calculator', 'json-transform', 'template-renderer'],
  },
  {
    key: 'automation',
    title: 'Интеграции и автоматизация',
    description: 'Для отправки данных наружу, вызова API и сценариев, где агент должен не только отвечать, но и действовать.',
    audience: 'Подходит для интеграционных агентов и автоматизации рабочих процессов.',
    slugs: ['webhook-call', 'http-request'],
  },
];

const TOOL_TYPE_LABELS: Record<string, string> = {
  http_request: 'HTTP/API',
  calculator: 'Вычисления',
  json_transform: 'JSON',
  template_renderer: 'Шаблоны',
  webhook_call: 'Webhook',
  mock_tool: 'Служебный',
};

const EXAMPLE_AGENT_CARDS = [
  {
    title: 'WEB Поиск',
    description: 'Публичный агент для поиска свежей информации в интернете и выдачи прямых ссылок на релевантные источники.',
    tools: ['Web Search Cascade'],
    href: '/my/agents?tab=search',
    cta: 'Найти в агентах',
  },
  {
    title: 'DTF News Agent',
    description: 'Показывает свежие и популярные материалы DTF, умеет загружать статьи и делать краткие пересказы.',
    tools: ['DTF Latest Feed', 'DTF Article Fetch', 'DTF Popular Feed'],
    href: '/my/agents?tab=search',
    cta: 'Открыть поиск агентов',
  },
  {
    title: 'Свой агент под задачу',
    description: 'Если вам нужен другой сценарий, вы можете собрать агента под себя и включить в него нужные инструменты прямо в конструкторе.',
    tools: ['HTTP Request', 'Webhook Call', 'Calculator', 'Template Renderer'],
    href: '/builder/stack',
    cta: 'Собрать агента',
  },
];

function getToolGroupKey(tool: ToolDefinition): ToolGroupKey {
  if (TOOL_GROUPS[0].slugs.includes(tool.slug)) return 'research';
  if (TOOL_GROUPS[1].slugs.includes(tool.slug)) return 'data';
  return 'automation';
}

function getToolTypeLabel(toolType: string): string {
  return TOOL_TYPE_LABELS[toolType] ?? toolType;
}

function buildToolUseCases(tool: ToolDefinition): string {
  switch (tool.slug) {
    case 'web-search-cascade':
      return 'Свежие новости, поиск по интернету, фактчекинг.';
    case 'dtf-latest-feed':
    case 'dtf-popular-feed':
      return 'Ленты новостей и подборки материалов.';
    case 'dtf-article-fetch':
      return 'Загрузка полной статьи и пересказ содержимого.';
    case 'http-request':
      return 'Подключение внешних API и получение данных из сервисов.';
    case 'calculator':
      return 'Расчёты, формулы и проверка чисел.';
    case 'json-transform':
      return 'Структурирование и преобразование JSON.';
    case 'template-renderer':
      return 'Генерация текстов, шаблонов и ответов по переменным.';
    case 'webhook-call':
      return 'Отправка данных во внешние системы и автоматизация.';
    default:
      return 'Расширение возможностей агента под конкретный сценарий.';
  }
}

export function ToolsPage() {
  const navigate = useNavigate();
  const { data: tools, isLoading } = useBuiltinTools();
  const [query, setQuery] = useState('');

  const goTo = (href: string) => {
    navigate(href);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  };

  const filteredTools = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const items = tools ?? [];
    if (!normalized) return items;
    return items.filter((tool) => (
      [
        tool.name,
        tool.slug,
        tool.description ?? '',
        getToolTypeLabel(tool.tool_type),
        buildToolUseCases(tool),
      ].join(' ').toLowerCase().includes(normalized)
    ));
  }, [tools, query]);

  const groupedTools = useMemo(() => {
    const map = new Map<ToolGroupKey, ToolDefinition[]>();
    TOOL_GROUPS.forEach((group) => map.set(group.key, []));
    filteredTools.forEach((tool) => {
      const key = getToolGroupKey(tool);
      map.set(key, [...(map.get(key) ?? []), tool]);
    });
    return map;
  }, [filteredTools]);

  return (
    <div className="bg-gradient-to-b from-primary/5 via-background to-background">
      <section className="container mx-auto px-4 py-16">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Инструменты для агентов</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
            Что ваши агенты
            <br />
            <span className="text-primary">могут делать на практике</span>
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
            Инструменты превращают агента из просто собеседника в полезный рабочий сценарий: искать информацию,
            читать источники, считать, преобразовывать данные и вызывать внешние сервисы.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" onClick={() => goTo('/builder/stack')}>Собрать агента</Button>
            <Button variant="outline" size="lg" onClick={() => goTo('/my/agents?tab=search')}>Посмотреть агентов</Button>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            <Badge variant="secondary">Поиск и ресерч</Badge>
            <Badge variant="secondary">Работа с источниками</Badge>
            <Badge variant="secondary">Расчёты и JSON</Badge>
            <Badge variant="secondary">Webhook и API</Badge>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 pb-10">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {TOOL_GROUPS.map((group) => {
            const items = groupedTools.get(group.key) ?? [];
            return (
              <Card key={group.key} className="border-white/60 bg-white/90">
                <CardHeader>
                  <CardTitle>{group.title}</CardTitle>
                  <CardDescription>{group.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">{group.audience}</p>
                  <div className="flex flex-wrap gap-2">
                    {items.length > 0 ? items.map((tool) => (
                      <Badge key={tool.id} variant="outline">{tool.name}</Badge>
                    )) : (
                      <span className="text-sm text-muted-foreground">Инструменты появятся здесь после загрузки.</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="container mx-auto px-4 py-10">
        <div className="mb-6 max-w-3xl">
          <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Готовые примеры</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight">Где это уже используется</h2>
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            Ниже не абстрактные “возможности”, а реальные сценарии. Часть инструментов уже используется в готовых агентах,
            а остальное можно сразу включить в своего агента через конструктор.
          </p>
        </div>
        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3">
          {EXAMPLE_AGENT_CARDS.map((card) => (
            <Card key={card.title} className="flex h-full flex-col">
              <CardHeader>
                <CardTitle>{card.title}</CardTitle>
                <CardDescription>{card.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-5">
                <div className="flex flex-wrap gap-2">
                  {card.tools.map((tool) => (
                    <Badge key={tool} variant="secondary">{tool}</Badge>
                  ))}
                </div>
                <Button variant="outline" className="mt-auto w-full" onClick={() => goTo(card.href)}>
                  {card.cta}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4 py-10">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Полный список</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">Все доступные инструменты</h2>
            <p className="mt-3 text-base leading-7 text-muted-foreground">
              Это реальные инструменты, которые мы можем подключать к агентам. Ищите по названию или сценарию и сразу
              понимайте, для чего каждый из них подходит.
            </p>
          </div>
          <div className="w-full lg:max-w-sm">
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по инструментам..."
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : filteredTools.length === 0 ? (
          <div className="rounded-2xl border bg-white p-10 text-center">
            <p className="text-base text-muted-foreground">По текущему запросу инструменты не найдены.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {filteredTools.map((tool) => (
              <Card key={tool.id} className="h-full">
                <CardHeader className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{getToolTypeLabel(tool.tool_type)}</Badge>
                    <Badge variant={tool.is_builtin ? 'secondary' : 'outline'}>
                      {tool.is_builtin ? 'Встроенный' : 'Пользовательский'}
                    </Badge>
                  </div>
                  <div>
                    <CardTitle className="text-xl">{tool.name}</CardTitle>
                    <CardDescription className="mt-2 break-all text-xs">`{tool.slug}`</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm leading-6 text-muted-foreground">
                    {tool.description ?? 'Инструмент расширяет возможности агента в прикладных сценариях.'}
                  </p>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Подходит для</p>
                    <p className="mt-2 text-sm leading-6 text-slate-900">{buildToolUseCases(tool)}</p>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" className="w-full" onClick={() => goTo('/builder/stack')}>
                      Использовать в агенте
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
