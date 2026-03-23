import { z } from 'zod';
import { validate } from '../../middleware/validate.js';

const startRunSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(10000),
  })).min(1),
  variables: z.record(z.string()).optional(),
});

export const validateStartRun = validate(startRunSchema, 'body');
