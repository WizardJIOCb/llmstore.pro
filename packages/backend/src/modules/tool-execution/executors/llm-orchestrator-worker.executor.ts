import { AppError } from '../../../middleware/error-handler.js';
import { estimateCost, normalizeOpenRouterModelId } from '../../../lib/model-pricing.js';
import { openRouterClient } from '../../openrouter/index.js';
import type { ToolExecutionResult } from '../types.js';

type WorkerRole = 'frontend' | 'backend' | 'fullstack' | 'analysis' | 'content' | 'review' | 'general';

const DEFAULT_ALLOWED_MODELS = [
  'anthropic/claude-sonnet-4.6',
  'openai/gpt-5.4',
  'openai/gpt-5.4-mini',
  'openai/gpt-5.3-codex',
  'qwen/qwen3-coder-plus',
  'google/gemini-2.5-pro',
  'moonshotai/kimi-k2.5',
] as const;

const DEFAULT_MODELS_BY_ROLE: Record<WorkerRole, string> = {
  frontend: 'anthropic/claude-sonnet-4.6',
  backend: 'qwen/qwen3-coder-plus',
  fullstack: 'openai/gpt-5.4',
  analysis: 'moonshotai/kimi-k2.5',
  content: 'anthropic/claude-sonnet-4.6',
  review: 'openai/gpt-5.3-codex',
  general: 'openai/gpt-5.4-mini',
};

const WORKER_ROLE_GUIDANCE: Record<WorkerRole, string> = {
  frontend: 'Сфокусируйся на UI, UX, layout, компонентах, адаптивности, preview и фронтенд-архитектуре.',
  backend: 'Сфокусируйся на API, моделях данных, бизнес-логике, интеграциях, безопасности и backend-архитектуре.',
  fullstack: 'Сфокусируйся на связке frontend/backend/data, контрактах между слоями и runnable project structure.',
  analysis: 'Сфокусируйся на глубокой аналитике, синтезе большого материала, выделении инсайтов, рисков и приоритетов.',
  content: 'Сфокусируйся на текстах, структуре лендинга, позиционировании, CTA, storytelling и контентной логике.',
  review: 'Сфокусируйся на проверке решений, поиске рисков, недочётов, regressions и missing cases.',
  general: 'Сфокусируйся на точечной подзадаче и выдай максимально полезный для оркестратора результат.',
};

function normalizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function parseWorkerRole(value: unknown): WorkerRole {
  if (typeof value !== 'string') return 'general';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'frontend') return 'frontend';
  if (normalized === 'backend') return 'backend';
  if (normalized === 'fullstack') return 'fullstack';
  if (normalized === 'analysis') return 'analysis';
  if (normalized === 'content') return 'content';
  if (normalized === 'review') return 'review';
  return 'general';
}

function normalizeModelId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? (normalizeOpenRouterModelId(value) ?? null) : null;
}

function normalizeAllowedModels(config?: Record<string, unknown>): string[] {
  const configModels = Array.isArray(config?.allowed_models)
    ? config.allowed_models.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const models = configModels.length > 0 ? configModels.map((item) => item.trim()) : [...DEFAULT_ALLOWED_MODELS];
  return models
    .map((item) => normalizeOpenRouterModelId(item) ?? item.trim())
    .filter((item, index, arr) => arr.indexOf(item) === index);
}

function resolveDefaultModelForRole(role: WorkerRole, config?: Record<string, unknown>): string {
  const raw = config?.default_models_by_role;
  if (raw && typeof raw === 'object') {
    const candidate = (raw as Record<string, unknown>)[role];
    const normalized = normalizeModelId(candidate);
    if (normalized) return normalized;
  }
  return normalizeOpenRouterModelId(DEFAULT_MODELS_BY_ROLE[role]) ?? DEFAULT_MODELS_BY_ROLE[role];
}

function extractAssistantText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!content || !Array.isArray(content)) return '';
  return content
    .map((part) => (
      part && typeof part === 'object' && 'text' in part && typeof part.text === 'string'
        ? part.text
        : ''
    ))
    .filter(Boolean)
    .join('\n')
    .trim();
}

