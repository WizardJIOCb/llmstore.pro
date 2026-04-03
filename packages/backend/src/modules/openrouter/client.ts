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

  async chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
    try {
      logger.debug({ model: params.model, messageCount: params.messages.length }, 'OpenRouter chat completion request');

      const { data } = await this.http.post<ChatCompletionResponse>('/chat/completions', params, {
        signal: controller.signal,
      });

      logger.debug({
        model: data.model,
        finishReason: data.choices?.[0]?.finish_reason,
        usage: data.usage,
      }, 'OpenRouter chat completion response');

      return data;
    } catch (err) {
      if (err instanceof AxiosError && err.code === 'ERR_CANCELED') {
        const message = `OpenRouter request timed out after ${Math.round(DEFAULT_TIMEOUT / 1000)}s`;
        logger.error({ model: params.model, timeout_ms: DEFAULT_TIMEOUT }, 'OpenRouter request timeout');
        throw new AppError(504, 'LLM_TIMEOUT', message);
      }

      if (err instanceof AxiosError) {
        const orError = err.response?.data as OpenRouterError | undefined;
        const message = orError?.error?.message || err.message;
        const status = err.response?.status || 500;

        logger.error({ status, message, model: params.model }, 'OpenRouter API error');

        if (status === 429) {
          throw new AppError(429, 'RATE_LIMITED', `OpenRouter rate limit: ${message}`);
        }
        if (status === 402) {
          throw new AppError(402, 'INSUFFICIENT_CREDITS', `OpenRouter credits exhausted: ${message}`);
        }
        if (status === 400) {
          throw new AppError(400, 'LLM_BAD_REQUEST', `OpenRouter bad request: ${message}`);
        }

        throw new AppError(502, 'LLM_PROVIDER_ERROR', `OpenRouter error: ${message}`);
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
