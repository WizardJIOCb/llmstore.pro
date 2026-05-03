import axios, { AxiosInstance, AxiosError } from 'axios';
import { AppError } from '../../middleware/error-handler.js';
import { logger } from '../../lib/logger.js';
import type {
  ChatCompletionParams,
  ChatCompletionResponse,
  OpenRouterCreditsResponse,
  OpenRouterCurrentKeyResponse,
  OpenRouterError,
} from './types.js';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT = 60_000;
const MAX_TIMEOUT = 15 * 60_000;
const NO_ENDPOINTS_FOR_PARAMETERS_MESSAGE = 'No endpoints found that can handle the requested parameters';

function parseProviderRawError(raw?: string): Record<string, unknown> | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function readProviderErrorField(parsed: Record<string, unknown> | null, field: string): string | number | null {
  const providerError = parsed?.error;
  if (!providerError || typeof providerError !== 'object') return null;
  const value = (providerError as Record<string, unknown>)[field];
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

function resolveOpenRouterErrorInfo(
  orError: OpenRouterError | undefined,
  fallbackMessage: string,
  status: number,
): { message: string; details: Record<string, unknown> } {
  const metadata = orError?.error?.metadata;
  const providerRaw = typeof metadata?.raw === 'string' ? metadata.raw : undefined;
  const parsedProviderRaw = parseProviderRawError(providerRaw);
  const providerMessage = readProviderErrorField(parsedProviderRaw, 'message');
  const providerCode = readProviderErrorField(parsedProviderRaw, 'code');
  const providerType = readProviderErrorField(parsedProviderRaw, 'type');
  const baseMessage = orError?.error?.message || fallbackMessage;
  const message = baseMessage === 'Provider returned error' && typeof providerMessage === 'string'
    ? `${baseMessage}: ${providerMessage}`
    : baseMessage;

  return {
    message,
    details: {
      openrouter_status: status,
      openrouter_code: orError?.error?.code,
      openrouter_type: orError?.error?.type,
      provider_name: metadata?.provider_name,
      provider_is_byok: metadata?.is_byok,
      provider_error_code: providerCode,
      provider_error_type: providerType,
      provider_error_message: providerMessage,
      provider_raw: providerRaw,
    },
  };
}

function throwOpenRouterAppError(status: number, message: string, details: Record<string, unknown>): never {
  if (status === 429) {
    throw new AppError(429, 'RATE_LIMITED', `OpenRouter rate limit: ${message}`, details);
  }
  if (status === 402) {
    throw new AppError(402, 'INSUFFICIENT_CREDITS', `OpenRouter credits exhausted: ${message}`, details);
  }
  if (status === 400) {
    throw new AppError(400, 'LLM_BAD_REQUEST', `OpenRouter bad request: ${message}`, details);
  }

  throw new AppError(502, 'LLM_PROVIDER_ERROR', `OpenRouter error: ${message}`, details);
}

function normalizeTimeoutMs(timeoutMs?: number): number {
  if (!Number.isFinite(timeoutMs) || (timeoutMs ?? 0) <= 0) {
    return DEFAULT_TIMEOUT;
  }

  return Math.min(Math.round(timeoutMs as number), MAX_TIMEOUT);
}

export class OpenRouterClient {
  private http: AxiosInstance;

  constructor(apiKey: string) {
    this.http = axios.create({
      baseURL: OPENROUTER_API_URL,
      timeout: DEFAULT_TIMEOUT,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://llmstore.pro',
        'X-Title': 'LLMStore.pro Agent Runtime',
      },
    });
  }

  async chatCompletion(
    params: ChatCompletionParams,
    options?: { timeoutMs?: number },
  ): Promise<ChatCompletionResponse> {
    const timeoutMs = normalizeTimeoutMs(options?.timeoutMs);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const requestCompletion = async (requestParams: ChatCompletionParams): Promise<ChatCompletionResponse> => {
      logger.debug({ model: requestParams.model, messageCount: requestParams.messages.length }, 'OpenRouter chat completion request');

      const { data } = await this.http.post<ChatCompletionResponse>('/chat/completions', requestParams, {
        signal: controller.signal,
        timeout: timeoutMs,
      });

      logger.debug({
        model: data.model,
        finishReason: data.choices?.[0]?.finish_reason,
        usage: data.usage,
      }, 'OpenRouter chat completion response');

      if (!Array.isArray(data.choices) || data.choices.length === 0) {
        logger.error({
          model: requestParams.model,
          responseId: data.id,
          hasChoicesArray: Array.isArray(data.choices),
        }, 'OpenRouter returned response without choices');
        throw new AppError(502, 'EMPTY_RESPONSE', 'OpenRouter returned no choices');
      }

      return data;
    };

    try {
      return await requestCompletion(params);
    } catch (err) {
      if (err instanceof AxiosError && err.code === 'ERR_CANCELED') {
        const message = `OpenRouter request timed out after ${Math.round(timeoutMs / 1000)}s`;
        logger.error({ model: params.model, timeout_ms: timeoutMs }, 'OpenRouter request timeout');
        throw new AppError(504, 'LLM_TIMEOUT', message);
      }

      if (err instanceof AxiosError) {
        const orError = err.response?.data as OpenRouterError | undefined;
        const status = err.response?.status || 500;
        const { message, details } = resolveOpenRouterErrorInfo(orError, err.message, status);

        logger.error({ status, message, model: params.model, details }, 'OpenRouter API error');

        if (
          params.provider
          && status === 404
          && message.includes(NO_ENDPOINTS_FOR_PARAMETERS_MESSAGE)
        ) {
          logger.warn({
            model: params.model,
            provider: params.provider,
          }, 'Retrying OpenRouter request without provider preferences after routing miss');

          try {
            return await requestCompletion({
              ...params,
              provider: undefined,
            });
          } catch (retryErr) {
            if (retryErr instanceof AxiosError && retryErr.code === 'ERR_CANCELED') {
              const retryMessage = `OpenRouter request timed out after ${Math.round(timeoutMs / 1000)}s`;
              logger.error({ model: params.model, timeout_ms: timeoutMs }, 'OpenRouter retry request timeout');
              throw new AppError(504, 'LLM_TIMEOUT', retryMessage);
            }

            if (retryErr instanceof AxiosError) {
              const retryOrError = retryErr.response?.data as OpenRouterError | undefined;
              const retryStatus = retryErr.response?.status || 500;
              const { message: retryMessage, details: retryDetails } = resolveOpenRouterErrorInfo(
                retryOrError,
                retryErr.message,
                retryStatus,
              );
              logger.error({
                status: retryStatus,
                message: retryMessage,
                model: params.model,
                details: retryDetails,
              }, 'OpenRouter retry API error');
              throwOpenRouterAppError(retryStatus, retryMessage, retryDetails);
            }

            throw retryErr;
          }
        }

        throwOpenRouterAppError(status, message, details);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getCurrentKey(): Promise<OpenRouterCurrentKeyResponse> {
    try {
      const { data } = await this.http.get<OpenRouterCurrentKeyResponse>('/key');
      return data;
    } catch (err) {
      if (err instanceof AxiosError) {
        const orError = err.response?.data as OpenRouterError | undefined;
        const message = orError?.error?.message || err.message;
        const status = err.response?.status || 500;

        logger.error({ status, message }, 'OpenRouter current key request failed');
        throw new AppError(502, 'OPENROUTER_KEY_ERROR', `OpenRouter key info unavailable: ${message}`);
      }
      throw err;
    }
  }

  async getCreditsIfAvailable(): Promise<OpenRouterCreditsResponse | null> {
    try {
      const { data } = await this.http.get<OpenRouterCreditsResponse>('/credits');
      return data;
    } catch (err) {
      if (err instanceof AxiosError) {
        const orError = err.response?.data as OpenRouterError | undefined;
        const message = orError?.error?.message || err.message;
        const status = err.response?.status || 500;

        if (status === 403) {
          logger.warn({ status, message }, 'OpenRouter credits request requires elevated key access');
          return null;
        }

        logger.error({ status, message }, 'OpenRouter credits request failed');
        throw new AppError(502, 'OPENROUTER_CREDITS_ERROR', `OpenRouter credits unavailable: ${message}`);
      }
      throw err;
    }
  }
}
