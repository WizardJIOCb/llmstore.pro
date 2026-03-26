import { apiClient } from '../api-client';

export type ChatMode = 'general' | 'agent';

export interface ChatListItem {
  id: string;
  title: string;
  mode: ChatMode;
  agent_id: string | null;
  model_external_id: string | null;
  share_token: string | null;
  message_count: number;
  last_message_preview: string | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  run_id: string | null;
  usage: Record<string, unknown> | null;
  latency_ms: number | null;
  created_at: string;
}

export interface ChatDetails {
  chat: Omit<ChatListItem, 'last_message_preview'> & {
    agent_name: string | null;
    agent_chat_description: string | null;
    agent_starter_prompts: string[];
  };
  messages: ChatMessage[];
}

export interface SendMessageResult {
  user_message: ChatMessage;
  assistant_message: ChatMessage;
  chat: {
    id: string;
    title: string;
    mode: ChatMode;
    agent_id: string | null;
    model_external_id: string | null;
    share_token: string | null;
  };
}

export interface ChatStats {
  chat: {
    id: string;
    title: string;
    mode: ChatMode;
    agent_id: string | null;
    agent_name: string | null;
    model_external_id: string | null;
    created_at: string;
    updated_at: string;
    last_message_at: string;
    message_count: number;
    user_messages: number;
    assistant_messages: number;
  };
  totals: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    usd_cost: number;
    rub_cost: number;
    messages_with_usage: number;
  };
  by_model: Array<{
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    usd_cost: number;
    rub_cost: number;
    messages: number;
  }>;
  usd_to_rub_rate: number;
}

export interface ChatAgentOption {
  id: string;
  name: string;
  owner_user_id: string;
  is_owner: boolean;
  description: string | null;
  chat_description: string | null;
  starter_prompts: string[];
}

export const chatsApi = {
  list: () => apiClient.get<{ data: ChatListItem[] }>('/chats').then((r) => r.data.data),

  listAgents: () => apiClient.get<{ data: ChatAgentOption[] }>('/chats/agents').then((r) => r.data.data),

  get: (chatId: string) =>
    apiClient.get<{ data: ChatDetails }>(`/chats/${chatId}`).then((r) => r.data.data),

  create: (payload?: {
    title?: string;
    mode?: ChatMode;
    agent_id?: string | null;
    model_external_id?: string | null;
    system_prompt?: string | null;
  }) => apiClient.post<{ data: ChatListItem }>('/chats', payload ?? {}).then((r) => r.data.data),

  update: (
    chatId: string,
    payload: {
      title?: string;
      mode?: ChatMode;
      agent_id?: string | null;
      model_external_id?: string | null;
      system_prompt?: string | null;
    },
  ) => apiClient.patch<{ data: ChatListItem }>(`/chats/${chatId}`, payload).then((r) => r.data.data),

  remove: (chatId: string) => apiClient.delete(`/chats/${chatId}`),

  share: (chatId: string) =>
    apiClient.post<{ data: { share_token: string } }>(`/chats/${chatId}/share`).then((r) => r.data.data),

  sendMessage: (chatId: string, content: string) =>
    apiClient.post<{ data: SendMessageResult }>(`/chats/${chatId}/messages`, { content }).then((r) => r.data.data),

  stats: (chatId: string) =>
    apiClient.get<{ data: ChatStats }>(`/chats/${chatId}/stats`).then((r) => r.data.data),
};
