import { z } from 'zod';
import { validate } from '../../middleware/validate.js';

const createYooKassaTopUpSchema = z.object({
  amount_rub: z.coerce.number().positive(),
});

const topUpIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const validateCreateYooKassaTopUp = validate(createYooKassaTopUpSchema, 'body');
export const validateTopUpIdParams = validate(topUpIdParamsSchema, 'params');

export type CreateYooKassaTopUpInput = z.infer<typeof createYooKassaTopUpSchema>;
