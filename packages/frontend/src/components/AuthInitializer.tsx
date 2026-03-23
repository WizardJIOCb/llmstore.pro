import { useEffect } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { Spinner } from './ui';

export function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { isLoading, fetchMe } = useAuthStore();

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return <>{children}</>;
}
