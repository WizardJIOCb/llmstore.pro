import { useQuery } from '@tanstack/react-query';
import { appApi } from '../lib/api/app';

export function useAppSettings() {
  return useQuery({
    queryKey: ['app', 'settings'],
    queryFn: () => appApi.getSettings(),
    staleTime: 5 * 60_000,
  });
}
