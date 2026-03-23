import axios, { AxiosInstance, AxiosError } from 'axios';
import { AppError } from '../../middleware/error-handler.js';
import { logger } from '../../lib/logger.js';
import type {
  ChatCompletionParams,
  ChatCompletionResponse,
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
    try {
      logger.debug({ model: params.model, messageCount: params.messages.length }, 'OpenRouter chat completion request');

      const { data } = await this.http.post<ChatCompletionResponse>('/chat/completions', params);

      logger.debug({
        model: data.model,
        finishReason: data.choices?.[0]?.finish_reason,
        usage: data.usage,
      }, 'OpenRouter chat completion response');

      return data;
    } catch (err) {
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
    }
  }
}
