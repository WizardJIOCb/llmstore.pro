const MODEL_ALIASES: Record<string, string> = {
  'gemini-2.0-flash-001': 'google/gemini-2.0-flash-001',
  'gemini-2.0-flash-lite-001': 'google/gemini-2.0-flash-lite-001',
  'gemini-2.5-flash-preview': 'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-preview': 'google/gemini-2.5-flash',
  'gemini-2.5-flash': 'google/gemini-2.5-flash',
  'gpt-4o-mini': 'openai/gpt-4o-mini',
  'gpt-4o': 'openai/gpt-4o',
};

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'google/gemini-2.0-flash-001': { input: 0.10, output: 0.40 },
  'google/gemini-2.0-flash-lite-001': { input: 0.075, output: 0.30 },
  'google/gemini-2.5-flash': { input: 0.30, output: 2.50 },
  'google/gemini-2.5-flash-preview': { input: 0.15, output: 0.60 },
  'google/gemini-2.5-pro': { input: 1.25, output: 10.00 },
  'openrouter/free': { input: 0, output: 0 },
  'nvidia/nemotron-3.5-content-safety:free': { input: 0, output: 0 },
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free': { input: 0, output: 0 },
  'google/gemma-4-26b-a4b-it:free': { input: 0, output: 0 },
  'nvidia/nemotron-nano-12b-v2-vl:free': { input: 0, output: 0 },
  'deepseek/deepseek-v4-flash:free': { input: 0, output: 0 },
  'qwen/qwen3-coder:free': { input: 0, output: 0 },
  'openai/gpt-oss-120b:free': { input: 0, output: 0 },
  'openai/gpt-oss-20b:free': { input: 0, output: 0 },
  'meta-llama/llama-3.3-70b-instruct:free': { input: 0, output: 0 },
  'z-ai/glm-5.1': { input: 0, output: 0 },
  'nvidia/nemotron-3-super-120b-a12b:free': { input: 0, output: 0 },
  'nvidia/nemotron-3-nano-30b-a3b:free': { input: 0, output: 0 },
  'openrouter/owl-alpha': { input: 0, output: 0 },
  'minimax/minimax-m2.5:free': { input: 0, output: 0 },
  'baidu/cobuddy:free': { input: 0, output: 0 },
  'moonshotai/kimi-k2.6': { input: 0.75, output: 3.50 },
  'kimi-k2.6': { input: 0.75, output: 3.50 },
  'moonshotai/kimi-k2.5': { input: 0.3827, output: 1.72 },
  'kimi-k2.5': { input: 0.3827, output: 1.72 },
  'openai/gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'openai/gpt-5.4': { input: 2.50, output: 15.00 },
  'gpt-5.4': { input: 2.50, output: 15.00 },
  'openai/gpt-5.4-mini': { input: 0.75, output: 4.50 },
  'gpt-5.4-mini': { input: 0.75, output: 4.50 },
  'openai/gpt-5.5': { input: 5.00, output: 30.00 },
  'gpt-5.5': { input: 5.00, output: 30.00 },
  'openai/gpt-5.5-pro': { input: 30.00, output: 180.00 },
  'gpt-5.5-pro': { input: 30.00, output: 180.00 },
  'openai/gpt-chat-latest': { input: 5.00, output: 30.00 },
  'gpt-chat-latest': { input: 5.00, output: 30.00 },
  'openai/gpt-5.2': { input: 1.75, output: 14.00 },
  'gpt-5.2': { input: 1.75, output: 14.00 },
  'openai/gpt-5.2-codex': { input: 1.75, output: 14.00 },
  'gpt-5.2-codex': { input: 1.75, output: 14.00 },
  'direct/openai/gpt-5.2-codex': { input: 1.75, output: 14.00 },
  'openai/gpt-5.3-codex': { input: 1.75, output: 14.00 },
  'gpt-5.3-codex': { input: 1.75, output: 14.00 },
  'openai/gpt-5.1-codex': { input: 1.25, output: 10.00 },
  'gpt-5.1-codex': { input: 1.25, output: 10.00 },
  'direct/openai/gpt-5.1-codex': { input: 1.25, output: 10.00 },
  'openai/gpt-5.1-codex-max': { input: 1.25, output: 10.00 },
  'gpt-5.1-codex-max': { input: 1.25, output: 10.00 },
  'direct/openai/gpt-5.1-codex-max': { input: 1.25, output: 10.00 },
  'openai/gpt-5-codex': { input: 1.25, output: 10.00 },
  'gpt-5-codex': { input: 1.25, output: 10.00 },
  'direct/openai/gpt-5-codex': { input: 1.25, output: 10.00 },
  'direct/openai/gpt-5.2': { input: 1.75, output: 14.00 },
  'direct/openai/gpt-5-mini': { input: 0.25, output: 2.00 },
  'google/gemini-3.5-flash': { input: 1.50, output: 9.00 },
  'google/gemini-3.1-flash-lite': { input: 0.25, output: 1.50 },
  'direct/gemini/gemini-3.1-pro-preview': { input: 2.00, output: 12.00 },
  'direct/gemini/gemini-3.1-pro-preview-customtools': { input: 2.00, output: 12.00 },
  'direct/gemini/gemini-3.5-flash': { input: 1.50, output: 9.00 },
  'direct/gemini/gemini-3.1-flash-lite': { input: 0.25, output: 1.50 },
  'direct/gemini/gemini-2.5-pro': { input: 1.25, output: 10.00 },
  'direct/gemini/gemini-2.5-flash': { input: 0.30, output: 2.50 },
  'direct/gemini/gemini-flash-latest': { input: 0.30, output: 2.50 },
  'x-ai/grok-4.3': { input: 1.25, output: 2.50 },
  'x-ai/grok-build-0.1': { input: 1.00, output: 2.00 },
  'direct/xai/grok-4.3': { input: 1.25, output: 2.50 },
  'direct/xai/grok-build-0.1': { input: 1.00, output: 2.00 },
  'anthropic/claude-haiku-4.5': { input: 1.00, output: 5.00 },
  'claude-haiku-4.5': { input: 1.00, output: 5.00 },
  'anthropic/claude-sonnet-4.6': { input: 3.00, output: 15.00 },
  'claude-sonnet-4.6': { input: 3.00, output: 15.00 },
  'anthropic/claude-opus-4.6': { input: 5.00, output: 25.00 },
  'claude-opus-4.6': { input: 5.00, output: 25.00 },
  'qwen/qwen3-coder-plus': { input: 0.65, output: 3.25 },
  'qwen3-coder-plus': { input: 0.65, output: 3.25 },
  'qwen/qwen3-coder-flash': { input: 0.195, output: 0.975 },
  'qwen3-coder-flash': { input: 0.195, output: 0.975 },
  'qwen/qwen3-coder-next': { input: 0.12, output: 0.75 },
  'qwen3-coder-next': { input: 0.12, output: 0.75 },
  'mistralai/codestral-2508': { input: 0.30, output: 0.90 },
  'codestral-2508': { input: 0.30, output: 0.90 },
  'google/gemini-2.5-flash-image': { input: 0.30, output: 2.50 },
  'google/gemini-3.1-flash-image-preview': { input: 0.50, output: 3.00 },
  'google/gemini-3-pro-image-preview': { input: 2.00, output: 12.00 },
  'openai/gpt-5-image-mini': { input: 2.50, output: 2.00 },
  'openai/gpt-5-image': { input: 10.00, output: 10.00 },
  'openai/gpt-5.4-image-2': { input: 8.00, output: 15.00 },
};

