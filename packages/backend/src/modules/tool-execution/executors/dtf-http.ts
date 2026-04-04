import axios, { type AxiosRequestConfig } from 'axios';
import { logger } from '../../../lib/logger.js';

const DTF_TIMEOUT_MS = 20000;
const DTF_RETRY_ATTEMPTS = 2;
const DTF_RETRY_DELAY_MS = 750;
const DTF_USER_AGENT = 'Mozilla/5.0 (compatible; LLMStore/1.0; +https://llmstore.pro)';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: unknown) {
  if (!axios.isAxiosError(error)) return false;
  return error.code === 'ECONNABORTED' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT';
}

export async function fetchDtfJson<T>(
  label: string,
  url: string,
  config: AxiosRequestConfig = {},
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= DTF_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const { data } = await axios.get<T>(url, {
        timeout: DTF_TIMEOUT_MS,
        ...config,
        headers: {
          'User-Agent': DTF_USER_AGENT,
          ...(config.headers ?? {}),
        },
      });

      return data;
    } catch (error) {
      lastError = error;
      logger.warn(
        {
          label,
          attempt,
          max_attempts: DTF_RETRY_ATTEMPTS,
          retryable: isRetryableError(error),
          err: error,
        },
        'DTF request failed',
      );

      if (!isRetryableError(error) || attempt >= DTF_RETRY_ATTEMPTS) {
        throw error;
      }

      await delay(DTF_RETRY_DELAY_MS);
    }
  }

  throw lastError;
}
