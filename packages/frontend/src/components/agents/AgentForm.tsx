import { useState } from 'react';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import { ToolSelector } from './ToolSelector';
import type { ToolDefinition } from '../../lib/api/agents';

interface AgentFormData {
  name: string;
  description: string;
  system_prompt: string;
  tool_ids: string[];
  runtime_config: {
    max_iterations: number;
    temperature: number;
    max_tokens: number;
  };
}

interface AgentFormProps {
  initialData?: Partial<AgentFormData>;
  tools: ToolDefinition[];
  onSubmit: (data: AgentFormData) => void;
  isSubmitting?: boolean;
  submitLabel?: string;
}

export function AgentForm({ initialData, tools, onSubmit, isSubmitting, submitLabel = 'Создать' }: AgentFormProps) {
  const [form, setForm] = useState<AgentFormData>({
    name: initialData?.name ?? '',
    description: initialData?.description ?? '',
    system_prompt: initialData?.system_prompt ?? '',
    tool_ids: initialData?.tool_ids ?? [],
    runtime_config: initialData?.runtime_config ?? {
      max_iterations: 4,
      temperature: 0.3,
      max_tokens: 4096,
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
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
          placeholder="Краткое описание агента"
        />
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

      <Button type="submit" disabled={isSubmitting || !form.name}>
        {isSubmitting ? 'Сохранение...' : submitLabel}
      </Button>
    </form>
  );
}