export const MODEL_LABELS: Record<string, string> = {
  'anthropic/claude-haiku-4.5': 'Claude Haiku 4.5',
  'claude-haiku-4.5': 'Claude Haiku 4.5',
  'anthropic/claude-sonnet-4.6': 'Claude Sonnet 4.6',
  'claude-sonnet-4.6': 'Claude Sonnet 4.6',
  'anthropic/claude-opus-4.6': 'Claude Opus 4.6',
  'claude-opus-4.6': 'Claude Opus 4.6',
  'moonshotai/kimi-k2.6': 'Kimi K2.6',
  'kimi-k2.6': 'Kimi K2.6',
  'moonshotai/kimi-k2.5': 'Kimi K2.5',
  'kimi-k2.5': 'Kimi K2.5',
  'openrouter/free': 'OpenRouter Free Router',
  'nvidia/nemotron-3.5-content-safety:free': 'Nemotron 3.5 Content Safety Free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free': 'Nemotron 3 Nano Omni Free',
  'google/gemma-4-26b-a4b-it:free': 'Gemma 4 26B A4B Free',
  'nvidia/nemotron-nano-12b-v2-vl:free': 'Nemotron Nano 12B 2 VL Free',
  'deepseek/deepseek-v4-flash:free': 'DeepSeek V4 Flash Free',
  'qwen/qwen3-coder:free': 'Qwen3 Coder 480B Free',
  'openai/gpt-oss-120b:free': 'GPT-OSS 120B Free',
  'openai/gpt-oss-20b:free': 'GPT-OSS 20B Free',
  'meta-llama/llama-3.3-70b-instruct:free': 'Llama 3.3 70B Free',
  'z-ai/glm-5.1': 'GLM 5.1 Free',
  'nvidia/nemotron-3-super-120b-a12b:free': 'Nemotron 3 Super Free',
  'nvidia/nemotron-3-nano-30b-a3b:free': 'Nemotron 3 Nano Free',
  'openrouter/owl-alpha': 'Owl Alpha Free',
  'minimax/minimax-m2.5:free': 'MiniMax M2.5 Free',
  'baidu/cobuddy:free': 'CoBuddy Free',
  'openai/gpt-5.4': 'GPT-5.4',
  'gpt-5.4': 'GPT-5.4',
  'openai/gpt-5.4-mini': 'GPT-5.4 Mini',
  'gpt-5.4-mini': 'GPT-5.4 Mini',
  'openai/gpt-5.5': 'GPT-5.5',
  'gpt-5.5': 'GPT-5.5',
  'openai/gpt-5.5-pro': 'GPT-5.5 Pro',
  'gpt-5.5-pro': 'GPT-5.5 Pro',
  'openai/gpt-chat-latest': 'GPT Chat Latest',
  'gpt-chat-latest': 'GPT Chat Latest',
  'openai/gpt-5.2': 'GPT-5.2',
  'gpt-5.2': 'GPT-5.2',
  'openai/gpt-5.2-codex': 'GPT-5.2 Codex',
  'gpt-5.2-codex': 'GPT-5.2 Codex',
  'direct/openai/gpt-5.2-codex': 'GPT-5.2 Codex (OpenAI API)',
  'openai/gpt-5.3-codex': 'GPT-5.3 Codex',
  'gpt-5.3-codex': 'GPT-5.3 Codex',
  'openai/gpt-5.1-codex': 'GPT-5.1 Codex',
  'gpt-5.1-codex': 'GPT-5.1 Codex',
  'direct/openai/gpt-5.1-codex': 'GPT-5.1 Codex (OpenAI API)',
  'openai/gpt-5.1-codex-max': 'GPT-5.1 Codex Max',
  'gpt-5.1-codex-max': 'GPT-5.1 Codex Max',
  'direct/openai/gpt-5.1-codex-max': 'GPT-5.1 Codex Max (OpenAI API)',
  'openai/gpt-5-codex': 'GPT-5 Codex',
  'gpt-5-codex': 'GPT-5 Codex',
  'direct/openai/gpt-5-codex': 'GPT-5 Codex (OpenAI API)',
  'direct/openai/gpt-5.2': 'GPT-5.2 (OpenAI API)',
  'direct/openai/gpt-5-mini': 'GPT-5 Mini (OpenAI API)',
  'google/gemini-3.5-flash': 'Gemini 3.5 Flash',
  'google/gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
  'direct/gemini/gemini-3.1-pro-preview': 'Gemini 3.1 Pro Preview (Gemini API)',
  'direct/gemini/gemini-3.1-pro-preview-customtools': 'Gemini 3.1 Pro Custom Tools (Gemini API)',
  'direct/gemini/gemini-3.5-flash': 'Gemini 3.5 Flash (Gemini API)',
  'direct/gemini/gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite (Gemini API)',
  'direct/gemini/gemini-2.5-pro': 'Gemini 2.5 Pro (Gemini API)',
  'direct/gemini/gemini-2.5-flash': 'Gemini 2.5 Flash (Gemini API)',
  'direct/gemini/gemini-flash-latest': 'Gemini Flash Latest (Gemini API)',
  'x-ai/grok-4.3': 'Grok 4.3',
  'x-ai/grok-build-0.1': 'Grok Build 0.1',
  'direct/xai/grok-4.3': 'Grok 4.3 (xAI API)',
  'direct/xai/grok-build-0.1': 'Grok Build 0.1 (xAI API)',
  'qwen/qwen3-coder-plus': 'Qwen3 Coder Plus',
  'qwen3-coder-plus': 'Qwen3 Coder Plus',
  'qwen/qwen3-coder-flash': 'Qwen3 Coder Flash',
  'qwen3-coder-flash': 'Qwen3 Coder Flash',
  'qwen/qwen3-coder-next': 'Qwen3 Coder Next',
  'qwen3-coder-next': 'Qwen3 Coder Next',
  'mistralai/codestral-2508': 'Codestral 2508',
  'codestral-2508': 'Codestral 2508',
  'google/gemini-2.5-flash-image': 'Gemini 2.5 Flash Image',
  'google/gemini-3.1-flash-image-preview': 'Gemini 3.1 Flash Image Preview',
  'google/gemini-3-pro-image-preview': 'Gemini 3 Pro Image Preview',
  'openai/gpt-5-image-mini': 'GPT-5 Image Mini',
  'openai/gpt-5-image': 'GPT-5 Image',
  'openai/gpt-5.4-image-2': 'GPT-5.4 Image 2',
};

