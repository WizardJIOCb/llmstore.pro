import { apiClient } from '../api-client';
import type { ProjectDeployment } from './chats';

export type TelegramBotQuickstartPreset = 'dtf_news' | 'web_news' | 'product_tracker' | 'memory' | 'support';

export interface TelegramBotQuickstartPayload {
  preset: TelegramBotQuickstartPreset;
  bot_name?: string;
  telegram_bot_token: string;
  prompt?: string | null;
  source_url?: string | null;
  timezone?: string | null;
}

export interface TelegramBotQuickstartResult {
  agent: {
    id: string;
    name: string;
    description: string | null;
  };
  chat: {
    id: string;
    title: string;
  };
  message_id: string;
  deployment: ProjectDeployment | null;
  setup_error: string | null;
  botfather_url: string;
  chat_url: string;
}

export const telegramQuickstartApi = {
  create: (payload: TelegramBotQuickstartPayload) =>
    apiClient.post<{ data: TelegramBotQuickstartResult }>('/telegram-bot-quickstart', payload)
      .then((response) => response.data.data),
};
