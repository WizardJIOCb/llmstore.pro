import { useMemo, useState } from 'react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import { useAdminPayments } from '../../hooks/useAdmin';
import type { AdminPaymentDailyPoint, AdminPaymentItem, AdminPaymentsParams } from '../../lib/api/admin';

const PRESET_DAYS = [7, 30, 90, 180, 365];
const PER_PAGE = 25;

type PaymentStatusFilter = NonNullable<AdminPaymentsParams['status']>;

const STATUS_OPTIONS = [
  { value: 'all', label: 'Все статусы' },
  { value: 'succeeded', label: 'Успешные' },
  { value: 'pending', label: 'Ожидают оплаты' },
  { value: 'waiting_for_capture', label: 'Ожидают подтверждения' },
  { value: 'canceled', label: 'Отменены' },
  { value: 'creation_failed', label: 'Ошибка создания' },
];

const PROVIDER_OPTIONS = [
  { value: 'all', label: 'Все провайдеры' },
  { value: 'yookassa', label: 'YooKassa' },
];

const STATUS_LABELS: Record<string, string> = {
  succeeded: 'Успешно',
  pending: 'Ожидает',
  waiting_for_capture: 'Ожидает capture',
  canceled: 'Отменен',
  creation_failed: 'Ошибка создания',
};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function formatDateInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getPresetRange(days: number) {
  const today = new Date();
  return {
    from: formatDateInput(addDays(today, -(days - 1))),
    to: formatDateInput(today),
  };
}

function getActivePreset(from: string, to: string) {
  for (const days of PRESET_DAYS) {
    const preset = getPresetRange(days);
    if (preset.from === from && preset.to === to) return days;
  }

  return null;
}

function formatDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
}

