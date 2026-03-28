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
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
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

export interface OpenRouterError {
  error: {
    message: string;
    type: string;
    code?: string | number;
  };
}
