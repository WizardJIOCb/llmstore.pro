import type {
  ContentType, PricingType, DeploymentType, PrivacyType,
  LanguageSupport, Difficulty, Readiness, ItemStatus,
  WizardUseCase, DeploymentPreference, BudgetSensitivity,
  PrivacyRequirement, LanguageRequirement, CapabilityOption,
  HardwareTier, SkillLevel, UsageScale, CostBand, Confidence,
} from '@llmstore/shared';

export const contentTypeLabels: Record<ContentType, string> = {
  tool: 'Инструменты',
  model: 'Модели',
  prompt_pack: 'Промпт-паки',
  workflow_pack: 'Воркфлоу',
  business_agent: 'Агенты',
  developer_asset: 'Dev-ассеты',
  local_build: 'Локальные сборки',
  stack_preset: 'Стек-пресеты',
  guide: 'Гайды',
};

export const pricingTypeLabels: Record<PricingType, string> = {
  free: 'Бесплатно',
  paid: 'Платный',
  open_source: 'Open Source',
  api_based: 'API-тариф',
  freemium: 'Freemium',
  enterprise: 'Enterprise',
};

export const deploymentTypeLabels: Record<DeploymentType, string> = {
  cloud: 'Облако',
  local: 'Локально',
  self_hosted: 'Self-hosted',
  hybrid: 'Гибрид',
};

export const privacyTypeLabels: Record<PrivacyType, string> = {
  public_api: 'Публичный API',
  private: 'Приватный',
  offline: 'Оффлайн',
  zero_retention: 'Zero retention',
};

export const languageSupportLabels: Record<LanguageSupport, string> = {
  ru: 'Русский',
  en: 'English',
  multilingual: 'Мультиязычный',
};

export const difficultyLabels: Record<Difficulty, string> = {
  beginner: 'Начинающий',
  intermediate: 'Средний',
  advanced: 'Продвинутый',
};

export const readinessLabels: Record<Readiness, string> = {
  template: 'Шаблон',
  deployable: 'Готов к deploy',
  production_ready: 'Production',
};

export const itemStatusLabels: Record<ItemStatus, string> = {
  draft: 'Черновик',
  published: 'Опубликован',
  archived: 'В архиве',
};

// ── Stack Builder wizard labels ─────────────────────────────────────

export const wizardUseCaseLabels: Record<WizardUseCase, string> = {
  coding_assistant: 'Ассистент для кода',
  customer_support: 'Поддержка клиентов',
  content_creation: 'Создание контента',
  telegram_publishing: 'Telegram-публикации',
  rag_knowledge_base: 'RAG / База знаний',
  document_extraction: 'Извлечение данных из документов',
  ocr_speech_pipeline: 'OCR / Речь / Пайплайн',
  internal_business: 'Внутренние бизнес-задачи',
  experimentation: 'Эксперименты и прототипы',
  local_private: 'Локальный / Приватный',
  custom: 'Другое',
};

export const wizardUseCaseDescriptions: Record<WizardUseCase, string> = {
  coding_assistant: 'Помощь с написанием, ревью и отладкой кода',
  customer_support: 'Автоматизация ответов, чат-боты для саппорта',
  content_creation: 'Генерация текстов, статей, постов',
  telegram_publishing: 'Автопубликация и ведение Telegram-каналов',
  rag_knowledge_base: 'Поиск по документам, вопрос-ответ по базе знаний',
  document_extraction: 'Парсинг PDF, извлечение структурированных данных',
  ocr_speech_pipeline: 'Распознавание изображений, текста, речи',
  internal_business: 'Внутренние отчёты, аналитика, автоматизация',
  experimentation: 'Быстрые прототипы и тесты новых идей',
  local_private: 'Полностью локальные и приватные решения',
  custom: 'Нестандартный сценарий использования',
};

export const deploymentPreferenceLabels: Record<DeploymentPreference, string> = {
  cloud: 'Облако',
  local: 'Локально',
  self_hosted: 'Self-hosted',
  hybrid: 'Гибрид',
  not_sure: 'Не уверен',
};

export const deploymentPreferenceDescriptions: Record<DeploymentPreference, string> = {
  cloud: 'API-провайдеры — OpenAI, Anthropic и др.',
  local: 'Запуск на своём компьютере (Ollama, LM Studio)',
  self_hosted: 'На своём сервере или VPS',
  hybrid: 'Комбинация облачных и локальных решений',
  not_sure: 'Помогите определиться',
};

export const budgetSensitivityLabels: Record<BudgetSensitivity, string> = {
  free_only: 'Только бесплатное',
  low: 'Минимальный бюджет',
  medium: 'Средний бюджет',
  high: 'Готов платить за качество',
  enterprise: 'Enterprise',
  not_sure: 'Пока не определился',
};

export const privacyRequirementLabels: Record<PrivacyRequirement, string> = {
  no_special: 'Без особых требований',
  prefer_private: 'Предпочитаю приватность',
  must_offline: 'Обязательно оффлайн',
  zero_retention: 'Zero retention',
  self_hosted: 'Self-hosted',
};

export const languageRequirementLabels: Record<LanguageRequirement, string> = {
  russian_primary: 'Русский — основной',
  english_primary: 'Английский — основной',
  multilingual: 'Мультиязычный',
  no_preference: 'Без предпочтений',
};

export const capabilityOptionLabels: Record<CapabilityOption, string> = {
  tool_calling: 'Вызов инструментов (Tool calling)',
  structured_outputs: 'Структурированный вывод (JSON)',
  vision: 'Зрение (анализ изображений)',
  long_context: 'Длинный контекст (100K+ токенов)',
  reasoning: 'Рассуждение (reasoning)',
  low_latency: 'Низкая задержка',
  cheap_inference: 'Дешёвый инференс',
  local_support: 'Локальный запуск',
};

export const hardwareTierLabels: Record<HardwareTier, string> = {
  cpu_only: 'Только CPU',
  small_gpu: 'Небольшая GPU (8 GB)',
  medium_gpu: 'Средняя GPU (16-24 GB)',
  large_gpu: 'Мощная GPU (48+ GB)',
  cloud_only: 'Только облако',
};

export const skillLevelLabels: Record<SkillLevel, string> = {
  beginner: 'Начинающий',
  intermediate: 'Средний',
  advanced: 'Продвинутый',
};

export const skillLevelDescriptions: Record<SkillLevel, string> = {
  beginner: 'Минимальный опыт с AI/ML — нужны готовые решения',
  intermediate: 'Знакомы с API, могу настроить и запустить',
  advanced: 'Могу собрать пайплайн, настроить fine-tuning',
};

export const usageScaleLabels: Record<UsageScale, string> = {
  personal: 'Личное использование',
  indie: 'Инди / Фриланс',
  startup: 'Стартап',
  smb: 'Малый и средний бизнес',
  enterprise: 'Enterprise',
};

export const costBandLabels: Record<CostBand, string> = {
  free: 'Бесплатно',
  low: 'Низкая стоимость',
  medium: 'Средняя стоимость',
  high: 'Высокая стоимость',
  enterprise: 'Enterprise',
};

export const confidenceLabels: Record<Confidence, string> = {
  high: 'Высокая',
  medium: 'Средняя',
  low: 'Низкая',
};