export async function executeLlmOrchestratorWorker(
  input: Record<string, unknown>,
  config?: Record<string, unknown>,
): Promise<{ payload: Record<string, unknown>; usage?: ToolExecutionResult['usage'] }> {
  const task = normalizeText(input.task, 16_000);
  if (!task) {
    throw new AppError(400, 'INVALID_TOOL_INPUT', 'Поле task обязательно для llm-orchestrator-worker');
  }

  const workerRole = parseWorkerRole(input.worker_role);
  const context = normalizeText(input.context, 20_000);
  const constraints = normalizeText(input.constraints, 8_000);
  const expectedOutput = normalizeText(input.expected_output, 4_000);
  const preferredModel = normalizeModelId(input.preferred_model);
  const allowedModels = normalizeAllowedModels(config);
  const selectedModel = preferredModel ?? resolveDefaultModelForRole(workerRole, config);

  if (!allowedModels.includes(selectedModel)) {
    throw new AppError(
      400,
      'MODEL_NOT_ALLOWED',
      `Модель ${selectedModel} не разрешена для llm-orchestrator-worker`,
    );
  }

  const maxTokens = Number.isFinite(Number(config?.max_tokens)) ? Math.max(512, Math.min(12_288, Number(config?.max_tokens))) : 4096;
  const temperature = Number.isFinite(Number(config?.temperature)) ? Math.max(0, Math.min(1, Number(config?.temperature))) : 0.2;
  const timeoutMs = Number.isFinite(Number(config?.timeout_ms)) ? Math.max(10_000, Math.min(180_000, Number(config?.timeout_ms))) : 90_000;

  const systemPrompt = [
    'Ты — специализированный worker inside orchestration runtime для llmstore.pro.',
    'Ты решаешь только переданную подзадачу и отвечаешь так, чтобы другой LLM-оркестратор мог использовать результат как рабочий артефакт.',
    'Отвечай на русском языке.',
    'Не пиши приветствий, воды и метакомментариев.',
    'Не утверждай, что вносил изменения в реальный репозиторий, если ты только предлагаешь решение.',
    WORKER_ROLE_GUIDANCE[workerRole],
    'Верни компактный, но конкретный результат: сначала краткий вывод, затем рабочие детали, затем риски или следующий шаг, если это уместно.',
  ].join('\n');

  const userPrompt = [
    `Роль worker: ${workerRole}`,
    `Подзадача:\n${task}`,
    context ? `Контекст:\n${context}` : null,
    constraints ? `Ограничения:\n${constraints}` : null,
    expectedOutput ? `Ожидаемый формат результата:\n${expectedOutput}` : null,
    'Сделай результат пригодным для прямого использования оркестратором.',
  ].filter(Boolean).join('\n\n');

  const response = await openRouterClient.chatCompletion({
    model: selectedModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
    max_tokens: maxTokens,
  }, {
    timeoutMs,
  });

  const choice = response.choices?.[0];
  if (!choice) {
    throw new AppError(502, 'EMPTY_RESPONSE', 'Worker model returned no choices');
  }

  const workerModel = typeof response.model === 'string' && response.model.trim()
    ? (normalizeOpenRouterModelId(response.model) ?? response.model.trim())
    : selectedModel;
  const resultText = extractAssistantText(choice.message.content);

  const usage = response.usage
    ? {
      provider: 'openrouter' as const,
      provider_name: 'openrouter',
      model_external_id: workerModel,
      prompt_tokens: response.usage.prompt_tokens,
      completion_tokens: response.usage.completion_tokens,
      total_tokens: response.usage.total_tokens,
      estimated_cost: estimateCost(workerModel, response.usage.prompt_tokens, response.usage.completion_tokens),
      raw_usage_json: {
        model: workerModel,
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens,
        source: 'llm-orchestrator-worker',
        worker_role: workerRole,
      },
    }
    : undefined;

  return {
    payload: {
      worker_role: workerRole,
      worker_model: workerModel,
      requested_model: selectedModel,
      task,
      result: resultText,
      usage,
    },
    usage,
  };
}
