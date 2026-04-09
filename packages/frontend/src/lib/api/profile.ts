import { apiClient } from '../api-client';
import type { ProfileLeaderboard, ProfileLeaderboardSort, PublicUserProfile, UserProfile } from '@llmstore/shared';

export const profileApi = {
  getProfile: () =>
    apiClient.get<{ data: UserProfile }>('/profile').then(r => r.data.data),

  getPublicProfile: (username: string) =>
    apiClient.get<{ data: PublicUserProfile }>(`/profile/public/${encodeURIComponent(username)}`).then(r => r.data.data),

  getLeaderboard: (sort: ProfileLeaderboardSort = 'tokens', page = 1, limit = 50) =>
    apiClient
      .get<{ data: ProfileLeaderboard }>('/profile/leaderboard', { params: { sort, page, limit } })
      .then((r) => r.data.data),

  updateProfile: (data: { name?: string }) =>
    apiClient.put<{ data: UserProfile }>('/profile', data).then(r => r.data.data),

  changePassword: (data: { current_password?: string; new_password: string }) =>
    apiClient.put<{ data: { success: true; has_password: true } }>('/profile/password', data).then(r => r.data.data),

  unlinkAccount: (provider: string) =>
    apiClient.delete(`/profile/linked-accounts/${provider}`).then(r => r.data),
};

export function getOAuthLinkUrl(provider: string, deviceFingerprint?: string): string {
  const params = new URLSearchParams({ mode: 'link' });
  if (deviceFingerprint) params.set('device_fingerprint', deviceFingerprint);
  return `/api/auth/oauth/${provider}?${params.toString()}`;
}

export function getOAuthLoginUrl(provider: string, deviceFingerprint?: string, next?: string | null): string {
  const params = new URLSearchParams({ mode: 'login' });
  if (deviceFingerprint) params.set('device_fingerprint', deviceFingerprint);
  if (next) params.set('next', next);
  return `/api/auth/oauth/${provider}?${params.toString()}`;
}
