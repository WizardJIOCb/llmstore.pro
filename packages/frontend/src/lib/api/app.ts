import { apiClient } from '../api-client';

export interface AppSettings {
  usd_to_rub_rate: number;
  topup: {
    message: string;
    telegram: string;
    email: string;
    phone: string;
  };
}

export const appApi = {
  getSettings: () =>
    apiClient.get<{ data: AppSettings }>('/app/settings').then((r) => r.data.data),
};
