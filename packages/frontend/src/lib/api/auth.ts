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
  device_fingerprint?: string;
  turnstile_token?: string;
}

export interface RegisterResult {
  user: UserPublic;
  email_verification_sent: boolean;
  signup_bonus_pending_email_verification: boolean;
}

export interface ConfirmEmailVerificationResult {
  user: UserPublic;
  signup_bonus_granted: boolean;
  already_verified: boolean;
}

export const authApi = {
  login: (data: LoginInput) =>
    apiClient.post<{ data: UserPublic }>('/auth/login', data).then((r) => r.data.data),

  register: (data: RegisterInput) =>
    apiClient.post<{ data: RegisterResult }>('/auth/register', data).then((r) => r.data.data),

  logout: () =>
    apiClient.post('/auth/logout').then((r) => r.data),

  me: () =>
    apiClient.get<{ data: UserPublic }>('/auth/me').then((r) => r.data.data),

  resendEmailVerification: () =>
    apiClient.post<{ data: { sent: boolean; alreadyVerified: boolean } }>('/auth/verify-email/resend').then((r) => r.data.data),

  confirmEmailVerification: (data: { token: string; device_fingerprint?: string }) =>
    apiClient.post<{ data: ConfirmEmailVerificationResult }>('/auth/verify-email', data).then((r) => r.data.data),
};
