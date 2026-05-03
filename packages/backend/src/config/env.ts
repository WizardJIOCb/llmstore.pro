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

const commaSeparatedUrlList = z.string().refine((value) => {
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!items.length) return false;

  return items.every((item) => {
    try {
      new URL(item);
      return true;
    } catch {
      return false;
    }
  });
}, 'Expected one or more comma-separated URLs');

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  MYSQL_ADMIN_URL: z.string().default(''),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  OPENROUTER_API_KEY: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  TAVILY_API_KEY: z.string().default(''),
  BRAVE_SEARCH_API_KEY: z.string().default(''),
  GOOGLE_CUSTOM_SEARCH_API_KEY: z.string().default(''),
  GOOGLE_CUSTOM_SEARCH_ENGINE_ID: z.string().default(''),
  EXA_API_KEY: z.string().default(''),
  SERPAPI_API_KEY: z.string().default(''),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GITHUB_CLIENT_ID: z.string().default(''),
  GITHUB_CLIENT_SECRET: z.string().default(''),
  YANDEX_CLIENT_ID: z.string().default(''),
  YANDEX_CLIENT_SECRET: z.string().default(''),
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_BOT_USERNAME: z.string().default('llmstorechat_bot'),
  ALICE_SKILL_CLIENT_ID: z.string().default(''),
  ALICE_SKILL_CLIENT_SECRET: z.string().default(''),
  ALICE_ALLOWED_REDIRECT_URI: commaSeparatedUrlList.default('https://social.yandex.net/broker/redirect'),
  ALICE_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
  ALICE_REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(7_776_000),
  ALICE_SKILL_ID: z.string().default(''),
  ALICE_SKILL_NAME: z.string().default('LLM Store'),
  MAILRU_CLIENT_ID: z.string().default(''),
  MAILRU_CLIENT_SECRET: z.string().default(''),
  VK_CLIENT_ID: z.string().default(''),
  VK_CLIENT_SECRET: z.string().default(''),
  UPLOADS_DIR: z.string().default('./uploads'),
  BACKEND_URL: z.string().default('http://localhost:3001'),
  TELEGRAM_WEBHOOK_BASE_URL: z.string().url().or(z.literal('')).default(''),
  PORT: z.coerce.number().default(3001),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  YOOKASSA_SHOP_ID: z.string().default(''),
  YOOKASSA_SECRET_KEY: z.string().default(''),
  YOOKASSA_TOPUP_MIN_RUB: z.coerce.number().positive().default(100),
  YOOKASSA_TOPUP_MAX_RUB: z.coerce.number().positive().default(500000),
  YOOKASSA_RECEIPT_VAT_CODE: z.coerce.number().int().min(1).max(12).default(1),
  TURNSTILE_SECRET_KEY: z.string().default(''),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().default(''),
  MAIL_REPLY_TO: z.string().default(''),
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
