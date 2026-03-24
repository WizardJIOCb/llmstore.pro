import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Button, Input } from '../../components/ui';
import { OAuthButtons } from '../../components/auth/OAuthButtons';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, fetchMe } = useAuth();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Handle OAuth callback redirect
  useEffect(() => {
    const oauthResult = searchParams.get('oauth');
    if (oauthResult === 'success') {
      fetchMe().then(() => navigate('/', { replace: true }));
    } else if (oauthResult === 'error') {
      setError(searchParams.get('message') || 'Ошибка OAuth авторизации');
    }
  }, [searchParams, fetchMe, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
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
            <span className="bg-background px-2 text-muted-foreground">или по email</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@llmstore.pro"
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
