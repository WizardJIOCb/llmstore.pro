import { apiClient } from '../api-client';
import type { AliceLinkCodeDto, ProfileLeaderboard, ProfileLeaderboardSort, PublicUserProfile, TelegramLinkCodeDto, UserProfile } from '@llmstore/shared/types';

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

  upsertOpenRouterKey: (data: { api_key: string; label?: string | null }) =>
    apiClient.put<{
      data: {
        configured: boolean;
        key_hint: string | null;
        label: string | null;
        updated_at: string | null;
      };
    }>('/profile/provider-keys/openrouter', data).then(r => r.data.data),

  deleteOpenRouterKey: () =>
    apiClient.delete<{
      data: {
        configured: boolean;
        key_hint: string | null;
        label: string | null;
        updated_at: string | null;
      };
    }>('/profile/provider-keys/openrouter').then(r => r.data.data),

  createAliceLinkCode: () =>
    apiClient.post<{ data: AliceLinkCodeDto }>('/profile/alice/link-code').then((r) => r.data.data),

  createTelegramLinkCode: () =>
    apiClient.post<{ data: TelegramLinkCodeDto }>('/profile/telegram/link-code').then((r) => r.data.data),

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
