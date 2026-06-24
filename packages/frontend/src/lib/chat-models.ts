export interface GeneralModelOption {
  value: string;
  label: string;
  description: string;
  context_window_tokens: number;
  pricing_input_usd_per_million: number;
  pricing_output_usd_per_million: number;
  supports_reasoning?: boolean;
}

export const GENERAL_CHAT_MODELS: GeneralModelOption[] = [
  {
    value: 'openai/gpt-4o-mini',
    label: 'GPT-4o Mini',
    description: 'Лучший бюджетный дефолт для повседневного общения, быстрых ответов и недорогих диалогов.',
    context_window_tokens: 128_000,
    pricing_input_usd_per_million: 0.15,
    pricing_output_usd_per_million: 0.60,
  },
  {
    value: 'google/gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    description: 'Быстрый reasoning-вариант с большим контекстом, когда нужен баланс цены и “умности”.',
    context_window_tokens: 1_048_576,
    pricing_input_usd_per_million: 0.30,
    pricing_output_usd_per_million: 2.50,
  },
  {
    value: 'openrouter/free',
    label: 'OpenRouter Free Router',
    description: 'Автоматический бесплатный роутер OpenRouter: удобный выбор, когда важнее нулевая цена, чем конкретная модель.',
    context_window_tokens: 200_000,
    pricing_input_usd_per_million: 0,
    pricing_output_usd_per_million: 0,
  },
  {
    value: 'google/gemma-4-26b-a4b-it:free',
    label: 'Gemma 4 26B Vision Free',
    description: 'Free OpenRouter multimodal model for image, text and video inputs with structured answers.',
    context_window_tokens: 262_144,
    pricing_input_usd_per_million: 0,
    pricing_output_usd_per_million: 0,
  },
  {
    value: 'nvidia/nemotron-nano-12b-v2-vl:free',
    label: 'Nemotron Nano 12B VL Free',
    description: 'Free OpenRouter vision-language model for OCR, charts, documents and multi-image analysis.',
    context_window_tokens: 128_000,
    pricing_input_usd_per_million: 0,
    pricing_output_usd_per_million: 0,
  },
  {
    value: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    label: 'Nemotron 3 Nano Omni Free',
    description: 'Free OpenRouter omni model for image, video, audio and text inputs with reasoning-style answers.',
    context_window_tokens: 256_000,
    pricing_input_usd_per_million: 0,
    pricing_output_usd_per_million: 0,
  },
  {
    value: 'nvidia/nemotron-3.5-content-safety:free',
    label: 'Nemotron 3.5 Safety Vision Free',
    description: 'Free OpenRouter image-capable model focused on content-safety checks and visual moderation.',
    context_window_tokens: 128_000,
    pricing_input_usd_per_million: 0,
    pricing_output_usd_per_million: 0,
  },
  {
    value: 'deepseek/deepseek-v4-flash:free',
    label: 'DeepSeek V4 Flash Free',
    description: 'Бесплатный быстрый вариант с очень большим контекстом для обычных чатов, анализа и длинных обсуждений.',
    context_window_tokens: 1_048_576,
    pricing_input_usd_per_million: 0,
    pricing_output_usd_per_million: 0,
  },
  {
    value: 'qwen/qwen3-coder:free',
    label: 'Qwen3 Coder 480B Free',
    description: 'Сильная бесплатная coding-friendly модель для вопросов по коду, архитектуре, отладке и технических диалогов.',
    context_window_tokens: 1_048_576,
    pricing_input_usd_per_million: 0,
    pricing_output_usd_per_million: 0,
  },
  {
    value: 'openai/gpt-oss-120b:free',
    label: 'GPT-OSS 120B Free',
    description: 'Большая бесплатная open-weight модель OpenAI для reasoning, текстовых задач и вдумчивых ответов.',
    context_window_tokens: 131_072,
    pricing_input_usd_per_million: 0,
    pricing_output_usd_per_million: 0,
  },
  {
    value: 'meta-llama/llama-3.3-70b-instruct:free',
    label: 'Llama 3.3 70B Free',
    description: 'Надёжная бесплатная instruct-модель для повседневного общения, идей, черновиков и объяснений.',
    context_window_tokens: 131_072,
    pricing_input_usd_per_million: 0,
    pricing_output_usd_per_million: 0,
  },
  {
    value: 'z-ai/glm-5.1',
    label: 'GLM 5.1 Free',
    description: 'Бесплатный сильный универсальный чат с большим контекстом, reasoning-параметрами и поддержкой инструментов.',
    context_window_tokens: 202_800,
    pricing_input_usd_per_million: 0,
    pricing_output_usd_per_million: 0,
  },
  {
    value: 'nvidia/nemotron-3-super-120b-a12b:free',
    label: 'Nemotron 3 Super Free',
    description: 'Бесплатная крупная модель NVIDIA для сложных вопросов, структурированных ответов и длинного контекста.',
    context_window_tokens: 1_000_000,
    pricing_input_usd_per_million: 0,
    pricing_output_usd_per_million: 0,
  },
  {
    value: 'openrouter/owl-alpha',
    label: 'Owl Alpha Free',
    description: 'Бесплатная long-context модель OpenRouter для агентных сценариев, структурированных ответов и tool-use задач.',
    context_window_tokens: 1_048_756,
    pricing_input_usd_per_million: 0,
    pricing_output_usd_per_million: 0,
  },
  {
    value: 'minimax/minimax-m2.5:free',
    label: 'MiniMax M2.5 Free',
    description: 'Бесплатная быстрая модель для лёгких чатов, коротких ответов, идей и повседневных запросов.',
    context_window_tokens: 204_800,
    pricing_input_usd_per_million: 0,
    pricing_output_usd_per_million: 0,
  },
  {
    value: 'openai/gpt-5.4-mini',
    label: 'GPT-5.4 Mini',
    description: 'Сильный modern-balanced вариант для чатов, где хочется лучшее качество без premium-цены.',
    context_window_tokens: 400_000,
    pricing_input_usd_per_million: 0.75,
    pricing_output_usd_per_million: 4.50,
    supports_reasoning: true,
  },
  {
    value: 'openai/gpt-5.5',
    label: 'GPT-5.5',
    description: 'Флагманская GPT-модель OpenAI через OpenRouter для сложных чатов, анализа, кода и длинного контекста.',
    context_window_tokens: 1_050_000,
    pricing_input_usd_per_million: 5.00,
    pricing_output_usd_per_million: 30.00,
    supports_reasoning: true,
  },
  {
    value: 'openai/gpt-5.5-pro',
    label: 'GPT-5.5 Pro',
    description: 'Премиальный GPT-вариант OpenAI для самых сложных задач, когда важнее максимум качества, чем цена.',
    context_window_tokens: 1_050_000,
    pricing_input_usd_per_million: 30.00,
    pricing_output_usd_per_million: 180.00,
    supports_reasoning: true,
  },
  {
    value: 'openai/gpt-5.3-codex',
    label: 'GPT-5.3 Codex',
    description: 'Сильная Codex-модель для кода, проектов, агентной разработки и правок файлов через OpenRouter.',
    context_window_tokens: 400_000,
    pricing_input_usd_per_million: 1.75,
    pricing_output_usd_per_million: 14.00,
    supports_reasoning: true,
  },
  {
    value: 'openai/gpt-5.2-codex',
    label: 'GPT-5.2 Codex',
    description: 'Codex-модель OpenAI для разработки, ревью и многошаговых технических задач.',
    context_window_tokens: 400_000,
    pricing_input_usd_per_million: 1.75,
    pricing_output_usd_per_million: 14.00,
    supports_reasoning: true,
  },
  {
    value: 'openai/gpt-5.1-codex-max',
    label: 'GPT-5.1 Codex Max',
    description: 'Codex Max для сложных инженерных задач, лендингов и проектов с несколькими файлами.',
    context_window_tokens: 400_000,
    pricing_input_usd_per_million: 1.25,
    pricing_output_usd_per_million: 10.00,
    supports_reasoning: true,
  },
  {
    value: 'direct/openai/gpt-5.2-codex',
    label: 'GPT-5.2 Codex - OpenAI API',
    description: 'Direct server-side OpenAI API via OPENAI_API_KEY. Coding and agentic engineering model, no OpenRouter routing.',
    context_window_tokens: 400_000,
    pricing_input_usd_per_million: 1.75,
    pricing_output_usd_per_million: 14.00,
    supports_reasoning: true,
  },
  {
    value: 'direct/openai/gpt-5.1-codex',
    label: 'GPT-5.1 Codex - OpenAI API',
    description: 'Direct server-side OpenAI API via OPENAI_API_KEY. Stable Codex model for code review, planning and edits.',
    context_window_tokens: 400_000,
    pricing_input_usd_per_million: 1.25,
    pricing_output_usd_per_million: 10.00,
    supports_reasoning: true,
  },
  {
    value: 'direct/openai/gpt-5.1-codex-max',
    label: 'GPT-5.1 Codex Max - OpenAI API',
    description: 'Direct server-side OpenAI API via OPENAI_API_KEY. Longer-running Codex option for harder engineering tasks.',
    context_window_tokens: 400_000,
    pricing_input_usd_per_million: 1.25,
    pricing_output_usd_per_million: 10.00,
    supports_reasoning: true,
  },
  {
    value: 'direct/openai/gpt-5-codex',
    label: 'GPT-5 Codex - OpenAI API',
    description: 'Direct server-side OpenAI API via OPENAI_API_KEY. Codex family model for agentic coding workflows.',
    context_window_tokens: 400_000,
    pricing_input_usd_per_million: 1.25,
    pricing_output_usd_per_million: 10.00,
    supports_reasoning: true,
  },
  {
    value: 'direct/openai/gpt-5.2',
    label: 'GPT-5.2 - OpenAI API',
    description: 'Direct server-side OpenAI API via OPENAI_API_KEY. General frontier model useful for coding and reasoning.',
    context_window_tokens: 400_000,
    pricing_input_usd_per_million: 1.75,
    pricing_output_usd_per_million: 14.00,
    supports_reasoning: true,
  },
  {
    value: 'direct/openai/gpt-5-mini',
    label: 'GPT-5 Mini - OpenAI API',
    description: 'Direct server-side OpenAI API via OPENAI_API_KEY. Faster and cheaper OpenAI option for simpler chat tasks.',
    context_window_tokens: 400_000,
    pricing_input_usd_per_million: 0.25,
    pricing_output_usd_per_million: 2.00,
    supports_reasoning: true,
  },
  {
    value: 'openai/gpt-chat-latest',
    label: 'GPT Chat Latest',
    description: 'OpenAI alias на актуальную стабильную chat-модель, близкую к обычному ChatGPT-опыту.',
    context_window_tokens: 400_000,
    pricing_input_usd_per_million: 5.00,
    pricing_output_usd_per_million: 30.00,
  },
  {
    value: 'google/gemini-3.5-flash',
    label: 'Gemini 3.5 Flash',
    description: 'Новая быстрая мультимодальная модель с большим контекстом и сильным coding/reasoning профилем.',
    context_window_tokens: 1_048_576,
    pricing_input_usd_per_million: 1.50,
    pricing_output_usd_per_million: 9.00,
    supports_reasoning: true,
  },
  {
    value: 'google/gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    description: 'Дешёвая и быстрая мультимодальная модель для повседневных чатов, изображений и документов.',
    context_window_tokens: 1_048_576,
    pricing_input_usd_per_million: 0.25,
    pricing_output_usd_per_million: 1.50,
    supports_reasoning: true,
  },
  {
    value: 'direct/gemini/gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro Preview - Gemini API',
    description: 'Direct server-side Google Gemini API via GEMINI_API_KEY or GOOGLE_API_KEY. Advanced reasoning and agentic coding model.',
    context_window_tokens: 1_048_576,
    pricing_input_usd_per_million: 2.00,
    pricing_output_usd_per_million: 12.00,
    supports_reasoning: true,
  },
  {
    value: 'direct/gemini/gemini-3.1-pro-preview-customtools',
    label: 'Gemini 3.1 Pro Custom Tools - Gemini API',
    description: 'Direct server-side Google Gemini API via GEMINI_API_KEY or GOOGLE_API_KEY. Pro variant tuned to prefer custom tools.',
    context_window_tokens: 1_048_576,
    pricing_input_usd_per_million: 2.00,
    pricing_output_usd_per_million: 12.00,
    supports_reasoning: true,
  },
  {
    value: 'direct/gemini/gemini-3.5-flash',
    label: 'Gemini 3.5 Flash - Gemini API',
    description: 'Direct server-side Google Gemini API via GEMINI_API_KEY or GOOGLE_API_KEY. Fast Gemini 3-series coding and reasoning model.',
    context_window_tokens: 1_048_576,
    pricing_input_usd_per_million: 1.50,
    pricing_output_usd_per_million: 9.00,
    supports_reasoning: true,
  },
  {
    value: 'direct/gemini/gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite - Gemini API',
    description: 'Direct server-side Google Gemini API via GEMINI_API_KEY or GOOGLE_API_KEY. Low-cost Gemini 3-series chat option.',
    context_window_tokens: 1_048_576,
    pricing_input_usd_per_million: 0.25,
    pricing_output_usd_per_million: 1.50,
    supports_reasoning: true,
  },
  {
    value: 'direct/gemini/gemini-2.5-pro',
    label: 'Gemini 2.5 Pro - Gemini API',
    description: 'Direct server-side Google Gemini API via GEMINI_API_KEY or GOOGLE_API_KEY. Deep reasoning and long-context work.',
    context_window_tokens: 1_048_576,
    pricing_input_usd_per_million: 1.25,
    pricing_output_usd_per_million: 10.00,
    supports_reasoning: true,
  },
  {
    value: 'direct/gemini/gemini-2.5-flash',
    label: 'Gemini 2.5 Flash - Gemini API',
    description: 'Direct server-side Google Gemini API via GEMINI_API_KEY or GOOGLE_API_KEY. Fast balanced chat model.',
    context_window_tokens: 1_048_576,
    pricing_input_usd_per_million: 0.30,
    pricing_output_usd_per_million: 2.50,
    supports_reasoning: true,
  },
  {
    value: 'direct/gemini/gemini-flash-latest',
    label: 'Gemini Flash Latest - Gemini API',
    description: 'Direct server-side Google Gemini API via GEMINI_API_KEY or GOOGLE_API_KEY. Alias for the current Flash model.',
    context_window_tokens: 1_048_576,
    pricing_input_usd_per_million: 0.30,
    pricing_output_usd_per_million: 2.50,
    supports_reasoning: true,
  },
  {
    value: 'x-ai/grok-4.3',
    label: 'Grok 4.3',
    description: 'Сильная multimodal/reasoning модель xAI с большим контекстом для агентных и аналитических задач.',
    context_window_tokens: 1_000_000,
    pricing_input_usd_per_million: 1.25,
    pricing_output_usd_per_million: 2.50,
    supports_reasoning: true,
  },
  {
    value: 'x-ai/grok-build-0.1',
    label: 'Grok Build 0.1',
    description: 'Модель xAI для агентной разработки и кодинга, полезна для проектов и многофайловых задач.',
    context_window_tokens: 256_000,
    pricing_input_usd_per_million: 1.00,
    pricing_output_usd_per_million: 2.00,
    supports_reasoning: true,
  },
  {
    value: 'direct/xai/grok-4.3',
    label: 'Grok 4.3 - xAI API',
    description: 'Direct server-side xAI API via XAI_API_KEY. General Grok model without OpenRouter routing.',
    context_window_tokens: 1_000_000,
    pricing_input_usd_per_million: 1.25,
    pricing_output_usd_per_million: 2.50,
    supports_reasoning: true,
  },
  {
    value: 'direct/xai/grok-build-0.1',
    label: 'Grok Build 0.1 - xAI API',
    description: 'Direct server-side xAI API via XAI_API_KEY. Coding-focused Grok Build model without local CLI.',
    context_window_tokens: 256_000,
    pricing_input_usd_per_million: 1.00,
    pricing_output_usd_per_million: 2.00,
    supports_reasoning: true,
  },
  {
    value: 'anthropic/claude-haiku-4.5',
    label: 'Claude Haiku 4.5',
    description: 'Очень приятная быстрая модель для живого стиля ответа, summaries и частых коротких запросов.',
    context_window_tokens: 200_000,
    pricing_input_usd_per_million: 1.00,
    pricing_output_usd_per_million: 5.00,
  },
  {
    value: 'google/gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    description: 'Сильный вариант для длинного контекста, сложного reasoning и вдумчивых ответов.',
    context_window_tokens: 1_048_576,
    pricing_input_usd_per_million: 1.25,
    pricing_output_usd_per_million: 10.00,
  },
  {
    value: 'moonshotai/kimi-k2.6',
    label: 'Kimi K2.6',
    description: 'Новая creative-coding модель Moonshot AI для длинного контекста, UI/UX генерации, агентных задач и сложных лендингов с полноценным HTML preview.',
    context_window_tokens: 262_144,
    pricing_input_usd_per_million: 0.75,
    pricing_output_usd_per_million: 3.50,
  },
  {
    value: 'moonshotai/kimi-k2.5',
    label: 'Kimi K2.5',
    description: 'Сильный long-context и orchestration-first вариант для больших аналитических задач, planning-heavy запросов и fullstack-разработки.',
    context_window_tokens: 262_144,
    pricing_input_usd_per_million: 0.3827,
    pricing_output_usd_per_million: 1.72,
  },
  {
    value: 'openai/gpt-4o',
    label: 'GPT-4o',
    description: 'Стабильный premium-класс для качественного мультимодального общения и общего использования.',
    context_window_tokens: 128_000,
    pricing_input_usd_per_million: 2.50,
    pricing_output_usd_per_million: 10.00,
  },
  {
    value: 'openai/gpt-5.4',
    label: 'GPT-5.4',
    description: 'Флагманский general-purpose вариант, когда нужен максимально сильный обычный чат.',
    context_window_tokens: 1_050_000,
    pricing_input_usd_per_million: 2.50,
    pricing_output_usd_per_million: 15.00,
  },
  {
    value: 'anthropic/claude-sonnet-4.6',
    label: 'Claude Sonnet 4.6',
    description: 'Очень сильный quality-first вариант для содержательных ответов, письма и сложных обсуждений.',
    context_window_tokens: 1_000_000,
    pricing_input_usd_per_million: 3.00,
    pricing_output_usd_per_million: 15.00,
  },
];

