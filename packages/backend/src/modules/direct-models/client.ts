import axios, { AxiosError } from 'axios';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { AppError } from '../../middleware/error-handler.js';
import type { ChatCompletionParams, ChatCompletionResponse, ChatMessage } from '../openrouter/types.js';

type DirectProvider = 'openai' | 'xai' | 'gemini';

interface DirectModelInfo {
  provider: DirectProvider;
  model: string;
}

interface DirectCompletionOptions {
  timeoutMs?: number;
}

const DIRECT_PREFIX = 'direct/';
const DEFAULT_DIRECT_TIMEOUT_MS = 3 * 60_000;

export function isDirectModelId(modelId?: string | null): boolean {
  return Boolean(modelId?.trim().toLowerCase().startsWith(DIRECT_PREFIX));
}

export function parseDirectModelId(modelId: string): DirectModelInfo | null {
  const normalized = modelId.trim().toLowerCase();
  if (!normalized.startsWith(DIRECT_PREFIX)) return null;

  const [, provider, ...modelParts] = normalized.split('/');
  const model = modelParts.join('/').trim();
  if (!model) return null;
  if (provider === 'openai' || provider === 'xai' || provider === 'gemini') {
    return { provider, model };
  }
  return null;
}

export function getDirectProviderLabel(modelId?: string | null): string | null {
  const info = modelId ? parseDirectModelId(modelId) : null;
  if (!info) return null;
  if (info.provider === 'openai') return 'OpenAI API';
  if (info.provider === 'xai') return 'xAI API';
  return 'Gemini API';
}

function normalizeTimeoutMs(timeoutMs?: number): number {
  if (!Number.isFinite(timeoutMs) || (timeoutMs ?? 0) <= 0) return DEFAULT_DIRECT_TIMEOUT_MS;
  return Math.min(Math.round(timeoutMs as number), 15 * 60_000);
}

function requireApiKey(provider: DirectProvider): string {
  const key = provider === 'openai'
    ? env.OPENAI_API_KEY
    : provider === 'xai'
      ? env.XAI_API_KEY
      : (env.GEMINI_API_KEY || env.GOOGLE_API_KEY);
  if (!key.trim()) {
    const envName = provider === 'openai' ? 'OPENAI_API_KEY' : provider === 'xai' ? 'XAI_API_KEY' : 'GEMINI_API_KEY';
    throw new AppError(503, 'DIRECT_API_KEY_MISSING', `${envName} is not configured on the server`);
  }
  return key.trim();
}

function extractTextParts(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => ('text' in part && typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n');
}

function extractImageUrls(content: ChatMessage['content']): string[] {
  if (!Array.isArray(content)) return [];
  return content
    .map((part) => ('image_url' in part ? part.image_url?.url : null))
    .filter((url): url is string => typeof url === 'string' && url.trim().length > 0);
}

function toOpenAiResponsesInput(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.role === 'system' || message.role === 'user' || message.role === 'assistant')
    .map((message) => {
      const text = extractTextParts(message.content);
      const images = extractImageUrls(message.content);
      const role = message.role;
      const content = [
        ...(text ? [{
          type: role === 'assistant' ? 'output_text' : 'input_text',
          text,
        }] : []),
        ...images.map((imageUrl) => ({
          type: 'input_image',
          image_url: imageUrl,
        })),
      ];
      return { role, content: content.length ? content : [{ type: role === 'assistant' ? 'output_text' : 'input_text', text: '' }] };
    });
}

function dataUrlToGeminiInlineData(url: string): { mimeType: string; data: string } | null {
  const match = url.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match?.[1] || !match[2]) return null;
  return {
    mimeType: match[1],
    data: match[2],
  };
}

function toGeminiContents(messages: ChatMessage[]) {
  const systemText: string[] = [];
  const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = [];

  for (const message of messages) {
    if (message.role === 'tool') continue;
    const text = extractTextParts(message.content);
    const images = extractImageUrls(message.content)
      .map(dataUrlToGeminiInlineData)
      .filter((item): item is { mimeType: string; data: string } => Boolean(item));

    if (message.role === 'system') {
      if (text) systemText.push(text);
      continue;
    }

    const parts: Array<Record<string, unknown>> = [
      ...(text ? [{ text }] : []),
      ...images.map((inlineData) => ({ inlineData })),
    ];
    if (!parts.length) continue;
    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts,
    });
  }

  return {
    systemInstruction: systemText.length ? { parts: [{ text: systemText.join('\n\n') }] } : undefined,
    contents,
  };
}

function normalizeDirectError(provider: DirectProvider, err: unknown): never {
  if (err instanceof AppError) throw err;
  if (err instanceof AxiosError) {
    const status = err.response?.status ?? 502;
    const data = err.response?.data as Record<string, unknown> | undefined;
    const providerError = data?.error;
    const providerMessage = providerError && typeof providerError === 'object'
      ? (providerError as Record<string, unknown>).message
      : undefined;
    const message = typeof providerMessage === 'string' ? providerMessage : err.message;
    logger.error({ provider, status, message, data }, 'Direct model API error');
    if (status === 401 || status === 403) {
      throw new AppError(502, 'DIRECT_API_AUTH_ERROR', `${getProviderName(provider)} auth failed: ${message}`);
    }
    if (status === 429) {
      throw new AppError(429, 'RATE_LIMITED', `${getProviderName(provider)} rate limit: ${message}`);
    }
    throw new AppError(502, 'DIRECT_API_ERROR', `${getProviderName(provider)} error: ${message}`);
  }
  throw err;
}

