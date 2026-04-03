import { Link } from 'react-router-dom';
import { useAppSettings } from '../../hooks/useAppSettings';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';

const SECTIONS = [
  {
    title: '1. Предмет оферты',
    paragraphs: [
      'LLMStore.pro предоставляет пользователю доступ к цифровому онлайн-сервису для работы с AI-моделями, чатами, AI-агентами и связанными функциями платформы.',
      'Оплата на сайте используется для пополнения внутреннего баланса аккаунта пользователя, который затем расходуется на платные функции сервиса.',
    ],
  },
  {
    title: '2. Порядок оформления и оплаты',
    paragraphs: [
      'Пользователь выбирает сумму пополнения и оплачивает её через подключённого платёжного провайдера YooKassa.',
      'Обязательство продавца по зачислению средств считается исполненным после успешного подтверждения платежа и автоматического пополнения баланса аккаунта пользователя.',
    ],
  },
  {
    title: '3. Порядок оказания услуги',
    paragraphs: [
      'Услуга предоставляется в электронном виде без физической доставки.',
      'После зачисления средств пользователь получает возможность использовать функции сервиса в личном кабинете LLMStore.pro.',
    ],
  },
  {
    title: '4. Ответственность пользователя',
    paragraphs: [
      'Пользователь самостоятельно обеспечивает корректность данных своего аккаунта и соблюдение правил использования платформы.',
      'Запрещается использовать сервис в противоправных целях и нарушать применимое законодательство.',
    ],
  },
  {
    title: '5. Возвраты и поддержка',
    paragraphs: [
      'Запросы по ошибочным списаниям, возвратам и спорным ситуациям рассматриваются продавцом индивидуально через контактные каналы, опубликованные на сайте.',
      'Для связи по вопросам оплаты и использования сервиса пользователь может воспользоваться email, телефоном или Telegram, указанными на странице контактов.',
    ],
  },
];

export function OfferPage() {
  const { data: settings } = useAppSettings();
  const legal = settings?.legal;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-10 space-y-8">
      <section className="rounded-2xl border bg-white p-8">
        <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Публичная оферта</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">Условия использования и оплаты сервиса</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Настоящий документ определяет условия использования цифрового сервиса LLMStore.pro,
          а также порядок пополнения внутреннего баланса и предоставления доступа к платным функциям платформы.
        </p>
      </section>

      <div className="space-y-4">
        {SECTIONS.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Реквизиты и контакты продавца</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p><span className="text-muted-foreground">Продавец:</span> {legal?.business_name || 'Заполните в админке'}</p>
          <p><span className="text-muted-foreground">Статус:</span> {legal?.business_status || 'Заполните в админке'}</p>
          <p><span className="text-muted-foreground">ИНН:</span> {legal?.inn || 'Заполните в админке'}</p>
          <p><span className="text-muted-foreground">ОГРН / ОГРНИП:</span> {legal?.ogrn || 'Не указан'}</p>
          <p><span className="text-muted-foreground">Email:</span> {legal?.support_email || settings?.topup.email || 'Заполните в админке'}</p>
          <p><span className="text-muted-foreground">Телефон:</span> {legal?.support_phone || settings?.topup.phone || 'Заполните в админке'}</p>
          <p><span className="text-muted-foreground">Адрес:</span> {legal?.address || 'Заполните в админке'}</p>
          <p className="pt-2 text-muted-foreground">
            Подробные контакты и реквизиты также доступны на странице <Link to="/contacts" className="text-primary hover:underline">контактов</Link>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
