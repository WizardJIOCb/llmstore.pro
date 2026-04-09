import { getOAuthLoginUrl } from '../../lib/api/profile';
import { getOrCreateDeviceFingerprint } from '../../lib/device-fingerprint';
import { cn } from '../../lib/utils';

const OAUTH_PROVIDERS = [
  {
    id: 'vk',
    label: 'VK',
    badge: 'VK',
    className:
      'border-cyan-300/26 bg-[linear-gradient(135deg,rgba(12,20,34,0.9),rgba(17,48,86,0.84))] text-white shadow-[0_0_0_1px_rgba(56,189,248,0.14),0_0_24px_rgba(56,189,248,0.1),inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-cyan-300/44 hover:bg-[linear-gradient(135deg,rgba(16,30,52,0.96),rgba(20,60,112,0.9))]',
    badgeClassName:
      'border-cyan-300/22 bg-sky-400/12 text-sky-100',
  },
  {
    id: 'yandex',
    label: 'Яндекс',
    badge: 'Я',
    className:
      'border-cyan-300/35 bg-[linear-gradient(135deg,rgba(12,20,34,0.94),rgba(15,32,44,0.88))] text-white shadow-[0_0_0_1px_rgba(103,232,249,0.14),0_0_22px_rgba(45,212,191,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-cyan-300/50 hover:bg-[linear-gradient(135deg,rgba(16,26,42,0.98),rgba(18,40,54,0.94))]',
    badgeClassName:
      'border-cyan-300/22 bg-red-400/12 text-sky-100',
  },
  {
    id: 'google',
    label: 'Google',
    badge: 'G',
    className:
      'border-white/12 bg-[linear-gradient(135deg,rgba(12,20,34,0.82),rgba(15,32,44,0.68))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-cyan-300/28 hover:bg-[linear-gradient(135deg,rgba(16,26,42,0.94),rgba(18,40,54,0.88))]',
    badgeClassName:
      'border-white/12 bg-white/8 text-white/90',
  },
] as const;

export function OAuthButtons({ next = null }: { next?: string | null }) {
  const deviceFingerprint = getOrCreateDeviceFingerprint();

  return (
    <div className="space-y-2.5">
      {OAUTH_PROVIDERS.map((provider) => (
        <a
          key={provider.id}
          href={getOAuthLoginUrl(provider.id, deviceFingerprint, next)}
          className={cn(
            'group flex min-h-12 w-full items-center justify-center gap-3 rounded-[18px] border px-4 py-3 text-sm font-semibold tracking-[-0.015em] transition-all duration-200 hover:text-white hover:shadow-[0_0_0_1px_rgba(103,232,249,0.16),0_0_28px_rgba(45,212,191,0.14)]',
            provider.className,
          )}
        >
          <span
            className={cn(
              'inline-flex h-7 min-w-7 items-center justify-center rounded-full border px-2 text-[0.78rem] font-bold leading-none',
              provider.badgeClassName,
            )}
            aria-hidden="true"
          >
            {provider.badge}
          </span>
          <span>Войти через {provider.label}</span>
        </a>
      ))}
    </div>
  );
}
