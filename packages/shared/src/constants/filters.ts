export const ItemStatus = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
} as const;

export type ItemStatus = (typeof ItemStatus)[keyof typeof ItemStatus];

export const itemStatusValues = Object.values(ItemStatus) as [ItemStatus, ...ItemStatus[]];

export const Visibility = {
  PUBLIC: 'public',
  PRIVATE: 'private',
  UNLISTED: 'unlisted',
} as const;

export type Visibility = (typeof Visibility)[keyof typeof Visibility];

export const visibilityValues = Object.values(Visibility) as [Visibility, ...Visibility[]];

export const PricingType = {
  FREE: 'free',
  PAID: 'paid',
  OPEN_SOURCE: 'open_source',
  API_BASED: 'api_based',
  FREEMIUM: 'freemium',
  ENTERPRISE: 'enterprise',
} as const;

export type PricingType = (typeof PricingType)[keyof typeof PricingType];

export const pricingTypeValues = Object.values(PricingType) as [PricingType, ...PricingType[]];

export const DeploymentType = {
  CLOUD: 'cloud',
  LOCAL: 'local',
  SELF_HOSTED: 'self_hosted',
  HYBRID: 'hybrid',
} as const;

export type DeploymentType = (typeof DeploymentType)[keyof typeof DeploymentType];

export const deploymentTypeValues = Object.values(DeploymentType) as [DeploymentType, ...DeploymentType[]];

export const PrivacyType = {
  PUBLIC_API: 'public_api',
  PRIVATE: 'private',
  OFFLINE: 'offline',
  ZERO_RETENTION: 'zero_retention',
} as const;

export type PrivacyType = (typeof PrivacyType)[keyof typeof PrivacyType];

export const privacyTypeValues = Object.values(PrivacyType) as [PrivacyType, ...PrivacyType[]];

export const LanguageSupport = {
  RU: 'ru',
  EN: 'en',
  MULTILINGUAL: 'multilingual',
} as const;

export type LanguageSupport = (typeof LanguageSupport)[keyof typeof LanguageSupport];

export const languageSupportValues = Object.values(LanguageSupport) as [LanguageSupport, ...LanguageSupport[]];

export const Difficulty = {
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
} as const;

export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];

export const difficultyValues = Object.values(Difficulty) as [Difficulty, ...Difficulty[]];

export const Readiness = {
  TEMPLATE: 'template',
  DEPLOYABLE: 'deployable',
  PRODUCTION_READY: 'production_ready',
} as const;

export type Readiness = (typeof Readiness)[keyof typeof Readiness];

export const readinessValues = Object.values(Readiness) as [Readiness, ...Readiness[]];
