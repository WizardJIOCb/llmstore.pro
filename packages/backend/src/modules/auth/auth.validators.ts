import { registerSchema, loginSchema } from '@llmstore/shared';
import { validate } from '../../middleware/validate.js';

export const validateRegister = validate(registerSchema, 'body');
export const validateLogin = validate(loginSchema, 'body');
