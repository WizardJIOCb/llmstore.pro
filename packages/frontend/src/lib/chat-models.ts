export interface GeneralModelOption {
  value: string;
  label: string;
  description: string;
  pricing_input_usd_per_million: number;
  pricing_output_usd_per_million: number;
}

export const GENERAL_CHAT_MODELS: GeneralModelOption[] = [
  {
    value: 'openai/gpt-4o-mini',
    label: 'GPT-4o Mini',
    description: 'Лучший бюджетный дефолт для повседневного общения, быстрых ответов и недорогих диалогов.',
    pricing_input_usd_per_million: 0.15,
    pricing_output_usd_per_million: 0.60,
  },
  {
    value: 'google/gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    description: 'Быстрый reasoning-вариант с большим контекстом, когда нужен баланс цены и “умности”.',
    pricing_input_usd_per_million: 0.30,
    pricing_output_usd_per_million: 2.50,
  },
  {
    value: 'openai/gpt-5.4-mini',
    label: 'GPT-5.4 Mini',
    description: 'Сильный modern-balanced вариант для чатов, где хочется лучшее качество без premium-цены.',
    pricing_input_usd_per_million: 0.75,
    pricing_output_usd_per_million: 4.50,
  },
  {
    value: 'anthropic/claude-haiku-4.5',
    label: 'Claude Haiku 4.5',
    description: 'Очень приятная быстрая модель для живого стиля ответа, summaries и частых коротких запросов.',
    pricing_input_usd_per_million: 1.00,
    pricing_output_usd_per_million: 5.00,
  },
  {
    value: 'google/gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    description: 'Сильный вариант для длинного контекста, сложного reasoning и вдумчивых ответов.',
    pricing_input_usd_per_million: 1.25,
    pricing_output_usd_per_million: 10.00,
  },
  {
    value: 'openai/gpt-4o',
    label: 'GPT-4o',
    description: 'Стабильный premium-класс для качественного мультимодального общения и общего использования.',
    pricing_input_usd_per_million: 2.50,
    pricing_output_usd_per_million: 10.00,
  },
  {
    value: 'openai/gpt-5.4',
    label: 'GPT-5.4',
    description: 'Флагманский general-purpose вариант, когда нужен максимально сильный обычный чат.',
    pricing_input_usd_per_million: 2.50,
    pricing_output_usd_per_million: 15.00,
  },
  {
    value: 'anthropic/claude-sonnet-4.6',
    label: 'Claude Sonnet 4.6',
    description: 'Очень сильный quality-first вариант для содержательных ответов, письма и сложных обсуждений.',
    pricing_input_usd_per_million: 3.00,
    pricing_output_usd_per_million: 15.00,
  },
];
