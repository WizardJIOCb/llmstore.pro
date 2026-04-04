import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { OAuthButtons } from '../../components/auth/OAuthButtons';
import { Button, Input } from '../../components/ui';

function resolveSafeNextUrl(next: string | null): string | null {
  if (!next) return null;

  try {
    const nextUrl = new URL(next, window.location.origin);
    if (nextUrl.origin !== window.location.origin) return null;
    return nextUrl.toString();
  } catch {
    return null;
  }
}

export function LoginPage() {
  const navigate = useNavigate();
  const { login, fetchMe } = useAuth();
  const [searchParams] = useSearchParams();
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const redirectToNext = () => {
    const nextUrl = resolveSafeNextUrl(searchParams.get('next'));
    if (nextUrl) {
      window.location.assign(nextUrl);
      return;
    }

    navigate('/', { replace: true });
  };

  useEffect(() => {
    const oauthResult = searchParams.get('oauth');
    if (oauthResult === 'success') {
      fetchMe().then(() => redirectToNext());
    } else if (oauthResult === 'error') {
      setError(searchParams.get('message') || 'Ошибка OAuth авторизации');
    }
  }, [searchParams, fetchMe]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(loginValue, password);
      redirectToNext();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto flex max-w-md flex-col items-center px-4 py-16">
      <h1 className="mb-8 text-3xl font-bold">Вход</h1>

      <div className="w-full space-y-6">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <OAuthButtons />

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">��� �� email ��� ������</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Email или логин</label>
            <Input
              type="text"
              value={loginValue}
              onChange={(e) => setLoginValue(e.target.value)}
              placeholder="admin@llmstore.pro или wizard"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Пароль</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Введите пароль"
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Вход...' : 'Войти'}
          </Button>
        </form>
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        Нет аккаунта?{' '}
        <Link to="/register" className="text-primary hover:underline">
          Регистрация
        </Link>
      </p>
    </div>
  );
}
