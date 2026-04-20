import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TemplatePicker } from '../../components/agents/TemplatePicker';
import { AgentForm } from '../../components/agents/AgentForm';
import { AgentWizardBuilder } from '../../components/agents/AgentWizardBuilder';
import { useBuiltinTools, useCreateAgent } from '../../hooks/useAgents';
import { useAppSettings } from '../../hooks/useAppSettings';
import { Spinner } from '../../components/ui/Spinner';

const DTF_TEMPLATE = {
  name: 'DTF News Agent',
  description: 'AI-агент для получения и анализа новостей с DTF.ru',
  system_prompt: `Ты — новостной помощник DTF.ru. Твоя задача — помогать пользователю получать и анализировать новости с сайта DTF.ru.

Возможности:
- Получить список последних статей с DTF через инструмент dtf-latest-feed
- Загрузить полный текст конкретной статьи по URL через инструмент dtf-article-fetch
- Сделать краткий пересказ статьи
- Ответить на вопросы по содержанию статей

Правила:
- Всегда отвечай на русском языке
- При перечислении статей указывай заголовок, автора и ссылку
- При пересказе выделяй ключевые моменты
- Если пользователь просит последние новости, сначала получи ленту, затем предложи пересказать интересные статьи`,
  runtime_config: {
    max_iterations: 6,
    temperature: 0.3,
    max_tokens: 4096,
    model_external_id: 'google/gemini-2.0-flash-001',
    chat_intro: 'Помогаю с новостями DTF: могу показать свежие статьи, разобрать выбранную и сделать краткий пересказ.',
    starter_prompts: [],
  },
};

const OPENROUTER_CODING_TEMPLATE = {
  name: 'OpenRouter Coding Agent',
  description: 'Агент для задач по разработке: принимает ТЗ и файлы, показывает ход работы, итог и preview.',
  system_prompt: `Ты — OpenRouter Coding Agent для llmstore.pro.

Роль:
- принимаешь задачу на разработку в чате;
- анализируешь текст сообщения и прикреплённые файлы;
- предлагаешь инженерное решение;
- показываешь ход работы и понятный итог на русском языке.

Правила:
1. Всегда отвечай на русском.
2. Если пользователь приложил файлы, опирайся на них как на основной контекст.
3. Обязательно возвращай сначала блок <dev-report>...</dev-report> с валидным JSON, а после него обычный markdown-ответ.
4. Внутри dev-report заполняй summary и worklog, по возможности changed_files и how_to_run.
5. Если можно показать standalone preview, добавляй preview с type="html" и полным HTML для iframe.
6. Если генерируешь Telegram-бота или webhook-проект для Telegram, делай отправку сообщений с Telegram-совместимым форматированием.
7. Для Telegram предпочитай parse_mode="HTML" и преобразование markdown-подобного текста в поддерживаемый Telegram HTML.
8. Не отправляй в Telegram сырой markdown вроде **bold**, markdown-маркеры списков или markdown-ссылки без конвертации.
9. После dev-report дай короткое человекочитаемое объяснение, что сделал и как использовать результат.

Схема dev-report:
{
  "summary": "краткий итог",
  "worklog": ["шаг 1", "шаг 2"],
  "changed_files": [{ "path": "src/App.tsx", "summary": "что изменилось" }],
  "how_to_run": ["что сделать дальше"],
  "notes": ["важная оговорка"],
  "project": {
    "title": "project name",
    "runtime": "node" | "python" | "static" | "generic",
    "root_dir": ".",
    "entrypoint": "server.js",
    "install": ["npm install"],
    "run": ["npm start"],
    "test": ["npm test"],
    "files": [
      { "path": "server.js", "summary": "entrypoint", "language": "javascript", "entrypoint": true, "content": "full file content" }
    ]
  },
  "preview": {
    "type": "html" | "url",
    "title": "название preview",
    "html": "<!doctype html>...",
    "url": "https://..."
  }
}`,
  runtime_config: {
    max_iterations: 6,
    temperature: 0.2,
    max_tokens: 8192,
    model_external_id: 'anthropic/claude-sonnet-4.6',
    chat_intro: 'Опишите задачу по разработке, прикрепите ТЗ или кодовые файлы, и агент вернёт ход работы, список изменённых файлов и preview, если его можно показать прямо в чате.',
    starter_prompts: [],
  },
};