export const CODING_MODEL_IDS = new Set([
  'anthropic/claude-haiku-4.5',
  'claude-haiku-4.5',
  'anthropic/claude-sonnet-4.6',
  'claude-sonnet-4.6',
  'anthropic/claude-opus-4.6',
  'claude-opus-4.6',
  'moonshotai/kimi-k2.6',
  'kimi-k2.6',
  'moonshotai/kimi-k2.5',
  'kimi-k2.5',
  'openai/gpt-5.4',
  'gpt-5.4',
  'openai/gpt-5.4-mini',
  'gpt-5.4-mini',
  'openai/gpt-5.5',
  'gpt-5.5',
  'openai/gpt-5.5-pro',
  'gpt-5.5-pro',
  'openai/gpt-5.2',
  'gpt-5.2',
  'openai/gpt-5.2-codex',
  'gpt-5.2-codex',
  'direct/openai/gpt-5.2-codex',
  'openai/gpt-5.3-codex',
  'gpt-5.3-codex',
  'openai/gpt-5.1-codex',
  'gpt-5.1-codex',
  'direct/openai/gpt-5.1-codex',
  'openai/gpt-5.1-codex-max',
  'gpt-5.1-codex-max',
  'direct/openai/gpt-5.1-codex-max',
  'openai/gpt-5-codex',
  'gpt-5-codex',
  'direct/openai/gpt-5-codex',
  'direct/openai/gpt-5.2',
  'x-ai/grok-build-0.1',
  'direct/xai/grok-build-0.1',
  'qwen/qwen3-coder-plus',
  'qwen3-coder-plus',
  'qwen/qwen3-coder-flash',
  'qwen3-coder-flash',
  'qwen/qwen3-coder-next',
  'qwen3-coder-next',
  'mistralai/codestral-2508',
  'codestral-2508',
]);

