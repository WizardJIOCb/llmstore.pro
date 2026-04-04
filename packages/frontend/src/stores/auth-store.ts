import { create } from 'zustand';
import type { UserPublic } from '@llmstore/shared';
import { authApi, type RegisterResult } from '../lib/api/auth';

interface AuthState {
  user: UserPublic | null;
  isLoading: boolean;
  setUser: (user: UserPublic | null) => void;
  fetchMe: () => Promise<void>;
  login: (login: string, password: string) => Promise<UserPublic>;
  register: (data: {
    email: string;
    password: string;
    name?: string;
    username?: string;
    device_fingerprint?: string;
    turnstile_token?: string;
  }) => Promise<RegisterResult>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,

  setUser: (user) => set({ user }),

  fetchMe: async () => {
    try {
      const user = await authApi.me();
      set({ user, isLoading: false });
    } catch {
      set({ user: null, isLoading: false });
    }
  },

  login: async (login, password) => {
    const user = await authApi.login({ login, password });
    set({ user });
    return user;
  },

  register: async (data) => {
    const result = await authApi.register(data);
    set({ user: result.user });
    return result;
  },

  logout: async () => {
    await authApi.logout();
    set({ user: null });
  },
}));
