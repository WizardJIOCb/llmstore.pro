import { apiClient } from '../api-client';

export interface AppSettings {
  usd_to_rub_rate: number;
  openrouter_requests_enabled: boolean;
  openrouter_disabled_message: string;
  topup: {
    message: string;
    telegram: string;
    email: string;
    phone: string;
  };
  legal: {
    business_name: string;
    business_status: string;
    inn: string;
    ogrn: string;
    address: string;
    support_email: string;
    support_phone: string;
    support_telegram: string;
  };
  starter_prompts: {
    openrouter_coding_agent: string[];
    openrouter_coding_agent_fast: string[];
    openrouter_coding_agent_heavy_planning: string[];
    openrouter_coding_agent_coding_alternative: string[];
    dtf_news_agent: string[];
  };
}

export interface ProjectCommitActivityDay {
  date: string;
  count: number;
}

export interface ProjectCommitActivity {
  range_start: string;
  range_end: string;
  total_commits: number;
  max_commits_per_day: number;
  days: ProjectCommitActivityDay[];
}

export const appApi = {
  getSettings: () =>
    apiClient.get<{ data: AppSettings }>('/app/settings').then((r) => r.data.data),
  getProjectCommitActivity: () =>
    apiClient.get<{ data: ProjectCommitActivity }>('/app/project-activity').then((r) => r.data.data),
};
