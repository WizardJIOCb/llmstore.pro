import { Link } from 'react-router-dom';
import { useAppSettings } from '../../hooks/useAppSettings';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';

function normalizeTelegramLink(value: string) {
  const handle = value.trim().replace(/^@+/, '');
  return `https://t.me/${handle}`;
}

function normalizePhoneLink(value: string) {
  const digits = value.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return `tel:${digits}`;
  if (digits.startsWith('8')) return `tel:+7${digits.slice(1)}`;
  return `tel:${digits}`;
}

export function ContactsPage() {
  const { data: settings } = useAppSettings();
  const legal = settings?.legal;
  const missingRequired = !legal?.business_name || !legal?.inn || !legal?.address;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-10 space-y-8">
      <section className="rounded-2xl border bg-white p-8">
        <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Контакты и реквизиты</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">Информация о продавце</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
          На этой странице размещены контактные данные и реквизиты продавца цифрового сервиса
          LLMStore.pro для пользователей и платёжных провайдеров.
        </p>
      </section>

      {missingRequired && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Для публикации полного набора реквизитов заполните юридические данные в `/admin/settings`.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Реквизиты</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">Продавец</p>
              <p className="font-medium">{legal?.business_name || 'Заполните в админке'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Статус</p>
              <p className="font-medium">{legal?.business_status || 'Заполните в админке'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">ИНН</p>
              <p className="font-medium">{legal?.inn || 'Заполните в админке'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">ОГРН / ОГРНИП</p>
              <p className="font-medium">{legal?.ogrn || 'Не указан'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Адрес</p>
              <p className="font-medium whitespace-pre-line">{legal?.address || 'Заполните в админке'}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Контакты</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">Email</p>
              <a className="font-medium text-primary hover:underline" href={`mailto:${legal?.support_email || settings?.topup.email || ''}`}>
                {legal?.support_email || settings?.topup.email || 'Заполните в админке'}
              </a>
            </div>
            <div>
              <p className="text-muted-foreground">Телефон</p>
              <a className="font-medium text-primary hover:underline" href={normalizePhoneLink(legal?.support_phone || settings?.topup.phone || '')}>
                {legal?.support_phone || settings?.topup.phone || 'Заполните в админке'}
              </a>
            </div>
            <div>
              <p className="text-muted-foreground">Telegram</p>
              <a
                className="font-medium text-primary hover:underline"
                href={normalizeTelegramLink(legal?.support_telegram || settings?.topup.telegram || '@llmstore')}
                target="_blank"
                rel="noreferrer"
              >
                {legal?.support_telegram || settings?.topup.telegram || 'Заполните в админке'}
              </a>
            </div>
            <div className="pt-2 text-muted-foreground">
              По вопросам условий использования и оплаты также смотрите <Link to="/offer" className="text-primary hover:underline">публичную оферту</Link>.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
