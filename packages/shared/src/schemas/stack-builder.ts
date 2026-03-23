import { z } from 'zod';

export const stackBuilderInputSchema = z.object({
  use_case: z.string().min(1),
  deployment_preference: z.enum(['cloud', 'local', 'hybrid', 'no_preference']),
  budget_sensitivity: z.enum(['low', 'medium', 'high']),
  privacy_requirement: z.enum(['standard', 'strict', 'offline']),
  ru_language_importance: z.enum(['critical', 'nice_to_have', 'not_needed']),
  capabilities_needed: z.array(z.string()),
  hardware_available: z
    .object({
      ram_gb: z.number().optional(),
      vram_gb: z.number().optional(),
      gpu_model: z.string().optional(),
    })
    .optional(),
  business_size: z.enum(['solo', 'startup', 'smb', 'enterprise']).optional(),
  skill_level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
});

export type StackBuilderInput = z.infer<typeof stackBuilderInputSchema>;
