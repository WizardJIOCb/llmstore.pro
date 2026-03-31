import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TemplatePicker } from '../../components/agents/TemplatePicker';
import { AgentForm } from '../../components/agents/AgentForm';
import { AgentWizardBuilder } from '../../components/agents/AgentWizardBuilder';
import { useBuiltinTools, useCreateAgent } from '../../hooks/useAgents';
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
    starter_prompts: [
      'Покажи 5 последних новостей DTF',
      'Найди самую обсуждаемую новость и кратко объясни контекст',
      'Сделай короткий дайджест главных тем за сегодня',
    ],
  },
};

const OPENROUTER_CODING_TEMPLATE = {
  name: 'OpenRouter Coding Agent',
  description: 'Агент для задач по разработке: принимает ТЗ и файлы, показывает ход работы, итог и preview.',
  system_prompt: `Ты — OpenRouter Coding Agent для llmstore.pro.

Роль:
- принимаешь задачу на разработку в чате;
- анализируешь текст сообщения и прикрепленные файлы;
- предлагаешь инженерное решение;
- показываешь ход работы и понятный итог на русском языке.

Правила:
1. Всегда отвечай на русском.
2. Если пользователь приложил файлы, опирайся на них как на основной контекст.
3. Обязательно возвращай сначала блок <dev-report>...</dev-report> с валидным JSON, а после него обычный markdown-ответ.
4. Внутри dev-report заполняй summary и worklog, по возможности changed_files и how_to_run.
5. Если можно показать standalone preview, добавляй preview с type="html" и полным HTML для iframe.
6. После dev-report дай короткое человекочитаемое объяснение, что сделал и как использовать результат.

Схема dev-report:
{
  "summary": "краткий итог",
  "worklog": ["шаг 1", "шаг 2"],
  "changed_files": [{ "path": "src/App.tsx", "summary": "что изменилось" }],
  "how_to_run": ["что сделать дальше"],
  "notes": ["важная оговорка"],
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
    chat_intro: 'Опишите задачу по разработке, прикрепите ТЗ или кодовые файлы, и агент вернет ход работы, список измененных файлов и preview, если его можно показать прямо в чате.',
    starter_prompts: [
      'Сделай одностраничный лендинг и покажи preview',
      'Проанализируй приложенный файл и предложи улучшенную версию',
      'Собери структуру небольшой React-фичи по ТЗ',
    ],
  },
};

export function AgentBuilderPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'template' | 'form' | 'wizard'>('template');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const { data: tools, isLoading: toolsLoading } = useBuiltinTools();
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

  const getInitialData = () => {
    if (templateId === 'dtf-news') {
      return { ...DTF_TEMPLATE, tool_ids: getDtfToolIds() };
    }

    if (templateId === 'openrouter-coding') {
      return { ...OPENROUTER_CODING_TEMPLATE, tool_ids: [] };
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
