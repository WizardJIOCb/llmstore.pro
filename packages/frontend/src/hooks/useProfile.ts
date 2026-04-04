import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { profileApi } from '../lib/api/profile';
import type { ProfileLeaderboardSort } from '@llmstore/shared';

export function useProfile(enabled = true) {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => profileApi.getProfile(),
    staleTime: 30_000,
    enabled,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name?: string; username?: string }) => profileApi.updateProfile(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { current_password?: string; new_password: string }) => profileApi.changePassword(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export function useProfileLeaderboard(sort: ProfileLeaderboardSort, enabled = true, page = 1, limit = 50) {
  return useQuery({
    queryKey: ['profile', 'leaderboard', sort, page, limit],
    queryFn: () => profileApi.getLeaderboard(sort, page, limit),
    staleTime: 30_000,
    placeholderData: (previousData) => previousData,
    enabled,
  });
}

export function useUnlinkAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: string) => profileApi.unlinkAccount(provider),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