const LANDING_WEB_SEARCH_TEMPLATE = {
  name: 'Landing Builder + Web Search',
  description: 'Агент для лендингов: сначала читает ссылки из промпта, затем добирает факты из поиска и возвращает HTML preview без шаблонной отсебятины.',
  system_prompt: `Ты — Landing Builder + Web Search для llmstore.pro.

Роль:
- собираешь лендинги, посадочные страницы и standalone HTML preview;
- сначала проверяешь, какие факты уже дал пользователь;
- если в сообщении есть ссылки, сначала читаешь их через HTTP Request;
- если данных не хватает, добираешь факты через Web Search Cascade;
- только после этого собираешь один цельный лендинг, который соответствует исходному запросу.

Правила:
1. Отвечай на русском, если пользователь не просил другой язык.
2. Если в промпте есть релевантные URL, сначала используй HTTP Request.
3. Если после чтения ссылок данных всё ещё мало, используй Web Search Cascade.
4. Не подменяй задачу generic SaaS-лендингом и не придумывай чужие секции.
5. Не выдумывай контакты, достижения, цифры, биографию и другие факты.
6. Для задач про landing или preview лучше сразу возвращай dev-report с готовым HTML preview без длинного markdown после него.

Формат ответа:
- сначала <dev-report>...</dev-report> с валидным JSON;
- если задача про landing или preview, ничего не пиши после </dev-report>.
`,
  runtime_config: {
    max_iterations: 6,
    temperature: 0.15,
    max_tokens: 12288,
    model_external_id: 'anthropic/claude-sonnet-4.6',
    chat_intro: 'Опишите, для кого или для чего нужен лендинг. Если в сообщении есть ссылки, агент сначала прочитает их, затем доберёт факты из поиска и вернёт HTML preview.',
    starter_prompts: [
      'Собери лендинг по ссылкам из промпта: сначала прочитай их, затем добери факты из поиска и верни HTML preview',
      'Сделай необычный или шуточный лендинг, но не придумывай неподтверждённые факты',
      'Собери landing page для компании или эксперта: сначала исследование, потом аккуратный HTML preview',
    ],
  },
};

const KIMI_ORCHESTRATOR_TEMPLATE = {
  name: 'Kimi K2.5 Fullstack Orchestrator',
  description: 'Orchestration-first агент для крупных задач: лендинги, большие fullstack-проекты, архитектура и глубокая аналитика материалов.',
  system_prompt: `Ты — Kimi K2.5 Fullstack Orchestrator для llmstore.pro.

Роль:
- принимаешь большие продуктовые, fullstack и аналитические задачи;
- сначала раскладываешь их на понятные потоки работ;
- проектируешь контракты между частями системы;
- при необходимости переходишь к коду, runnable bundle и preview.

Как работать:
1. Всегда отвечай на русском.
2. Если задача крупная, сначала дай декомпозицию на frontend, backend, data/integrations, content/UX и verification.
3. Для каждого потока фиксируй цель, входы, выходы, риски и критерии готовности.
4. Если пользователь просит код сразу, после декомпозиции переходи к реализации без лишней воды.
5. Если пользователь приложил файлы или материалы, опирайся на них как на основной контекст.
6. Когда выгодно, используй инструмент llm-orchestrator-worker для делегации отдельных подзадач worker-моделям.
7. Не утверждай, что ты реально делегировал задачу другим моделям, если этого не происходило.
8. Если уместно показать standalone preview, верни его.
9. Для runnable проектов и preview используй тот же dev-report формат, что и coding-agent.

Формат ответа:
- сначала блок <dev-report>...</dev-report> с валидным JSON;
- затем короткий markdown-ответ по сути;
- если задача про landing или preview, после dev-report можно ничего не писать.`,
  runtime_config: {
    max_iterations: 8,
    temperature: 0.15,
    max_tokens: 12288,
    model_external_id: 'moonshotai/kimi-k2.5',
    chat_intro: 'Опишите большой проект, лендинг, fullstack-задачу или материал для анализа. Агент сначала соберёт карту работ и архитектуру, а затем сможет перейти к реализации.',
    starter_prompts: [
      'Разбей большой fullstack-проект на этапы: frontend, backend, data, integrations и verification',
      'Спроектируй лендинг с backend-частью и опиши контракты между слоями',
      'Проведи глубокую аналитику статьи или исследования и выдай структуру выводов и следующих задач',
    ],
  },
};

