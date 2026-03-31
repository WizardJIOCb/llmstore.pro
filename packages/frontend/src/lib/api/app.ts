import { apiClient } from '../api-client';

export interface AppSettings {
  usd_to_rub_rate: number;
  topup: {
    message: string;
    telegram: string;
    email: string;
    phone: string;
  };
  starter_prompts: {
    openrouter_coding_agent: string[];
    openrouter_coding_agent_fast: string[];
    openrouter_coding_agent_heavy_planning: string[];
    openrouter_coding_agent_coding_alternative: string[];
    dtf_news_agent: string[];
  };
}

export const appApi = {
  getSettings: () =>
    apiClient.get<{ data: AppSettings }>('/app/settings').then((r) => r.data.data),
};
