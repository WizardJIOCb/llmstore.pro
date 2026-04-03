import { apiClient } from '../api-client';

export interface PaymentsPublicConfig {
  provider: 'yookassa';
  enabled: boolean;
  min_amount_rub: number;
  max_amount_rub: number;
  preset_amounts_rub: number[];
}

export interface BalanceTopUp {
  id: string;
  provider: string;
  status: string;
  amount_rub: string;
  amount_usd: string;
  usd_to_rub_rate: string;
  confirmation_url: string | null;
  return_url: string | null;
  provider_payment_id: string | null;
  paid_at: string | null;
  credited_at: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}

export const paymentsApi = {
  getConfig: () =>
    apiClient.get<{ data: PaymentsPublicConfig }>('/payments/config').then((r) => r.data.data),

  createYooKassaTopUp: (data: { amount_rub: number }) =>
    apiClient.post<{ data: { topup: BalanceTopUp; confirmation_url: string } }>('/payments/topups/yookassa', data)
      .then((r) => r.data.data),

  getTopUp: (id: string) =>
    apiClient.get<{ data: BalanceTopUp }>(`/payments/topups/${id}`).then((r) => r.data.data),
};