export const VISION_MODEL_IDS = new Set([
  'google/gemini-2.0-flash-001',
  'gemini-2.0-flash-001',
  'google/gemini-2.0-flash-lite-001',
  'gemini-2.0-flash-lite-001',
  'google/gemini-2.5-flash',
  'gemini-2.5-flash',
  'google/gemini-2.5-pro',
  'gemini-2.5-pro',
  'nvidia/nemotron-3.5-content-safety:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-nano-12b-v2-vl:free',
  'openai/gpt-4o',
  'gpt-4o',
  'openai/gpt-4o-mini',
  'gpt-4o-mini',
  'openai/gpt-5.5',
  'gpt-5.5',
  'openai/gpt-5.5-pro',
  'gpt-5.5-pro',
  'openai/gpt-chat-latest',
  'gpt-chat-latest',
  'direct/openai/gpt-5.2-codex',
  'direct/openai/gpt-5.1-codex',
  'direct/openai/gpt-5.1-codex-max',
  'direct/openai/gpt-5-codex',
  'direct/openai/gpt-5.2',
  'direct/openai/gpt-5-mini',
  'openai/gpt-5.4',
  'gpt-5.4',
  'openai/gpt-5.4-mini',
  'gpt-5.4-mini',
  'google/gemini-3.5-flash',
  'google/gemini-3.1-flash-lite',
  'direct/gemini/gemini-3.1-pro-preview',
  'direct/gemini/gemini-3.1-pro-preview-customtools',
  'direct/gemini/gemini-3.5-flash',
  'direct/gemini/gemini-3.1-flash-lite',
  'direct/gemini/gemini-2.5-pro',
  'direct/gemini/gemini-2.5-flash',
  'direct/gemini/gemini-flash-latest',
  'x-ai/grok-4.3',
  'x-ai/grok-build-0.1',
  'direct/xai/grok-4.3',
  'direct/xai/grok-build-0.1',
  'anthropic/claude-haiku-4.5',
  'claude-haiku-4.5',
  'anthropic/claude-sonnet-4.6',
  'claude-sonnet-4.6',
  'anthropic/claude-opus-4.6',
  'claude-opus-4.6',
]);

