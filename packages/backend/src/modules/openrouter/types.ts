// OpenRouter API types (OpenAI-compatible)

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content:
    | string
    | null
    | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolDefinitionParam {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatCompletionParams {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinitionParam[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  reasoning?: {
    effort?: 'xhigh' | 'high' | 'medium' | 'low' | 'minimal' | 'none';
    max_tokens?: number;
    exclude?: boolean;
    enabled?: boolean;
  };
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  provider?: {
    sort?: 'price' | 'throughput' | 'latency' | { by: 'price' | 'throughput' | 'latency'; partition?: 'model' | 'none' };
    allow_fallbacks?: boolean;
    require_parameters?: boolean;
    only?: string[];
    ignore?: string[];
    max_price?: {
      prompt?: number;
      completion?: number;
      request?: number;
      image?: number;
    };
  };
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter' | null;
}

export interface UsageInfo {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: UsageInfo;
  created: number;
}

export interface OpenRouterRateLimitInfo {
  requests?: number;
  interval?: string;
  note?: string;
}

export interface OpenRouterCurrentKeyInfo {
  label: string;
  limit: number | null;
  limit_reset: string | null;
  limit_remaining: number | null;
  include_byok_in_limit: boolean;
  usage: number;
  usage_daily: number;
  usage_weekly: number;
  usage_monthly: number;
  byok_usage: number;
  byok_usage_daily: number;
  byok_usage_weekly: number;
  byok_usage_monthly: number;
  is_free_tier: boolean;
  is_management_key?: boolean;
  is_provisioning_key?: boolean;
  expires_at?: string | null;
  rate_limit?: OpenRouterRateLimitInfo | null;
}

export interface OpenRouterCurrentKeyResponse {
  data: OpenRouterCurrentKeyInfo;
}

export interface OpenRouterCreditsInfo {
  total_credits: number;
  total_usage: number;
}

export interface OpenRouterCreditsResponse {
  data: OpenRouterCreditsInfo;
}

export interface OpenRouterError {
  error: {
    message: string;
    type: string;
    code?: string | number;
    metadata?: {
      raw?: string;
      provider_name?: string;
      is_byok?: boolean;
      [key: string]: unknown;
    };
  };
}
