import { useMutation, useQuery } from '@tanstack/react-query';
import { paymentsApi } from '../lib/api/payments';

const PROCESSING_STATUSES = new Set(['pending', 'waiting_for_capture']);

export function usePaymentsConfig() {
  return useQuery({
    queryKey: ['payments', 'config'],
    queryFn: () => paymentsApi.getConfig(),
    staleTime: 5 * 60_000,
  });
}

export function useCreateYooKassaTopUp() {
  return useMutation({
    mutationFn: (data: { amount_rub: number }) => paymentsApi.createYooKassaTopUp(data),
  });
}

export function useTopUpStatus(topupId: string | null | undefined) {
  return useQuery({
    queryKey: ['payments', 'topups', topupId],
    queryFn: () => paymentsApi.getTopUp(topupId!),
    enabled: Boolean(topupId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && !PROCESSING_STATUSES.has(status) ? false : 3000;
    },
  });
}
