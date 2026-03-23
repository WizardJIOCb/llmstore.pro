import { z } from 'zod';
import {
  wizardUseCaseValues,
  deploymentPreferenceValues,
  budgetSensitivityValues,
  privacyRequirementValues,
  languageRequirementValues,
  capabilityOptionValues,
  hardwareTierValues,
  skillLevelValues,
  usageScaleValues,
} from '../constants/stack-wizard.js';

export const stackBuilderInputSchema = z.object({
  use_case: z.enum(wizardUseCaseValues),
  deployment_preference: z.enum(deploymentPreferenceValues),
  budget_sensitivity: z.enum(budgetSensitivityValues),
  privacy_requirement: z.enum(privacyRequirementValues),
  language_requirement: z.enum(languageRequirementValues),
  capabilities_needed: z.array(z.enum(capabilityOptionValues)).default([]),
  hardware_tier: z.enum(hardwareTierValues).optional(),
  skill_level: z.enum(skillLevelValues).optional(),
  usage_scale: z.enum(usageScaleValues).optional(),
});

export type StackBuilderInput = z.infer<typeof stackBuilderInputSchema>;

export const saveStackResultSchema = z.object({
  name: z.string().max(255).optional(),
  builder_answers: stackBuilderInputSchema,
  recommended_result: z.record(z.unknown()),
});

export type SaveStackResultInput = z.infer<typeof saveStackResultSchema>;

export const exportStackSchema = z.object({
  format: z.enum(['json', 'markdown']),
  result: z.record(z.unknown()).optional(),
  saved_result_id: z.string().uuid().optional(),
}).refine(
  (data) => data.result || data.saved_result_id,
  { message: 'Either result or saved_result_id must be provided' },
);

export type ExportStackInput = z.infer<typeof exportStackSchema>;

export const createAgentFromStackSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  saved_result_id: z.string().uuid().optional(),
  result: z.record(z.unknown()).optional(),
}).refine(
  (data) => data.result || data.saved_result_id,
  { message: 'Either result or saved_result_id must be provided' },
);

export type CreateAgentFromStackInput = z.infer<typeof createAgentFromStackSchema>;
