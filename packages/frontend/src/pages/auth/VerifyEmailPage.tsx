import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { useAuth } from '../../hooks/useAuth';
import { authApi } from '../../lib/api/auth';
import { getOrCreateDeviceFingerprint } from '../../lib/device-fingerprint';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const { fetchMe, isAuthenticated } = useAuth();
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [signupBonusGranted, setSignupBonusGranted] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const token = searchParams.get('token')?.trim() || '';
  const sent = searchParams.get('sent') === '1';

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    async function confirm() {
      setStatus('loading');
      setMessage('');

      try {
        const result = await authApi.confirmEmailVerification({
          token,
          device_fingerprint: getOrCreateDeviceFingerprint(),
        });
        if (cancelled) return;
        setStatus('success');
        setSignupBonusGranted(result.signup_bonus_granted);
        setMessage(
          result.already_verified
            ? 'Email уже был подтверждён раньше.'
            : 'Email подтверждён. Аккаунт полностью активирован.',
        );
        await fetchMe();
      } catch (err: any) {
        if (cancelled) return;
        setStatus('error');
        setMessage(err.response?.data?.error?.message || 'Не удалось подтвердить email.');
      }
    }

    void confirm();

    return () => {
      cancelled = true;
    };
  }, [fetchMe, token]);

  const handleResend = async () => {
    setResending(true);
    try {
      const result = await authApi.resendEmailVerification();
      setResent(result.sent);
      setMessage(
        result.alreadyVerified
          ? 'Email уже подтверждён.'
          : 'Новое письмо отправлено. Проверьте входящие.',
      );
    } catch (err: any) {
      setMessage(err.response?.data?.error?.message || 'Не удалось отправить письмо повторно.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="container mx-auto flex max-w-2xl flex-col px-4 py-16">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Подтверждение email</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          {token ? 'Проверяем ссылку' : 'Письмо почти у вас'}
        </h1>

        {token ? (
          <div className="mt-6 space-y-4">
            {status === 'loading' ? (
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                <Spinner />
                Подтверждаем email и проверяем бонус...
              </div>
            ) : (
              <div
                className={`rounded-2xl border px-4 py-4 text-sm ${
                  status === 'success'
                    ? 'border-green-200 bg-green-50 text-green-900'
                    : 'border-red-200 bg-red-50 text-red-900'
                }`}
              >
                {message}
              </div>
            )}

            {status === 'success' && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
                {signupBonusGranted
                  ? 'Стартовый бонус начислен. Можно сразу переходить к агентам и чатам.'
                  : 'Если бонус уже был получен раньше с этого IP или устройства, повторно он не начисляется, но email подтверждён успешно.'}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
              {sent
                ? 'Мы уже отправили письмо со ссылкой подтверждения. После клика по ней стартовый бонус начислится автоматически.'
                : 'Откройте письмо со ссылкой подтверждения, чтобы завершить активацию аккаунта и получить стартовый бонус.'}
            </div>

            {message ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700">
                {message}
              </div>
            ) : null}

            {isAuthenticated ? (
              <Button onClick={handleResend} disabled={resending}>
                {resending ? 'Отправляю письмо...' : resent ? 'Отправить ещё раз' : 'Отправить письмо повторно'}
              </Button>
            ) : null}
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/">
            <Button variant="outline">На главную</Button>
          </Link>
          <Link to="/my/agents">
            <Button>Перейти к агентам</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
