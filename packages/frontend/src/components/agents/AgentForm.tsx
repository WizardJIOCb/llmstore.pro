import { useEffect, useState } from 'react';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import { ToolSelector } from './ToolSelector';
import type { ToolDefinition } from '../../lib/api/agents';

interface AgentFormData {
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
}

interface AgentFormProps {
  initialData?: Partial<AgentFormData>;
  tools: ToolDefinition[];
  onSubmit: (data: AgentFormData) => void;
  isSubmitting?: boolean;
  submitLabel?: string;
  actions?: Array<{
    label: string;
    onClick: () => void;
    disabled?: boolean;
    variant?: 'outline' | 'destructive' | 'ghost';
  }>;
}

export function AgentForm({
  initialData,
  tools,
  onSubmit,
  isSubmitting,
  submitLabel = 'Создать',
  actions = [],
}: AgentFormProps) {
  const OPENROUTER_MODELS = [
    { value: 'google/gemini-2.0-flash-001', label: 'Google Gemini 2.0 Flash' },
    { value: 'google/gemini-2.5-flash', label: 'Google Gemini 2.5 Flash' },
    { value: 'openai/gpt-4o-mini', label: 'OpenAI GPT-4o Mini' },
    { value: 'openai/gpt-4o', label: 'OpenAI GPT-4o' },
  ];

  const buildFormState = (source?: Partial<AgentFormData>): AgentFormData => ({
    name: source?.name ?? '',
    description: source?.description ?? '',
    visibility: source?.visibility === 'public' ? 'public' : 'private',
    system_prompt: source?.system_prompt ?? '',
    tool_ids: source?.tool_ids ?? [],
    runtime_config: source?.runtime_config ?? {
      max_iterations: 4,
      temperature: 0.3,
      max_tokens: 4096,
      model_external_id: 'google/gemini-2.0-flash-001',
      chat_intro: '',
      starter_prompts: [],
    },
  });

  const [form, setForm] = useState<AgentFormData>(buildFormState(initialData));
  const [starterPromptsText, setStarterPromptsText] = useState(
    (initialData?.runtime_config?.starter_prompts ?? []).join('\n'),
  );

  useEffect(() => {
    setForm(buildFormState(initialData));
    setStarterPromptsText((initialData?.runtime_config?.starter_prompts ?? []).join('\n'));
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const starter_prompts = starterPromptsText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    onSubmit({
      ...form,
      runtime_config: {
        ...form.runtime_config,
        chat_intro: form.runtime_config.chat_intro?.trim() ?? '',
        starter_prompts,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-1">Название агента</label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Мой агент"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Описание</label>
        <Input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Короткое описание агента"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Видимость</label>
        <select
          value={form.visibility}
          onChange={(e) => setForm({ ...form, visibility: e.target.value as 'public' | 'private' })}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="private">Только админам и владельцу</option>
          <option value="public">Всем пользователям</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">OpenRouter модель</label>
        <select
          value={form.runtime_config.model_external_id ?? 'google/gemini-2.0-flash-001'}
          onChange={(e) =>
            setForm({
              ...form,
              runtime_config: { ...form.runtime_config, model_external_id: e.target.value },
            })
          }
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {OPENROUTER_MODELS.map((model) => (
            <option key={model.value} value={model.value}>
              {model.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Системный промпт</label>
        <Textarea
          value={form.system_prompt}
          onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
          placeholder="Ты — полезный помощник..."
          className="min-h-[150px] font-mono text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Описание в чате</label>
        <Textarea
          value={form.runtime_config.chat_intro ?? ''}
          onChange={(e) =>
            setForm({
              ...form,
              runtime_config: { ...form.runtime_config, chat_intro: e.target.value },
            })
          }
          placeholder="Что умеет агент, что ему писать, и как лучше формулировать запросы"
          className="min-h-[120px]"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Быстрые шаблоны сообщений</label>
        <Textarea
          value={starterPromptsText}
          onChange={(e) => setStarterPromptsText(e.target.value)}
          placeholder={'По одному шаблону на строку\nНапример: Сделай краткий разбор последних новостей'}
          className="min-h-[120px]"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Эти шаблоны будут показаны кнопками в чате с агентом.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Инструменты</label>
        <ToolSelector
          tools={tools}
          selected={form.tool_ids}
          onChange={(tool_ids) => setForm({ ...form, tool_ids })}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Max итераций</label>
          <Input
            type="number"
            min={1}
            max={10}
            value={form.runtime_config.max_iterations}
            onChange={(e) =>
              setForm({
                ...form,
                runtime_config: { ...form.runtime_config, max_iterations: Number(e.target.value) },
              })
            }
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Temperature</label>
          <Input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={form.runtime_config.temperature}
            onChange={(e) =>
              setForm({
                ...form,
                runtime_config: { ...form.runtime_config, temperature: Number(e.target.value) },
              })
            }
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Max tokens</label>
          <Input
            type="number"
            min={256}
            max={16384}
            step={256}
            value={form.runtime_config.max_tokens}
            onChange={(e) =>
              setForm({
                ...form,
                runtime_config: { ...form.runtime_config, max_tokens: Number(e.target.value) },
              })
            }
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isSubmitting || !form.name.trim()}>
          {isSubmitting ? 'Сохранение...' : submitLabel}
        </Button>
        {actions.map((action) => (
          <Button
            key={action.label}
            type="button"
            variant={action.variant ?? 'outline'}
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </form>
  );
}