export function AgentBuilderPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'template' | 'form' | 'wizard'>('template');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const { data: tools, isLoading: toolsLoading } = useBuiltinTools();
  const { data: appSettings } = useAppSettings();
  const createAgent = useCreateAgent();

  const handleTemplateSelect = (id: string) => {
    if (id === 'agent-wizard') {
      setTemplateId(null);
      setStep('wizard');
      return;
    }
    setTemplateId(id);
    setStep('form');
  };

  const getDtfToolIds = () => {
    if (!tools) return [];
    return tools
      .filter((t) => t.slug === 'dtf-latest-feed' || t.slug === 'dtf-article-fetch')
      .map((t) => t.id);
  };

  const getToolIdsBySlug = (slugs: string[]) => {
    if (!tools) return [];
    const slugSet = new Set(slugs);
    return tools
      .filter((tool) => slugSet.has(tool.slug))
      .map((tool) => tool.id);
  };

  const getInitialData = () => {
    if (templateId === 'dtf-news') {
      return {
        ...DTF_TEMPLATE,
        tool_ids: getDtfToolIds(),
        runtime_config: {
          ...DTF_TEMPLATE.runtime_config,
          starter_prompts: appSettings?.starter_prompts.dtf_news_agent ?? [],
        },
      };
    }

    if (templateId === 'openrouter-coding') {
      return {
        ...OPENROUTER_CODING_TEMPLATE,
        tool_ids: [],
        runtime_config: {
          ...OPENROUTER_CODING_TEMPLATE.runtime_config,
          starter_prompts: appSettings?.starter_prompts.openrouter_coding_agent ?? [],
        },
      };
    }

    if (templateId === 'landing-web-search') {
      return {
        ...LANDING_WEB_SEARCH_TEMPLATE,
        tool_ids: getToolIdsBySlug(['web-search-cascade', 'http-request']),
      };
    }

    if (templateId === 'kimi-orchestrator') {
      return {
        ...KIMI_ORCHESTRATOR_TEMPLATE,
        tool_ids: getToolIdsBySlug(['llm-orchestrator-worker', 'web-search-cascade']),
      };
    }

    return {
      name: '',
      description: '',
      visibility: 'private' as const,
      system_prompt: '',
      tool_ids: [],
      runtime_config: {
        max_iterations: 4,
        temperature: 0.3,
        max_tokens: 4096,
        model_external_id: 'anthropic/claude-sonnet-4.6',
        chat_intro: '',
        starter_prompts: [],
      },
    };
  };

  const handleSubmit = async (data: {
    name: string;
    description: string;
    visibility: 'public' | 'private';
    system_prompt: string;
    tool_ids: string[];
    runtime_config: {
      max_iterations: number;
      temperature: number;
      max_tokens: number;
      model_external_id?: string;
      chat_intro?: string;
      starter_prompts?: string[];
    };
  }) => {
    const agent = await createAgent.mutateAsync(data);
    navigate(`/playground/agent/${agent.id}`);
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Конструктор агента</h1>

      {step === 'template' && (
        <>
          <p className="mb-6 text-muted-foreground">
            Выберите шаблон для быстрого старта или создайте агента с нуля.
          </p>
          <TemplatePicker onSelect={handleTemplateSelect} />
        </>
      )}

      {step === 'form' && (
        <>
          <button
            onClick={() => setStep('template')}
            className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Назад к шаблонам
          </button>
          {toolsLoading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : (
            <AgentForm
              initialData={getInitialData()}
              tools={tools ?? []}
              onSubmit={handleSubmit}
              isSubmitting={createAgent.isPending}
              submitLabel="Создать и открыть"
            />
          )}
          {createAgent.isError && (
            <p className="mt-4 text-sm text-destructive">
              Ошибка: {(createAgent.error as Error).message}
            </p>
          )}
        </>
      )}

      {step === 'wizard' && (
        <>
          <button
            onClick={() => setStep('template')}
            className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Назад к шаблонам
          </button>
          {toolsLoading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : (
            <AgentWizardBuilder
              tools={tools ?? []}
              onSubmit={handleSubmit}
              isSubmitting={createAgent.isPending}
            />
          )}
          {createAgent.isError && (
            <p className="mt-4 text-sm text-destructive">
              Ошибка: {(createAgent.error as Error).message}
            </p>
          )}
        </>
      )}
    </div>
  );
}
