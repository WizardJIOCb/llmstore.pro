export const WizardUseCase = {
  CODING_ASSISTANT: 'coding_assistant',
  CUSTOMER_SUPPORT: 'customer_support',
  CONTENT_CREATION: 'content_creation',
  TELEGRAM_PUBLISHING: 'telegram_publishing',
  RAG_KNOWLEDGE_BASE: 'rag_knowledge_base',
  DOCUMENT_EXTRACTION: 'document_extraction',
  OCR_SPEECH_PIPELINE: 'ocr_speech_pipeline',
  INTERNAL_BUSINESS: 'internal_business',
  EXPERIMENTATION: 'experimentation',
  LOCAL_PRIVATE: 'local_private',
  CUSTOM: 'custom',
} as const;

export type WizardUseCase = (typeof WizardUseCase)[keyof typeof WizardUseCase];

export const wizardUseCaseValues = Object.values(WizardUseCase) as [WizardUseCase, ...WizardUseCase[]];

export const DeploymentPreference = {
  CLOUD: 'cloud',
  LOCAL: 'local',
  SELF_HOSTED: 'self_hosted',
  HYBRID: 'hybrid',
  NOT_SURE: 'not_sure',
} as const;

export type DeploymentPreference = (typeof DeploymentPreference)[keyof typeof DeploymentPreference];

export const deploymentPreferenceValues = Object.values(DeploymentPreference) as [DeploymentPreference, ...DeploymentPreference[]];

export const BudgetSensitivity = {
  FREE_ONLY: 'free_only',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  ENTERPRISE: 'enterprise',
  NOT_SURE: 'not_sure',
} as const;

export type BudgetSensitivity = (typeof BudgetSensitivity)[keyof typeof BudgetSensitivity];

export const budgetSensitivityValues = Object.values(BudgetSensitivity) as [BudgetSensitivity, ...BudgetSensitivity[]];

export const PrivacyRequirement = {
  NO_SPECIAL: 'no_special',
  PREFER_PRIVATE: 'prefer_private',
  MUST_OFFLINE: 'must_offline',
  ZERO_RETENTION: 'zero_retention',
  SELF_HOSTED: 'self_hosted',
} as const;

export type PrivacyRequirement = (typeof PrivacyRequirement)[keyof typeof PrivacyRequirement];

export const privacyRequirementValues = Object.values(PrivacyRequirement) as [PrivacyRequirement, ...PrivacyRequirement[]];

export const LanguageRequirement = {
  RUSSIAN_PRIMARY: 'russian_primary',
  ENGLISH_PRIMARY: 'english_primary',
  MULTILINGUAL: 'multilingual',
  NO_PREFERENCE: 'no_preference',
} as const;

export type LanguageRequirement = (typeof LanguageRequirement)[keyof typeof LanguageRequirement];

export const languageRequirementValues = Object.values(LanguageRequirement) as [LanguageRequirement, ...LanguageRequirement[]];

export const CapabilityOption = {
  TOOL_CALLING: 'tool_calling',
  STRUCTURED_OUTPUTS: 'structured_outputs',
  VISION: 'vision',
  LONG_CONTEXT: 'long_context',
  REASONING: 'reasoning',
  LOW_LATENCY: 'low_latency',
  CHEAP_INFERENCE: 'cheap_inference',
  LOCAL_SUPPORT: 'local_support',
} as const;

export type CapabilityOption = (typeof CapabilityOption)[keyof typeof CapabilityOption];

export const capabilityOptionValues = Object.values(CapabilityOption) as [CapabilityOption, ...CapabilityOption[]];

export const HardwareTier = {
  CPU_ONLY: 'cpu_only',
  SMALL_GPU: 'small_gpu',
  MEDIUM_GPU: 'medium_gpu',
  LARGE_GPU: 'large_gpu',
  CLOUD_ONLY: 'cloud_only',
} as const;

export type HardwareTier = (typeof HardwareTier)[keyof typeof HardwareTier];

export const hardwareTierValues = Object.values(HardwareTier) as [HardwareTier, ...HardwareTier[]];

export const SkillLevel = {
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
} as const;

export type SkillLevel = (typeof SkillLevel)[keyof typeof SkillLevel];

export const skillLevelValues = Object.values(SkillLevel) as [SkillLevel, ...SkillLevel[]];

export const UsageScale = {
  PERSONAL: 'personal',
  INDIE: 'indie',
  STARTUP: 'startup',
  SMB: 'smb',
  ENTERPRISE: 'enterprise',
} as const;

export type UsageScale = (typeof UsageScale)[keyof typeof UsageScale];

export const usageScaleValues = Object.values(UsageScale) as [UsageScale, ...UsageScale[]];

export const CostBand = {
  FREE: 'free',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  ENTERPRISE: 'enterprise',
} as const;

export type CostBand = (typeof CostBand)[keyof typeof CostBand];

export const Confidence = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
} as const;

export type Confidence = (typeof Confidence)[keyof typeof Confidence];
