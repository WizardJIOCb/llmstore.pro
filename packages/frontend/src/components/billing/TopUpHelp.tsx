import type { AppSettings } from '../../lib/api/app';

function normalizeTelegramLink(value: string): string {
  const handle = value.trim().replace(/^@+/, '');
  return `https://t.me/${handle}`;
}

function normalizePhoneLink(value: string): string {
  const digits = value.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return `tel:${digits}`;
  if (digits.startsWith('8')) return `tel:+7${digits.slice(1)}`;
  return `tel:${digits}`;
}

interface TopUpHelpProps {
  settings: AppSettings | undefined;
  className?: string;
}

export function TopUpHelp({ settings, className }: TopUpHelpProps) {
  const topup = settings?.topup;

  const message = topup?.message || 'У вас не осталось баланса. Скоро вы сможете пополнить его на сайте, а пока можете написать Родиону:';
  const telegram = topup?.telegram || '@WizardJIOCb';
  const email = topup?.email || 'rodion89@list.ru';
  const phone = topup?.phone || '89264769929';

  return (
    <div className={className}>
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="rounded-md border bg-muted/40 px-3 py-3 text-sm">
        <div className="flex flex-col gap-1">
          <a className="text-primary hover:underline" href={normalizeTelegramLink(telegram)} target="_blank" rel="noreferrer">
            Telegram: {telegram}
          </a>
          <a className="text-primary hover:underline" href={`mailto:${email}`}>
            Email: {email}
          </a>
          <a className="text-primary hover:underline" href={normalizePhoneLink(phone)}>
            Телефон: {phone}
          </a>
        </div>
      </div>
    </div>
  );
}
