import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Button, Input } from '../../components/ui';
import { OAuthButtons } from '../../components/auth/OAuthButtons';

export function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [form, setForm] = useState({ email: '', password: '', name: '', username: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register({
        email: form.email,
        password: form.password,
        name: form.name || undefined,
        username: form.username || undefined,
      });
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <div className="container mx-auto flex max-w-md flex-col items-center px-4 py-16">
      <h1 className="mb-8 text-3xl font-bold">Регистрация</h1>

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
            <label className="mb-1 block text-sm font-medium">Email *</label>
            <Input
              type="email"
              value={form.email}
              onChange={update('email')}
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Пароль *</label>
            <Input
              type="password"
              value={form.password}
              onChange={update('password')}
              placeholder="Минимум 6 символов"
              required
              minLength={6}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Имя</label>
            <Input
              value={form.name}
              onChange={update('name')}
              placeholder="Ваше имя"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Логин</label>
            <Input
              value={form.username}
              onChange={update('username')}
              placeholder="username"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
          </Button>
        </form>
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        Уже есть аккаунт?{' '}
        <Link to="/login" className="text-primary hover:underline">
          Войти
        </Link>
      </p>
    </div>
  );
}
