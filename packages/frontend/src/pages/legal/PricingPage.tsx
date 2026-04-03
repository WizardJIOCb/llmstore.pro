import { Link } from 'react-router-dom';
import { useAppSettings } from '../../hooks/useAppSettings';
import { usePaymentsConfig } from '../../hooks/usePayments';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';

export function PricingPage() {
  const { data: settings } = useAppSettings();
  const { data: paymentsConfig } = usePaymentsConfig();
  const presetAmounts = paymentsConfig?.preset_amounts_rub ?? [500, 1000, 3000];

  return (
    <div className="container mx-auto max-w-5xl px-4 py-10 space-y-8">
      <section className="rounded-2xl border bg-gradient-to-br from-slate-50 via-white to-emerald-50 p-8">
        <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Оплата и тарифы</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">Пополнение баланса LLMStore.pro</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
          LLMStore.pro предоставляет доступ к цифровому онлайн-сервису: чатам с AI-моделями,
          запуску и тестированию AI-агентов, а также связанным функциям платформы. Пользователь
          пополняет внутренний баланс, после чего может расходовать его на использование сервиса.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>1. Что оплачивает пользователь</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Пополнение внутреннего баланса аккаунта в LLMStore.pro на выбранную сумму.</p>
            <p>Баланс используется для доступа к платным функциям сервиса и списывается по факту использования.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Как оказывается услуга</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>После подтверждения оплаты через YooKassa средства автоматически зачисляются на баланс аккаунта.</p>
            <p>Доставка не требуется: услуга предоставляется в электронном виде внутри сайта.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Где использовать баланс</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Баланс используется в разделе профиля, в чатах, при запуске AI-агентов и других платных сценариях платформы.</p>
            <p>История операций и текущее состояние баланса отображаются в профиле пользователя.</p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Доступные суммы пополнения</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Пользователь может выбрать одну из готовых сумм или ввести произвольную сумму в рублях
            в пределах, указанных на странице пополнения.
          </p>
          <div className="flex flex-wrap gap-2">
            {presetAmounts.map((amount) => (
              <span key={amount} className="rounded-full border px-4 py-2 text-sm font-medium">
                {amount.toLocaleString('ru-RU')} ₽
              </span>
            ))}
          </div>
          {paymentsConfig && (
            <p className="text-xs text-muted-foreground">
              Диапазон пополнения: от {paymentsConfig.min_amount_rub} до {paymentsConfig.max_amount_rub} ₽.
            </p>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Как получить услугу после оплаты</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>1. Пользователь оплачивает выбранную сумму через YooKassa.</p>
            <p>2. После события `payment.succeeded` баланс аккаунта автоматически пополняется.</p>
            <p>3. Пользователь сразу может пользоваться функциями платформы в своём аккаунте.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Документы и поддержка</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Условия использования и оплаты опубликованы в <Link to="/offer" className="text-primary hover:underline">публичной оферте</Link>.
            </p>
            <p>
              Контакты и реквизиты продавца опубликованы на странице <Link to="/contacts" className="text-primary hover:underline">контактов и реквизитов</Link>.
            </p>
            <p>
              Для связи по вопросам оплаты используйте: {settings?.legal.support_email || settings?.topup.email || 'support@llmstore.pro'}.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
