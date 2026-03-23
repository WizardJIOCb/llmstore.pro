import type { ContentType, PricingType, DeploymentType, PrivacyType, LanguageSupport, Difficulty, Readiness, ItemStatus } from '@llmstore/shared';

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
