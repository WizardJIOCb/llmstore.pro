import { db } from '../../config/database.js';
import { aliceWebhookLogs } from '../../db/schema/index.js';
import type { AliceSessionContext } from './alice.chat.service.js';

interface AliceWebhookLogRequestPayload {
  session?: {
    session_id?: unknown;
    message_id?: unknown;
    application?: {
      application_id?: unknown;
    };
  };
  request?: {
    command?: unknown;
    original_utterance?: unknown;
    request_id?: unknown;
    type?: unknown;
  };
}

export interface AliceWebhookLogInput {
  payload: AliceWebhookLogRequestPayload;
  status: 'success' | 'error';
  statusCode: number;
  responseBody?: Record<string, unknown> | null;
  responseText?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  context?: AliceSessionContext | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  durationMs?: number | null;
}

function toOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toOptionalInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) return parsed;
  }
  return null;
}

function toJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function measureJsonSize(value: unknown): number | null {
  if (value == null) return null;
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf-8');
  } catch {
    return null;
  }
}

export async function createAliceWebhookLog(input: AliceWebhookLogInput): Promise<void> {
  const payload = input.payload ?? {};
  const session = payload.session ?? {};
  const request = payload.request ?? {};

  await db.insert(aliceWebhookLogs).values({
    user_id: input.context?.userId ?? null,
    chat_id: input.context?.chatId ?? null,
    yandex_skill_user_id: toOptionalString((session as any).user_id) ?? null,
    yandex_application_id: toOptionalString(session.application?.application_id) ?? null,
    session_id: toOptionalString(session.session_id) ?? null,
    request_id: toOptionalString(request.request_id) ?? null,
    message_id: toOptionalInteger(session.message_id) ?? null,
    request_type: toOptionalString(request.type) ?? null,
    command: toOptionalString(request.command) ?? null,
    original_utterance: toOptionalString(request.original_utterance) ?? null,
    request_json: toJsonObject(payload),
    response_json: input.responseBody ?? null,
    response_text: input.responseText ?? null,
    response_status_code: input.statusCode,
    response_size_bytes: measureJsonSize(input.responseBody),
    status: input.status,
    error_code: input.errorCode ?? null,
    error_message: input.errorMessage ?? null,
    is_new_user: input.context?.isNewUser ?? null,
    bonus_granted: input.context?.bonusGranted ?? null,
    ip_address: input.ipAddress ?? null,
    user_agent: input.userAgent ?? null,
    duration_ms: input.durationMs ?? null,
  });
}