function normalizeRawModelId(modelId?: string | null): string {
  return modelId?.trim().toLowerCase() ?? '';
}

function resolveModelAlias(modelId: string): string {
  if (!modelId) return modelId;

  const exactAlias = MODEL_ALIASES[modelId];
  if (exactAlias) {
    return exactAlias;
  }

  const anthropicVersionFirst = modelId.match(/^anthropic\/claude-(\d+(?:\.\d+)?)-(haiku|sonnet|opus)(?:-[a-z0-9.-]+)?$/);
  if (anthropicVersionFirst) {
    return `anthropic/claude-${anthropicVersionFirst[2]}-${anthropicVersionFirst[1]}`;
  }

  const genericDatedVariants = [
    modelId.replace(/-(20\d{2}-\d{2}-\d{2})$/, ''),
    modelId.replace(/-(20\d{6,})$/, ''),
  ];
  for (const candidate of genericDatedVariants) {
    if (candidate !== modelId && (MODEL_PRICING[candidate] || MODEL_LABELS[candidate] || CODING_MODEL_IDS.has(candidate))) {
      return candidate;
    }
  }

  return modelId;
}

export function normalizeModelLookupKey(modelId?: string | null): string {
  return resolveModelAlias(normalizeRawModelId(modelId));
}

export function normalizeOpenRouterModelId(modelId?: string | null): string {
  return normalizeModelLookupKey(modelId);
}

export function getModelPricingInfo(modelId?: string | null): { input: number; output: number } | null {
  const normalized = normalizeModelLookupKey(modelId);
  return normalized ? (MODEL_PRICING[normalized] ?? null) : null;
}

export function getModelDisplayLabel(modelId?: string | null): string | null {
  const normalized = normalizeModelLookupKey(modelId);
  if (!normalized) return null;
  return MODEL_LABELS[normalized] ?? (modelId?.trim() || null);
}

export function isCodingModel(modelId?: string | null): boolean {
  const normalized = normalizeModelLookupKey(modelId);
  return normalized ? CODING_MODEL_IDS.has(normalized) : false;
}

export function isVisionModel(modelId?: string | null): boolean {
  const normalized = normalizeModelLookupKey(modelId);
  return normalized ? VISION_MODEL_IDS.has(normalized) : false;
}

export function estimateCost(model: string, promptTokens: number, completionTokens: number): string {
  const pricing = getModelPricingInfo(model);
  const selected = pricing ?? { input: 0.10, output: 0.40 };
  const usd = ((promptTokens * selected.input) + (completionTokens * selected.output)) / 1_000_000;
  return usd.toFixed(6);
}
