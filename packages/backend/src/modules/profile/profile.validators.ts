import { z } from 'zod';
import { validate } from '../../middleware/validate.js';

const changePasswordSchema = z.object({
  current_password: z.string().min(1).max(128).optional(),
  new_password: z.string().min(8).max(128),
});

export const validateChangePassword = validate(changePasswordSchema, 'body');

const openRouterKeySchema = z.object({
  api_key: z.string().trim().min(20).max(500),
  label: z.string().trim().max(120).optional().nullable(),
});

export const validateOpenRouterKey = validate(openRouterKeySchema, 'body');
