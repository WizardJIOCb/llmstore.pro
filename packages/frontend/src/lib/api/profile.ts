import { apiClient } from '../api-client';
import type { UserProfile } from '@llmstore/shared';

export const profileApi = {
  getProfile: () =>
    apiClient.get<{ data: UserProfile }>('/profile').then(r => r.data.data),

  updateProfile: (data: { name?: string; username?: string }) =>
    apiClient.put<{ data: UserProfile }>('/profile', data).then(r => r.data.data),

  unlinkAccount: (provider: string) =>
    apiClient.delete(`/profile/linked-accounts/${provider}`).then(r => r.data),
};

export function getOAuthLinkUrl(provider: string): string {
  return `/api/auth/oauth/${provider}?mode=link`;
}

export function getOAuthLoginUrl(provider: string): string {
  return `/api/auth/oauth/${provider}?mode=login`;
}
