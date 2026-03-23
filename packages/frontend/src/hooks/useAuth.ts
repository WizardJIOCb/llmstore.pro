import { useAuthStore } from '../stores/auth-store';

export function useAuth() {
  const { user, isLoading, login, register, logout } = useAuthStore();
  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin' || user?.role === 'curator',
    login,
    register,
    logout,
  };
}
