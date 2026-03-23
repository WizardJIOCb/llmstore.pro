import { create } from 'zustand';
import type { UserPublic } from '@llmstore/shared';
import { authApi } from '../lib/api/auth';

interface AuthState {
  user: UserPublic | null;
  isLoading: boolean;
  setUser: (user: UserPublic | null) => void;
  fetchMe: () => Promise<void>;
  login: (email: string, password: string) => Promise<UserPublic>;
  register: (data: { email: string; password: string; name?: string; username?: string }) => Promise<UserPublic>;
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

  login: async (email, password) => {
    const user = await authApi.login({ email, password });
    set({ user });
    return user;
  },

  register: async (data) => {
    const user = await authApi.register(data);
    set({ user });
    return user;
  },

  logout: async () => {
    await authApi.logout();
    set({ user: null });
  },
}));
