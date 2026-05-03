import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { GalleryPreviewItem } from '../../lib/api/chats';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { useGalleryPreviews } from '../../hooks/useChats';
import { useAppSettings } from '../../hooks/useAppSettings';
import { usePaymentsConfig } from '../../hooks/usePayments';
import { formatRubAmount, resolveTopUpAmounts } from '../../lib/payment-pricing';

const PAID_SERVICE_EXAMPLES = [
  {
    title: 'Чаты с AI-моделями',
    description:
      'Пользователь пополняет баланс и использует его для работы с платными AI-моделями внутри личного кабинета.',
  },
  {
    title: 'Запуск и тестирование AI-агентов',
    description:
      'Баланс расходуется на запуск настроенных AI-агентов, проверку ответов и прикладные сценарии платформы.',
  },
  {
    title: 'Инструменты и автоматизации',
    description:
      'Баланс используется в сценариях, где агент работает с подключёнными инструментами и платными возможностями сервиса.',
  },
];

const BALANCE_SCENARIO_EXAMPLES = [
  {
    label: 'Короткий чат',
    title: 'Лёгкая операция',
    description: 'Один вопрос, небольшая правка текста или короткое объяснение обычно расходуют совсем небольшую часть баланса.',
  },
  {
    label: 'Правка результата',
    title: 'Итерации считаются отдельно',
    description: 'Если вы просите переписать блок, изменить структуру или уточнить ответ, списание зависит от новой операции.',
  },
  {
    label: 'Preview или demo',
    title: 'Стоимость зависит от контекста',
    description: 'HTML-preview, проект или агентный сценарий могут стоить по-разному: влияет модель, длина диалога и число запусков.',
  },
  {
    label: 'Длинная задача',
    title: 'Баланс как запас',
    description: 'Большое пополнение не является ценой одной задачи. Это запас для нескольких операций, которые видны в истории.',
  },
];

const COST_VARIATION_REASONS = [
  'разные модели стоят по-разному за input и output токены;',
  'длинный контекст, вложения и большие ответы увеличивают расход;',
  'запуски preview, анализ ошибок и повторные итерации списываются отдельно;',
  'финальная стоимость видна в истории операций и зависит от фактического использования.',
];

function buildGalleryPreviewUrl(item: GalleryPreviewItem): string | null {
  if (!item.preview_url) return null;

  try {
    const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://llmstore.pro';
    const url = new URL(item.preview_url, baseOrigin);
    url.searchParams.set('gallery', '1');
    url.searchParams.set('previewId', `pricing-${item.message_id}`);
    return url.toString();
  } catch {
    return item.preview_url;
  }
}

function formatLandingRubCost(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 ₽';
  if (value < 0.01) return '<0.01 ₽';

  return `${value.toLocaleString('ru-RU', {
    minimumFractionDigits: value < 10 ? 2 : 0,
    maximumFractionDigits: 2,
  })} ₽`;
}

