import { Link } from 'react-router-dom';
import { useAppSettings } from '../../hooks/useAppSettings';
import { usePaymentsConfig } from '../../hooks/usePayments';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { formatRubAmount, resolveTopUpAmounts } from '../../lib/payment-pricing';

export function OfferPage() {
  const { data: settings } = useAppSettings();
  const { data: paymentsConfig } = usePaymentsConfig();
  const legal = settings?.legal;
  const topUpAmounts = resolveTopUpAmounts(paymentsConfig?.preset_amounts_rub);
  const amountsLabel = topUpAmounts.map(formatRubAmount).join(', ');
  const customAmountLabel = paymentsConfig
    ? `${formatRubAmount(paymentsConfig.min_amount_rub)} - ${formatRubAmount(paymentsConfig.max_amount_rub)}`
    : null;

  return (
    <div className="container mx-auto max-w-4xl space-y-8 px-4 py-10">
      <section className="rounded-2xl border bg-white p-8">
        <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Публичная оферта</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">Условия использования и оплаты сервиса</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Настоящий документ определяет условия использования цифрового сервиса LLMStore.pro,
          а также порядок пополнения внутреннего баланса и предоставления доступа к платным функциям платформы.
        </p>
      </section>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>1. Предмет оферты</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
            <p>
              LLMStore.pro предоставляет пользователю доступ к цифровому онлайн-сервису для работы с AI-моделями,
              чатами, AI-агентами и связанными функциями платформы.
            </p>
            <p>
              Онлайн-оплата на сайте используется для пополнения внутреннего баланса аккаунта пользователя,
              который затем расходуется на платные функции сервиса внутри личного кабинета.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Что именно оплачивает пользователь</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
            <p>
              Пользователь оплачивает цифровую услугу по пополнению внутреннего баланса аккаунта на выбранную сумму.
            </p>
            <p>
              Пополненный баланс используется для работы с платными AI-моделями, запуска AI-агентов
              и других платных сценариев платформы, доступных в аккаунте пользователя.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Стоимость и фиксированные суммы</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
            <p>На сайте доступны фиксированные суммы пополнения: {amountsLabel}.</p>
            <p>
              Каждая из указанных сумм означает пополнение внутреннего баланса аккаунта на соответствующую сумму в рублях.
            </p>
            {customAmountLabel ? (
              <p>
                При необходимости пользователь может указать другую сумму пополнения в пределах {customAmountLabel}.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4. Порядок оформления и оплаты</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
            <p>
              Пользователь выбирает сумму пополнения и оплачивает её через подключённого платёжного провайдера YooKassa.
            </p>
            <p>
              Обязательство продавца по зачислению средств считается исполненным после успешного подтверждения платежа
              и автоматического пополнения баланса аккаунта пользователя.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>5. Порядок оказания услуги</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
            <p>Услуга предоставляется в электронном виде без физической доставки.</p>
            <p>
              После зачисления средств пользователь получает возможность использовать платные функции сервиса
              в личном кабинете LLMStore.pro.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>6. Возвраты и поддержка</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
            <p>
              Запросы по ошибочным списаниям, возвратам и спорным ситуациям рассматриваются продавцом индивидуально
              через контактные каналы, опубликованные на сайте.
            </p>
            <p>
              Для связи по вопросам оплаты и использования сервиса пользователь может воспользоваться email,
              телефоном или Telegram, указанными на странице контактов.
            </p>
          </CardContent>
        </Card>
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
            Подробные контакты и реквизиты также доступны на странице{' '}
            <Link to="/contacts" className="text-primary hover:underline">
              контактов
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
