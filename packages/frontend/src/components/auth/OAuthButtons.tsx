import { getOAuthLoginUrl } from '../../lib/api/profile';

const OAUTH_PROVIDERS = [
  { id: 'google', label: 'Google', color: 'bg-white border border-input text-foreground hover:bg-gray-50' },
  { id: 'vk', label: 'VK', color: 'bg-[#0077FF] text-white hover:bg-[#0066DD]' },
  { id: 'yandex', label: 'Яндекс', color: 'bg-[#FC3F1D] text-white hover:bg-[#E03010]' },
  { id: 'mailru', label: 'Mail.ru', color: 'bg-[#005FF9] text-white hover:bg-[#004DD6]' },
];

export function OAuthButtons() {
  return (
    <div className="space-y-2">
      {OAUTH_PROVIDERS.map((p) => (
        <a
          key={p.id}
          href={getOAuthLoginUrl(p.id)}
          className={`flex h-10 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors ${p.color}`}
        >
          Войти через {p.label}
        </a>
      ))}
    </div>
  );
}
