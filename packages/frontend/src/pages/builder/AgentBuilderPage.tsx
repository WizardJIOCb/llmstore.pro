import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TemplatePicker } from '../../components/agents/TemplatePicker';
import { AgentForm } from '../../components/agents/AgentForm';
import { useBuiltinTools, useCreateAgent } from '../../hooks/useAgents';
import { Spinner } from '../../components/ui/Spinner';

const DTF_TEMPLATE = {
  name: 'DTF News Agent',
  description: 'AI-агент для получения и анализа новостей с DTF.ru',
  system_prompt: `Ты — новостной помощник DTF.ru. Твоя задача — помогать пользователю получать и анализировать новости с сайта DTF.ru.

Возможности:
- Получить список последних статей с DTF (используй инструмент dtf-latest-feed)
- Загрузить полный текст конкретной статьи по URL (используй инструмент dtf-article-fetch)
- Сделать краткий пересказ статьи
- Ответить на вопросы по содержанию статей

Правила:
- Всегда отвечай на русском языке
- При перечислении статей указывай заголовок, автора и ссылку
- При пересказе выделяй ключевые моменты
- Если пользователь просит "последние новости" — сначала получи ленту, затем предложи пересказать интересные статьи`,
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

export function AgentBuilderPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'template' | 'form'>('template');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const { data: tools, isLoading: toolsLoading } = useBuiltinTools();
  const createAgent = useCreateAgent();

  const handleTemplateSelect = (id: string) => {
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
        model_external_id: 'google/gemini-2.0-flash-001',
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
      <h1 className="text-2xl font-bold mb-6">Конструктор агента</h1>

      {step === 'template' && (
        <>
          <p className="text-muted-foreground mb-6">
            Выберите шаблон для быстрого старта или создайте агента с нуля.
          </p>
          <TemplatePicker onSelect={handleTemplateSelect} />
        </>
      )}

      {step === 'form' && (
        <>
          <button
            onClick={() => setStep('template')}
            className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1"
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
    </div>
  );
}