function formatLandingUsdCost(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '$0';
  if (value < 0.0001) return '<$0.0001';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(3)}`;
}

function formatViews(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

function formatModelName(model: string | null): string | null {
  if (!model) return null;
  const trimmed = model.trim();
  if (!trimmed) return null;
  const lastPart = trimmed.split('/').pop()?.trim();
  return lastPart && lastPart.length > 0 ? lastPart : trimmed;
}

function selectLandingExamples(items: GalleryPreviewItem[]): GalleryPreviewItem[] {
  return [...items]
    .filter((item) => (item.kind === 'preview' || item.kind === 'hybrid') && Boolean(item.preview_url))
    .sort((left, right) => {
      const rubCostDiff = right.total_rub_cost - left.total_rub_cost;
      if (Math.abs(rubCostDiff) > 0.001) return rubCostDiff;

      const viewsDiff = right.total_view_count - left.total_view_count;
      if (viewsDiff !== 0) return viewsDiff;

      return Date.parse(right.created_at) - Date.parse(left.created_at);
    })
    .slice(0, 4);
}

function LandingExampleFrame({ item }: { item: GalleryPreviewItem }) {
  const previewUrl = buildGalleryPreviewUrl(item);

  if (item.preview_type === 'html' && previewUrl) {
    return (
      <iframe
        title={item.preview_title || item.chat_title}
        src={previewUrl}
        className="h-full w-full bg-white"
        sandbox="allow-scripts"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  }

  if (previewUrl) {
    return (
      <a
        href={previewUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-full items-center justify-center bg-[linear-gradient(135deg,#0f172a,#111827_52%,#1e293b)] px-6 text-center text-sm font-medium text-white"
      >
        Открыть preview этого лендинга
      </a>
    );
  }

  return (
    <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,#0f172a,#111827_52%,#1e293b)] px-6 text-center text-sm text-slate-200">
      Preview недоступен, но пример можно открыть через галерею.
    </div>
  );
}

export function PricingPage() {
  const { data: settings } = useAppSettings();
  const { data: paymentsConfig } = usePaymentsConfig();
  const { data: galleryItems, isLoading: galleryLoading } = useGalleryPreviews(120);
  const topUpAmounts = resolveTopUpAmounts(paymentsConfig?.preset_amounts_rub);
  const amountsLabel = topUpAmounts.map(formatRubAmount).join(', ');
  const customAmountLabel = paymentsConfig
    ? `${formatRubAmount(paymentsConfig.min_amount_rub)} - ${formatRubAmount(paymentsConfig.max_amount_rub)}`
    : null;
  const landingExamples = useMemo(
    () => selectLandingExamples(galleryItems ?? []),
    [galleryItems],
  );

  return (
    <div className="container mx-auto max-w-5xl space-y-8 px-4 py-10">
      <section className="rounded-2xl border bg-gradient-to-br from-slate-50 via-white to-emerald-50 p-8">
        <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Оплата и тарифы</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">Пополнение баланса LLMStore.pro</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
          Онлайн-оплата на сайте предназначена для цифровой услуги: пополнения внутреннего баланса аккаунта
          LLMStore.pro. Пополненный баланс используется для доступа к платным функциям сервиса внутри аккаунта.
        </p>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">
          На странице оплаты доступны фиксированные суммы пополнения: {amountsLabel}.
          {customAmountLabel ? ` При необходимости пользователь может указать другую сумму в пределах ${customAmountLabel}.` : ''}
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>1. Что оплачивается онлайн</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Пользователь оплачивает пополнение внутреннего баланса аккаунта на выбранную фиксированную сумму.</p>
            <p>Это цифровая услуга без физической доставки и без офлайн-выдачи товара.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Что получает пользователь</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>После оплаты средства автоматически зачисляются на баланс аккаунта пользователя в LLMStore.pro.</p>
            <p>Баланс сразу доступен для оплаты платных функций сервиса внутри личного кабинета.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Где используется баланс</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Баланс используется в чатах с AI-моделями, при запуске AI-агентов и в связанных платных сценариях платформы.</p>
            <p>История операций и текущее состояние баланса отображаются в профиле пользователя.</p>
          </CardContent>
        </Card>
      </section>

      {(galleryLoading || landingExamples.length > 0) && (
        <section className="space-y-4">
          <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#f8fafc,#ffffff_45%,#ecfdf5)] p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.35)]">
            <div>
              <p className="text-sm uppercase tracking-[0.22em] text-slate-500">Примеры лендингов</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                Что получается на платформе и сколько это стоило
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                Ниже реальные публичные preview из галереи LLMStore.pro. Стоимость на карточке показывает
                фактическую цену чата, в котором собирался этот лендинг: она зависит от модели, длины диалога
                и количества итераций.
              </p>
              <Link
                to="/gallery"
                className="mt-4 inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-50"
              >
                Открыть всю галерею
              </Link>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {galleryLoading
              ? Array.from({ length: 4 }, (_, index) => (
                <div key={`landing-skeleton-${index}`} className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                  <div className="aspect-[16/10] animate-pulse bg-slate-100" />
                  <div className="space-y-4 p-5">
                    <div className="h-24 animate-pulse rounded-2xl bg-emerald-50" />
                    <div className="h-6 w-3/4 animate-pulse rounded bg-slate-100" />
                    <div className="h-16 animate-pulse rounded bg-slate-100" />
                  </div>
                </div>
              ))
              : landingExamples.map((item) => {
                const previewUrl = buildGalleryPreviewUrl(item);
                const modelName = formatModelName(item.model);
                const title = item.preview_title || item.chat_title;

                return (
                  <article
                    key={item.message_id}
                    className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_60px_-44px_rgba(15,23,42,0.28)]"
                  >
                    <div className="relative aspect-[16/10] overflow-hidden border-b border-slate-200 bg-slate-100">
                      <LandingExampleFrame item={item} />
                      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
                        <span className="rounded-full border border-white/50 bg-white/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-700 backdrop-blur">
                          Лендинг
                        </span>
                        <span className="rounded-full border border-white/50 bg-white/80 px-3 py-1 text-[11px] font-medium text-slate-700 backdrop-blur">
                          {formatViews(item.total_view_count)} просмотров
                        </span>
                      </div>
                    </div>

                    <div className="space-y-4 p-5">
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Фактический расход по истории</p>
                        <p className="mt-2 text-2xl font-semibold tracking-tight text-emerald-950">
                          {formatLandingRubCost(item.total_rub_cost)}
                        </p>
                        <p className="mt-1 text-sm text-emerald-800">
                          {formatLandingUsdCost(item.total_usd_cost)} за весь чат с preview, не цена одного запуска
                        </p>
                      </div>

                      <div>
                        <h3 className="text-xl font-semibold tracking-tight text-slate-950">{title}</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          Публичный пример из галереи: можно открыть preview и посмотреть чат, в котором был собран этот лендинг.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                        <span className="rounded-full border bg-slate-50 px-2.5 py-1">
                          Сообщений: {formatViews(item.message_count)}
                        </span>
                        <span className="rounded-full border bg-slate-50 px-2.5 py-1">
                          Автор: {item.author_name}
                        </span>
                        {modelName ? (
                          <span className="rounded-full border bg-slate-50 px-2.5 py-1">
                            Модель: {modelName}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {previewUrl ? (
                          <a
                            href={previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                          >
                            Открыть preview
                          </a>
                        ) : null}

                        <a
                          href={item.chat_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-50"
                        >
                          Открыть чат
                        </a>
                      </div>
                    </div>
                  </article>
                );
              })}
          </div>
        </section>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Фиксированные цены на сайте</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Ниже приведены готовые примеры оплаты, которые пользователь может выбрать на странице пополнения баланса.
          </p>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {topUpAmounts.map((amount) => (
              <div key={amount} className="rounded-2xl border bg-background p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Фиксированная сумма</p>
                <p className="mt-2 text-2xl font-semibold">{formatRubAmount(amount)}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Пополнение внутреннего баланса аккаунта на {formatRubAmount(amount)} для использования платных функций сервиса.
                </p>
              </div>
            ))}
          </div>

          {customAmountLabel ? (
            <p className="text-xs text-muted-foreground">
              Дополнительно пользователь может ввести другую сумму пополнения в пределах {customAmountLabel}.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <section className="rounded-2xl border bg-[linear-gradient(135deg,#f8fafc,#ffffff_48%,#eefcf5)] p-6">
        <div className="max-w-3xl">
          <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Как читать баланс</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Пополнение не равно цене одного сценария
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Баланс работает как кошелёк внутри аккаунта. Из него постепенно списываются фактические операции:
            запросы к моделям, генерации, preview, агентные запуски и повторные правки.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {BALANCE_SCENARIO_EXAMPLES.map((example) => (
            <article key={example.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">
                {example.label}
              </p>
              <h3 className="mt-3 text-lg font-semibold text-slate-950">{example.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{example.description}</p>
            </article>
          ))}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Почему расход может отличаться</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          {COST_VARIATION_REASONS.map((reason, index) => (
            <p key={reason}>
              {index + 1}. {reason}
            </p>
          ))}
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-3">
        {PAID_SERVICE_EXAMPLES.map((example) => (
          <Card key={example.title}>
            <CardHeader>
              <CardTitle>{example.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>{example.description}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Как пользователь получает услугу</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>1. Пользователь выбирает одну из фиксированных сумм и оплачивает её через YooKassa.</p>
            <p>2. После события `payment.succeeded` баланс аккаунта автоматически пополняется.</p>
            <p>3. Сразу после зачисления пользователь может пользоваться платными функциями платформы в своём аккаунте.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Документы и поддержка</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Условия использования и оплаты опубликованы в{' '}
              <Link to="/offer" className="text-primary hover:underline">
                публичной оферте
              </Link>
              .
            </p>
            <p>
              Контакты и реквизиты продавца опубликованы на странице{' '}
              <Link to="/contacts" className="text-primary hover:underline">
                контактов и реквизитов
              </Link>
              .
            </p>
            <p>
              Для связи по вопросам оплаты используйте:{' '}
              {settings?.legal.support_email || settings?.topup.email || 'support@llmstore.pro'}.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
