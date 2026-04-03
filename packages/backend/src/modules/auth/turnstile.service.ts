import { env } from '../../config/env.js';
import { AppError } from '../../middleware/error-handler.js';

interface TurnstileVerificationResponse {
  success: boolean;
  'error-codes'?: string[];
}

export async function verifyTurnstileToken(token?: string | null, remoteIp?: string | null): Promise<void> {
  if (!env.TURNSTILE_SECRET_KEY) return;

  const normalizedToken = token?.trim();
  if (!normalizedToken) {
    throw new AppError(400, 'TURNSTILE_REQUIRED', 'Подтвердите, что вы не робот');
  }

  const params = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: normalizedToken,
  });

  if (remoteIp) {
    params.set('remoteip', remoteIp);
  }

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new AppError(502, 'TURNSTILE_UNAVAILABLE', 'Проверка защиты временно недоступна');
  }

  const data = await response.json() as TurnstileVerificationResponse;
  if (!data.success) {
    throw new AppError(400, 'TURNSTILE_FAILED', 'Не удалось подтвердить защитную проверку');
  }
}
