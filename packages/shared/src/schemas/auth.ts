import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255).optional(),
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/)
    .optional(),
  device_fingerprint: z.string().min(8).max(255).optional(),
  turnstile_token: z.string().min(1).max(2048).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  login: z.string().trim().min(1).max(255).optional(),
  email: z.string().trim().min(1).max(255).optional(),
  password: z.string().min(1),
}).refine((value) => Boolean(value.login || value.email), {
  message: 'Укажите email или логин',
  path: ['login'],
});

export type LoginInput = z.infer<typeof loginSchema>;
