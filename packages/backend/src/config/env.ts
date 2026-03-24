import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { z } from 'zod';

// Load .env from monorepo root — walk up from cwd
function findEnvFile(): string | undefined {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

const envPath = findEnvFile();
if (envPath) config({ path: envPath });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  OPENROUTER_API_KEY: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GITHUB_CLIENT_ID: z.string().default(''),
  GITHUB_CLIENT_SECRET: z.string().default(''),
  YANDEX_CLIENT_ID: z.string().default(''),
  YANDEX_CLIENT_SECRET: z.string().default(''),
  MAILRU_CLIENT_ID: z.string().default(''),
  MAILRU_CLIENT_SECRET: z.string().default(''),
  VK_CLIENT_ID: z.string().default(''),
  VK_CLIENT_SECRET: z.string().default(''),
  UPLOADS_DIR: z.string().default('./uploads'),
  BACKEND_URL: z.string().default('http://localhost:3001'),
  PORT: z.coerce.number().default(3001),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