function getProviderName(provider: DirectProvider): string {
  if (provider === 'openai') return 'OpenAI API';
  if (provider === 'xai') return 'xAI API';
  return 'Gemini API';
}

function geminiThinkingLevel(effort?: string): 'low' | 'high' | undefined {
  if (!effort || effort === 'none') return undefined;
  return effort === 'low' || effort === 'medium' ? 'low' : 'high';
}

function usageFromOpenAi(value: Record<string, unknown> | undefined) {
  const input = typeof value?.input_tokens === 'number' ? value.input_tokens : 0;
  const output = typeof value?.output_tokens === 'number' ? value.output_tokens : 0;
  const total = typeof value?.total_tokens === 'number' ? value.total_tokens : input + output;
  return { prompt_tokens: input, completion_tokens: output, total_tokens: total };
}

function readOpenAiOutputText(data: Record<string, unknown>): string {
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text;
  const output = Array.isArray(data.output) ? data.output : [];
  const textParts: string[] = [];
  for (const item of output) {
    const content = item && typeof item === 'object' ? (item as Record<string, unknown>).content : null;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === 'string') textParts.push(text);
    }
  }
  return textParts.join('\n').trim();
}

async function runOpenAiCompletion(params: ChatCompletionParams, info: DirectModelInfo, timeoutMs: number): Promise<ChatCompletionResponse> {
  const apiKey = requireApiKey('openai');
  const { data } = await axios.post<Record<string, unknown>>(
    'https://api.openai.com/v1/responses',
    {
      model: info.model,
      input: toOpenAiResponsesInput(params.messages),
      temperature: params.temperature,
      max_output_tokens: params.max_tokens,
      reasoning: params.reasoning?.effort && params.reasoning.effort !== 'none'
        ? { effort: params.reasoning.effort === 'xhigh' ? 'high' : params.reasoning.effort }
        : undefined,
    },
    {
      timeout: timeoutMs,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    },
  );

  const text = readOpenAiOutputText(data) || '(empty response)';
  return {
    id: typeof data.id === 'string' ? data.id : `openai-${Date.now()}`,
    model: `direct/openai/${info.model}`,
    created: Math.floor(Date.now() / 1000),
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    usage: usageFromOpenAi(data.usage as Record<string, unknown> | undefined),
  };
}

async function runXaiCompletion(params: ChatCompletionParams, info: DirectModelInfo, timeoutMs: number): Promise<ChatCompletionResponse> {
  const apiKey = requireApiKey('xai');
  const { data } = await axios.post<ChatCompletionResponse>(
    'https://api.x.ai/v1/chat/completions',
    {
      model: info.model,
      messages: params.messages,
      temperature: params.temperature,
      max_tokens: params.max_tokens,
    },
    {
      timeout: timeoutMs,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    },
  );
  return { ...data, model: `direct/xai/${info.model}` };
}

async function runGeminiCompletion(params: ChatCompletionParams, info: DirectModelInfo, timeoutMs: number): Promise<ChatCompletionResponse> {
  const apiKey = requireApiKey('gemini');
  const { systemInstruction, contents } = toGeminiContents(params.messages);
  const { data } = await axios.post<Record<string, unknown>>(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(info.model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      systemInstruction,
      contents,
      generationConfig: {
        temperature: params.temperature,
        maxOutputTokens: params.max_tokens,
        thinkingConfig: info.model.startsWith('gemini-3')
          ? { thinkingLevel: geminiThinkingLevel(params.reasoning?.effort) ?? 'high' }
          : undefined,
      },
    },
    { timeout: timeoutMs, headers: { 'Content-Type': 'application/json' } },
  );

  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const first = candidates[0] && typeof candidates[0] === 'object' ? candidates[0] as Record<string, unknown> : {};
  const content = first.content && typeof first.content === 'object' ? first.content as Record<string, unknown> : {};
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const text = parts
    .map((part) => (part && typeof part === 'object' ? (part as Record<string, unknown>).text : null))
    .filter((part): part is string => typeof part === 'string')
    .join('\n')
    .trim() || '(empty response)';
  const usage = data.usageMetadata && typeof data.usageMetadata === 'object'
    ? data.usageMetadata as Record<string, unknown>
    : {};
  const prompt = typeof usage.promptTokenCount === 'number' ? usage.promptTokenCount : 0;
  const completion = typeof usage.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : 0;
  const total = typeof usage.totalTokenCount === 'number' ? usage.totalTokenCount : prompt + completion;

  return {
    id: `gemini-${Date.now()}`,
    model: `direct/gemini/${info.model}`,
    created: Math.floor(Date.now() / 1000),
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: prompt, completion_tokens: completion, total_tokens: total },
  };
}

export async function directChatCompletion(
  params: ChatCompletionParams,
  options?: DirectCompletionOptions,
): Promise<ChatCompletionResponse> {
  const info = parseDirectModelId(params.model);
  if (!info) {
    throw new AppError(400, 'DIRECT_MODEL_INVALID', `Unsupported direct model id: ${params.model}`);
  }

  const timeoutMs = normalizeTimeoutMs(options?.timeoutMs);
  logger.debug({ provider: info.provider, model: info.model }, 'Direct chat completion request');

  try {
    if (info.provider === 'openai') return await runOpenAiCompletion(params, info, timeoutMs);
    if (info.provider === 'xai') return await runXaiCompletion(params, info, timeoutMs);
    return await runGeminiCompletion(params, info, timeoutMs);
  } catch (err) {
    normalizeDirectError(info.provider, err);
  }
}