export const MIN_CONTEXT_WINDOW_TOKENS = 8_192;
export const DEFAULT_UNKNOWN_CONTEXT_WINDOW_TOKENS = 128_000;
export const MAX_UNKNOWN_CONTEXT_WINDOW_TOKENS = 2_000_000;

const GENERAL_CHAT_MODELS_BY_ID = new Map(
  GENERAL_CHAT_MODELS.map((model) => [model.value.toLowerCase(), model]),
);

export function formatContextWindow(tokens: number): string {
  if (tokens >= 950_000 && tokens < 1_100_000) {
    return '1M';
  }

  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    return `${Number.isInteger(millions) ? millions.toFixed(0) : millions.toFixed(1).replace(/0+$/, '').replace(/\.$/, '')}M`;
  }

  if (tokens >= 1_000) {
    const thousands = tokens / 1_000;
    return `${Number.isInteger(thousands) ? thousands.toFixed(0) : thousands.toFixed(0)}K`;
  }

  return tokens.toLocaleString('ru-RU');
}

export function getGeneralModelOption(modelId: string | null | undefined): GeneralModelOption | null {
  const normalized = modelId?.trim().toLowerCase();
  if (!normalized) return null;
  return GENERAL_CHAT_MODELS_BY_ID.get(normalized) ?? null;
}

export function getGeneralModelContextWindow(modelId: string | null | undefined): number | null {
  return getGeneralModelOption(modelId)?.context_window_tokens ?? null;
}

export function generalModelSupportsReasoning(modelId: string | null | undefined): boolean {
  return Boolean(getGeneralModelOption(modelId)?.supports_reasoning);
}

export function getContextWindowBounds(modelId: string | null | undefined): {
  min: number;
  max: number;
  recommended: number | null;
} {
  const recommended = getGeneralModelContextWindow(modelId);
  if (!recommended) {
    return {
      min: MIN_CONTEXT_WINDOW_TOKENS,
      max: MAX_UNKNOWN_CONTEXT_WINDOW_TOKENS,
      recommended: null,
    };
  }

  return {
    min: Math.min(MIN_CONTEXT_WINDOW_TOKENS, recommended),
    max: Math.max(MIN_CONTEXT_WINDOW_TOKENS, recommended),
    recommended,
  };
}