function formatDateTime(value: string | null) {
  if (!value) return 'Не было';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRub(value: number) {
  return `${value.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ₽`;
}

function formatUsd(value: number) {
  return `$${value.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  })}`;
}

function formatPercent(value: number | null) {
  if (value === null) return 'Нет данных';
  return `${value.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
}

function statusBadgeVariant(status: string): 'success' | 'warning' | 'destructive' | 'outline' {
  if (status === 'succeeded') return 'success';
  if (status === 'pending' || status === 'waiting_for_capture') return 'warning';
  if (status === 'canceled' || status === 'creation_failed') return 'destructive';
  return 'outline';
}

function getUserLabel(payment: AdminPaymentItem) {
  if (!payment.user) return payment.user_id;
  return payment.user.name || payment.user.username || payment.user.email;
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function PaymentsBarChart({ data }: { data: AdminPaymentDailyPoint[] }) {
  const maxAmount = Math.max(...data.map((point) => point.succeeded_amount_rub), 1);
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));
  const chartWidth = Math.max(720, data.length * 18);

  return (
    <div className="overflow-x-auto">
      <div className="flex h-72 min-w-full items-end gap-1 border-b border-slate-200 pb-9" style={{ width: chartWidth }}>
        {data.map((point, index) => {
          const height = point.succeeded_amount_rub > 0
            ? Math.max(4, (point.succeeded_amount_rub / maxAmount) * 100)
            : 0;
          const showLabel = index === 0 || index === data.length - 1 || index % labelEvery === 0;

          return (
            <div key={point.date} className="group relative flex h-full min-w-3 flex-1 items-end justify-center">
              <div
                className="w-full max-w-5 rounded-t bg-emerald-500 transition-colors group-hover:bg-emerald-600"
                style={{ height: `${height}%` }}
                title={`${point.date}: ${formatRub(point.succeeded_amount_rub)}, успешных платежей: ${point.succeeded_count}`}
              />

              {point.pending_count > 0 ? (
                <span
                  className="absolute top-2 h-1.5 w-1.5 rounded-full bg-amber-500"
                  title={`Ожидают оплаты: ${point.pending_count}`}
                />
              ) : null}

              {showLabel ? (
                <span className="absolute -bottom-7 whitespace-nowrap text-[11px] text-muted-foreground">
                  {formatDate(point.date)}
                </span>
              ) : null}

              <div className="pointer-events-none absolute bottom-full z-20 mb-2 hidden w-52 rounded-lg border bg-background p-3 text-xs shadow-xl group-hover:block">
                <p className="font-semibold text-foreground">{formatDate(point.date)}</p>
                <p className="mt-2 text-muted-foreground">Оплачено: {formatRub(point.succeeded_amount_rub)}</p>
                <p className="text-muted-foreground">Платежей: {point.succeeded_count} из {point.total_count}</p>
                <p className="text-muted-foreground">В ожидании: {point.pending_count}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PaymentsTable({
  payments,
}: {
  payments: AdminPaymentItem[];
}) {
  if (payments.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        В выбранном срезе платежей нет.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[1040px] text-left text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Дата</th>
            <th className="px-4 py-3 font-medium">Статус</th>
            <th className="px-4 py-3 font-medium">Пользователь</th>
            <th className="px-4 py-3 font-medium">Сумма</th>
            <th className="px-4 py-3 font-medium">Провайдер</th>
            <th className="px-4 py-3 font-medium">Описание</th>
            <th className="px-4 py-3 font-medium">ID платежа</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {payments.map((payment) => (
            <tr key={payment.id} className="align-top">
              <td className="px-4 py-3">
                <div className="font-medium text-foreground">{formatDateTime(payment.paid_at ?? payment.created_at)}</div>
                <div className="text-xs text-muted-foreground">Создан: {formatDateTime(payment.created_at)}</div>
              </td>
              <td className="px-4 py-3">
                <Badge variant={statusBadgeVariant(payment.status)}>
                  {STATUS_LABELS[payment.status] ?? payment.status}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <div className="max-w-56 truncate font-medium text-foreground" title={getUserLabel(payment)}>
                  {getUserLabel(payment)}
                </div>
                <div className="max-w-56 truncate text-xs text-muted-foreground" title={payment.user?.email ?? payment.user_id}>
                  {payment.user?.email ?? payment.user_id}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="font-semibold text-foreground">{formatRub(payment.amount_rub)}</div>
                <div className="text-xs text-muted-foreground">{formatUsd(payment.amount_usd)} по {payment.usd_to_rub_rate.toLocaleString('ru-RU')}</div>
              </td>
              <td className="px-4 py-3">
                <div className="font-medium text-foreground">{payment.provider}</div>
                {payment.confirmation_url ? (
                  <a
                    href={payment.confirmation_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    Ссылка оплаты
                  </a>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <div className="max-w-64 whitespace-normal text-muted-foreground">
                  {payment.description || 'Без описания'}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="max-w-60 truncate font-mono text-xs text-foreground" title={payment.provider_payment_id ?? payment.id}>
                  {payment.provider_payment_id ?? payment.id}
                </div>
                <div className="max-w-60 truncate font-mono text-[11px] text-muted-foreground" title={payment.id}>
                  {payment.id}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminPaymentsPage() {
  const initialRange = getPresetRange(30);
  const [draftFrom, setDraftFrom] = useState(initialRange.from);
  const [draftTo, setDraftTo] = useState(initialRange.to);
  const [appliedFrom, setAppliedFrom] = useState(initialRange.from);
  const [appliedTo, setAppliedTo] = useState(initialRange.to);
  const [status, setStatus] = useState<PaymentStatusFilter>('all');
  const [provider, setProvider] = useState('all');
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const params = useMemo<AdminPaymentsParams>(() => ({
    date_from: appliedFrom,
    date_to: appliedTo,
    status,
    provider,
    search: search || undefined,
    page,
    per_page: PER_PAGE,
  }), [appliedFrom, appliedTo, page, provider, search, status]);

  const { data, isLoading, isFetching, error } = useAdminPayments(params);
  const activePreset = getActivePreset(appliedFrom, appliedTo);
  const errorMessage = error instanceof Error ? error.message : 'Не удалось загрузить платежи';

  function applyPreset(days: number) {
    const preset = getPresetRange(days);
    setDraftFrom(preset.from);
    setDraftTo(preset.to);
    setAppliedFrom(preset.from);
    setAppliedTo(preset.to);
    setPage(1);
  }

  function applyCustomRange() {
    if (!draftFrom || !draftTo) return;
    if (draftFrom > draftTo) {
      window.alert('Дата начала не может быть позже даты окончания');
      return;
    }

    setAppliedFrom(draftFrom);
    setAppliedTo(draftTo);
    setPage(1);
  }

  function applySearch() {
    setSearch(draftSearch.trim());
    setPage(1);
  }

  function resetFilters() {
    const preset = getPresetRange(30);
    setDraftFrom(preset.from);
    setDraftTo(preset.to);
    setAppliedFrom(preset.from);
    setAppliedTo(preset.to);
    setStatus('all');
    setProvider('all');
    setDraftSearch('');
    setSearch('');
    setPage(1);
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Платежи</CardTitle>
            <CardDescription>
              Дневной график оплат, сводка по выбранному периоду и список платежей с пользователями, статусами и провайдерскими ID.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {PRESET_DAYS.map((days) => (
                <Button
                  key={days}
                  type="button"
                  variant={activePreset === days ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => applyPreset(days)}
                >
                  {days} дней
                </Button>
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={resetFilters}>
                Сбросить
              </Button>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
              <Input type="date" value={draftFrom} onChange={(event) => setDraftFrom(event.target.value)} />
              <Input type="date" value={draftTo} onChange={(event) => setDraftTo(event.target.value)} />
              <Button type="button" variant="outline" onClick={applyCustomRange}>
                Применить период
              </Button>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_1fr_2fr_auto]">
              <Select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as PaymentStatusFilter);
                  setPage(1);
                }}
                options={STATUS_OPTIONS}
              />
              <Select
                value={provider}
                onChange={(event) => {
                  setProvider(event.target.value);
                  setPage(1);
                }}
                options={PROVIDER_OPTIONS}
              />
              <Input
                value={draftSearch}
                onChange={(event) => setDraftSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') applySearch();
                }}
                placeholder="Поиск: email, имя, ID платежа, описание"
              />
              <Button type="button" variant="outline" onClick={applySearch}>
                Найти
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
              <div>
                <span className="font-medium">Период:</span>{' '}
                {data ? `${data.filters.date_from} - ${data.filters.date_to}` : `${appliedFrom} - ${appliedTo}`}
              </div>
              <div className="text-muted-foreground">
                {isFetching ? 'Обновляем данные...' : `Страница ${data?.meta.page ?? page} из ${data?.meta.total_pages ?? 1}`}
              </div>
            </div>
          </CardContent>
        </Card>

        {isLoading && !data ? (
          <div className="flex justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : null}

        {!isLoading && error ? (
          <Card>
            <CardContent className="pt-6 text-sm text-destructive">{errorMessage}</CardContent>
          </Card>
        ) : null}

        {data ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Оплачено"
                value={formatRub(data.summary.succeeded_amount_rub)}
                hint={`${formatUsd(data.summary.succeeded_amount_usd)} за ${data.summary.succeeded_count.toLocaleString('ru-RU')} успешных платежей.`}
              />
              <MetricCard
                label="Всего попыток"
                value={data.summary.total_count.toLocaleString('ru-RU')}
                hint={`Конверсия в оплату: ${formatPercent(data.summary.success_rate_percent)}.`}
              />
              <MetricCard
                label="Средний платеж"
                value={formatRub(data.summary.avg_succeeded_payment_rub)}
                hint={`${formatUsd(data.summary.avg_succeeded_payment_usd)} в среднем по успешным оплатам.`}
              />
              <MetricCard
                label="Плательщики"
                value={data.summary.payers_count.toLocaleString('ru-RU')}
                hint={`В ожидании: ${data.summary.pending_count.toLocaleString('ru-RU')}, ошибок и отмен: ${data.summary.failed_count.toLocaleString('ru-RU')}.`}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>График оплат по дням</CardTitle>
                <CardDescription>
                  Зеленые столбцы показывают сумму успешных платежей в рублях. Желтая точка отмечает дни с ожидающими платежами.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PaymentsBarChart data={data.daily} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle>Список платежей</CardTitle>
                    <CardDescription>
                      Найдено: {data.meta.total.toLocaleString('ru-RU')}. Показаны платежи текущей страницы.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={page <= 1 || isFetching}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                    >
                      Назад
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={page >= data.meta.total_pages || isFetching}
                      onClick={() => setPage((current) => Math.min(data.meta.total_pages, current + 1))}
                    >
                      Далее
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <PaymentsTable payments={data.payments} />
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
}
