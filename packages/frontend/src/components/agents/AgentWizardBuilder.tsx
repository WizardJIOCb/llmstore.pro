import { useMemo, useState } from 'react';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import { ToolSelector } from './ToolSelector';
import type { ToolDefinition } from '../../lib/api/agents';

interface AgentWizardSubmitData {
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

interface AgentWizardBuilderProps {
  tools: ToolDefinition[];
  onSubmit: (data: AgentWizardSubmitData) => Promise<void> | void;
  isSubmitting?: boolean;
}

type WizardStep = 1 | 2 | 3 | 4;

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function AgentWizardBuilder({ tools, onSubmit, isSubmitting }: AgentWizardBuilderProps) {
  const [step, setStep] = useState<WizardStep>(1);

  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [purpose, setPurpose] = useState('');
  const [audience, setAudience] = useState('');
  const [persona, setPersona] = useState('');
  const [tasksText, setTasksText] = useState('');
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([]);
  const [tone, setTone] = useState('professional');
  const [rulesText, setRulesText] = useState('');
  const [forbiddenText, setForbiddenText] = useState('');
  const [chatIntro, setChatIntro] = useState('');
  const [starterPromptsText, setStarterPromptsText] = useState('');
  const [modelId, setModelId] = useState('google/gemini-2.0-flash-001');
  const [temperature, setTemperature] = useState(0.3);
  const [maxIterations, setMaxIterations] = useState(4);
  const [maxTokens, setMaxTokens] = useState(4096);

  const tasks = useMemo(() => splitLines(tasksText), [tasksText]);
  const rules = useMemo(() => splitLines(rulesText), [rulesText]);
  const forbidden = useMemo(() => splitLines(forbiddenText), [forbiddenText]);
  const starterPrompts = useMemo(() => splitLines(starterPromptsText), [starterPromptsText]);

  const toneInstruction = useMemo(() => {
    if (tone === 'friendly') return 'Тон: дружелюбный, поддерживающий, простой и понятный.';
    if (tone === 'strict') return 'Тон: деловой и краткий, без лишней воды, с акцентом на точность.';
    if (tone === 'expert') return 'Тон: экспертный, структурированный, с пояснением причин и рисков.';
    return 'Тон: профессиональный, спокойный, понятный.';
  }, [tone]);

  const systemPrompt = useMemo(() => {
    const sections: string[] = [];

    sections.push(`Ты — ${persona || 'AI-агент'}.`);
    if (purpose.trim()) sections.push(`Цель агента: ${purpose.trim()}.`);
    if (audience.trim()) sections.push(`Целевая аудитория: ${audience.trim()}.`);
    sections.push(toneInstruction);

    if (tasks.length > 0) {
      sections.push(`Ключевые задачи:\n${tasks.map((t) => `- ${t}`).join('\n')}`);
    }

    if (rules.length > 0) {
      sections.push(`Правила поведения:\n${rules.map((r) => `- ${r}`).join('\n')}`);
    }

    if (forbidden.length > 0) {
      sections.push(`Ограничения (что нельзя делать):\n${forbidden.map((r) => `- ${r}`).join('\n')}`);
    }

    sections.push('Если запрос неясен, сначала задай уточняющие вопросы.');
    sections.push('Отвечай структурировано: сначала короткий вывод, затем детали и конкретные следующие шаги.');

    return sections.join('\n\n');
  }, [persona, purpose, audience, toneInstruction, tasks, rules, forbidden]);

  const generatedDescription = useMemo(() => {
    const main = purpose.trim() || 'Универсальный помощник';
    const aud = audience.trim();
    return aud ? `${main}. Для: ${aud}` : main;
  }, [purpose, audience]);

  const canNextStep1 = name.trim().length > 0 && purpose.trim().length > 0;
  const canNextStep2 = persona.trim().length > 0 && tasks.length > 0;

  const submit = async () => {
    await onSubmit({
      name: name.trim(),
      description: generatedDescription,
      visibility,
      system_prompt: systemPrompt,
      tool_ids: selectedToolIds,
      runtime_config: {
        model_external_id: modelId,
        temperature,
        max_iterations: maxIterations,
        max_tokens: maxTokens,
        chat_intro: chatIntro.trim(),
        starter_prompts: starterPrompts,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        Шаг {step} из 4
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Основа агента</h2>
          <div>
            <label className="mb-1 block text-sm font-medium">Название агента</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Помощник по маркетингу" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Видимость</label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="private">Приватный</option>
              <option value="public">Публичный</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Какова главная цель агента?</label>
            <Textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Например: помогает анализировать рекламные кампании и предлагать улучшения"
              className="min-h-[100px]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Для кого этот агент?</label>
            <Input
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="Например: для владельцев малого бизнеса"
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Роль и действия</h2>
          <div>
            <label className="mb-1 block text-sm font-medium">Кем агент должен себя считать?</label>
            <Input
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              placeholder="Например: аналитиком продукта и growth-консультантом"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Какие действия он должен выполнять?</label>
            <Textarea
              value={tasksText}
              onChange={(e) => setTasksText(e.target.value)}
              placeholder={'По одному действию на строку\nНапример: Анализировать воронку\nПредлагать гипотезы\nГотовить план экспериментов'}
              className="min-h-[140px]"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Какие инструменты доступны агенту?</label>
            <ToolSelector tools={tools} selected={selectedToolIds} onChange={setSelectedToolIds} />
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Стиль и правила</h2>
          <div>
            <label className="mb-1 block text-sm font-medium">В каком тоне отвечать?</label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="professional">Профессиональный</option>
              <option value="friendly">Дружелюбный</option>
              <option value="expert">Экспертный</option>
              <option value="strict">Строгий и краткий</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Дополнительные правила ответа</label>
            <Textarea
              value={rulesText}
              onChange={(e) => setRulesText(e.target.value)}
              placeholder={'По одному правилу на строку\nНапример: Всегда давай 3 варианта решения'}
              className="min-h-[120px]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Что агенту нельзя делать?</label>
            <Textarea
              value={forbiddenText}
              onChange={(e) => setForbiddenText(e.target.value)}
              placeholder={'По одному ограничению на строку\nНапример: Не придумывать факты'}
              className="min-h-[100px]"
            />
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Финальные настройки</h2>
          <div>
            <label className="mb-1 block text-sm font-medium">Описание в чате</label>
            <Textarea
              value={chatIntro}
              onChange={(e) => setChatIntro(e.target.value)}
              placeholder="Коротко объясните пользователю, с чем агент помогает"
              className="min-h-[100px]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Быстрые шаблоны сообщений</label>
            <Textarea
              value={starterPromptsText}
              onChange={(e) => setStarterPromptsText(e.target.value)}
              placeholder={'По одному шаблону на строку\nНапример: Помоги составить план запуска'}
              className="min-h-[100px]"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Модель</label>
              <select
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="google/gemini-2.0-flash-001">Google Gemini 2.0 Flash</option>
                <option value="google/gemini-2.5-flash">Google Gemini 2.5 Flash</option>
                <option value="openai/gpt-4o-mini">OpenAI GPT-4o Mini</option>
                <option value="openai/gpt-4o">OpenAI GPT-4o</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Temperature</label>
              <Input type="number" min={0} max={2} step={0.1} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Max iterations</label>
              <Input type="number" min={1} max={10} value={maxIterations} onChange={(e) => setMaxIterations(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Max tokens</label>
            <Input type="number" min={256} max={16384} step={256} value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Предпросмотр системного промпта</label>
            <Textarea value={systemPrompt} readOnly className="min-h-[220px] font-mono text-sm" />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {step > 1 && (
          <Button type="button" variant="outline" onClick={() => setStep((step - 1) as WizardStep)}>
            Назад
          </Button>
        )}
        {step < 4 && (
          <Button
            type="button"
            onClick={() => setStep((step + 1) as WizardStep)}
            disabled={(step === 1 && !canNextStep1) || (step === 2 && !canNextStep2)}
          >
            Далее
          </Button>
        )}
        {step === 4 && (
          <Button type="button" onClick={submit} disabled={isSubmitting || !name.trim()}>
            {isSubmitting ? 'Создание...' : 'Создать и открыть'}
          </Button>
        )}
      </div>
    </div>
  );
}
