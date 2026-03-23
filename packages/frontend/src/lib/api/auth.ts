import { apiClient } from '../api-client';
import type { UserPublic } from '@llmstore/shared';

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
  username?: string;
}

export const authApi = {
  login: (data: LoginInput) =>
    apiClient.post<{ data: UserPublic }>('/auth/login', data).then((r) => r.data.data),

  register: (data: RegisterInput) =>
    apiClient.post<{ data: UserPublic }>('/auth/register', data).then((r) => r.data.data),

  logout: () =>
    apiClient.post('/auth/logout').then((r) => r.data),

  me: () =>
    apiClient.get<{ data: UserPublic }>('/auth/me').then((r) => r.data.data),
};
