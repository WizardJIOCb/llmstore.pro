import { z } from 'zod';
import { validate } from '../../middleware/validate.js';

const confirmEmailVerificationSchema = z.object({
  token: z.string().min(16).max(512),
  device_fingerprint: z.string().min(8).max(255).optional(),
});

export const validateConfirmEmailVerification = validate(confirmEmailVerificationSchema, 'body');
