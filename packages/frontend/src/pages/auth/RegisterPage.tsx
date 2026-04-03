import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { OAuthButtons } from '../../components/auth/OAuthButtons';
import { TurnstileWidget } from '../../components/auth/TurnstileWidget';
import { Button, Input } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { getOrCreateDeviceFingerprint } from '../../lib/device-fingerprint';

function getRegisterErrorMessage(err: any): string {
  const responseError = err?.response?.data?.error;
  const usernameErrors = responseError?.details?.fieldErrors?.username;
  const emailErrors = responseError?.details?.fieldErrors?.email;
  const passwordErrors = responseError?.details?.fieldErrors?.password;

  if (Array.isArray(usernameErrors) && usernameErrors.length > 0) {
    return 'Логин может содержать только латинские буквы, цифры и _. Email сюда вводить не нужно.';
  }

  if (Array.isArray(emailErrors) && emailErrors.length > 0) {
    return 'Проверьте email: он должен быть в корректном формате.';
  }

  if (Array.isArray(passwordErrors) && passwordErrors.length > 0) {
    return 'Пароль должен быть длиной от 8 до 128 символов.';
  }

  return responseError?.message || 'Ошибка регистрации';
}

export function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [form, setForm] = useState({ email: '', password: '', name: '', username: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');

  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || '';
  const isTurnstileEnabled = Boolean(turnstileSiteKey);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isTurnstileEnabled && !turnstileToken) {
      setError('Подтвердите, что вы не робот');
      return;
    }

    setLoading(true);
    try {
      const result = await register({
        email: form.email,
        password: form.password,
        name: form.name || undefined,
        username: form.username || undefined,
        device_fingerprint: getOrCreateDeviceFingerprint(),
        turnstile_token: turnstileToken || undefined,
      });
      navigate(result.signup_bonus_pending_email_verification ? '/verify-email?sent=1' : '/');
    } catch (err: any) {
      setError(getRegisterErrorMessage(err));
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
              placeholder="Минимум 8 символов"
              required
              minLength={8}
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
            <p className="mt-1 text-xs text-muted-foreground">
              Необязательно. Только латинские буквы, цифры и <code>_</code>, без <code>@</code> и пробелов.
            </p>
          </div>

          {isTurnstileEnabled && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-3 text-xs uppercase tracking-[0.18em] text-slate-400">Проверка защиты</p>
              <TurnstileWidget
                siteKey={turnstileSiteKey}
                onVerify={(token) => {
                  setTurnstileToken(token);
                  setError('');
                }}
                onExpire={() => setTurnstileToken('')}
                onError={() => {
                  setTurnstileToken('');
                  setError('Не удалось загрузить защитную проверку');
                }}
              />
            </div>
          )}

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
