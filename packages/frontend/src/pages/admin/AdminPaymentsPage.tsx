import { useEffect, useMemo, useRef, useState } from 'react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import { useAdminPayments } from '../../hooks/useAdmin';
import type { AdminPaymentDailyPoint, AdminPaymentItem, AdminPaymentsParams } from '../../lib/api/admin';
import { cn } from '../../lib/utils';

const PRESET_DAYS = [7, 30, 90, 180, 365];
const PER_PAGE = 25;

type PaymentStatusFilter = NonNullable<AdminPaymentsParams['status']>;

type PaymentSeriesDefinition = {
  key: string;
  label: string;
  color: string;
  value: (point: AdminPaymentDailyPoint) => number | null;
  formatValue: (value: number | null) => string;
};

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

function formatCompactRub(value: number) {
  return `${new Intl.NumberFormat('ru-RU', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)} ₽`;
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildTickIndices(length: number, desired = 6) {
  if (length <= 1) return [0];
  const ticks = new Set<number>([0, length - 1]);
  const count = Math.min(desired, length);

  for (let i = 1; i < count - 1; i += 1) {
    ticks.add(Math.round((i * (length - 1)) / (count - 1)));
  }

  return Array.from(ticks).sort((a, b) => a - b);
}

function toggleKey(current: string[], key: string) {
  return current.includes(key)
    ? current.filter((item) => item !== key)
    : [...current, key];
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

function PaymentsLineChart({ data }: { data: AdminPaymentDailyPoint[] }) {
  const series: PaymentSeriesDefinition[] = [
    {
      key: 'succeeded_amount_rub',
      label: 'Оплачено, ₽',
      color: '#0f766e',
      value: (point) => point.succeeded_amount_rub,
      formatValue: (value) => formatRub(value ?? 0),
    },
    {
      key: 'total_amount_rub',
      label: 'Все попытки, ₽',
      color: '#2563eb',
      value: (point) => point.total_amount_rub,
      formatValue: (value) => formatRub(value ?? 0),
    },
  ];

  const defaultVisibleKeys = ['succeeded_amount_rub', 'total_amount_rub'];
  const [visibleKeys, setVisibleKeys] = useState<string[]>(defaultVisibleKeys);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isPointerInside, setIsPointerInside] = useState(false);
  const [pointerPosition, setPointerPosition] = useState<{ x: number; y: number } | null>(null);
  const [chartHeightPx, setChartHeightPx] = useState(320);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const [chartPixelWidth, setChartPixelWidth] = useState(920);

  const activeSeries = series.filter((item) => visibleKeys.includes(item.key));
  const width = Math.max(chartPixelWidth, 320);
  const height = chartHeightPx;
  const padding = { top: 18, right: 18, bottom: 46, left: 64 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  useEffect(() => {
    const node = chartContainerRef.current;
    if (!node || typeof window === 'undefined') return;

    const updateWidth = () => {
      const nextWidth = Math.round(node.getBoundingClientRect().width);
      setChartPixelWidth((current) => (current === nextWidth || nextWidth <= 0 ? current : nextWidth));
    };

    updateWidth();

    const observer = new window.ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  let minValue = 0;
  let maxValue = 0;

  for (const point of data) {
    for (const item of activeSeries) {
      const value = item.value(point);
      if (value === null || Number.isNaN(value)) continue;
      minValue = Math.min(minValue, value);
      maxValue = Math.max(maxValue, value);
    }
  }

  if (minValue === maxValue) {
    if (maxValue === 0) {
      maxValue = 1;
    } else if (maxValue > 0) {
      minValue = 0;
    } else {
      maxValue = 0;
    }
  }

  const yRange = maxValue - minValue || 1;
  const yScale = (value: number) => padding.top + ((maxValue - value) / yRange) * chartHeight;
  const xScale = (index: number) => {
    if (data.length <= 1) return padding.left + chartWidth / 2;
    return padding.left + (index / (data.length - 1)) * chartWidth;
  };

  const yTicks = Array.from({ length: 5 }, (_, index) => minValue + (yRange / 4) * index).reverse();
  const xTicks = buildTickIndices(data.length, 6);
  const zeroY = yScale(0);
  const selectedIndex = hoveredIndex ?? (data.length > 0 ? data.length - 1 : null);
  const selectedPoint = selectedIndex !== null ? data[selectedIndex] : null;
  const tooltipWidth = 260;
  const tooltipGap = 18;
  const tooltipHeight = 144;
  const tooltipAnchorX = pointerPosition
    ? pointerPosition.x
    : selectedIndex !== null
      ? xScale(selectedIndex)
      : width / 2;
  const tooltipAnchorY = pointerPosition ? pointerPosition.y : padding.top + 12;
  const showTooltipOnRight = tooltipAnchorX < width * 0.55;
  const tooltipLeftPx = clamp(
    showTooltipOnRight ? tooltipAnchorX + tooltipGap : tooltipAnchorX - tooltipGap,
    showTooltipOnRight ? 12 : tooltipWidth + 12,
    showTooltipOnRight ? width - tooltipWidth - 12 : width - 12,
  );
  const tooltipTopPx = clamp(tooltipAnchorY - tooltipHeight / 2, 12, height - tooltipHeight - 12);

  function buildPath(item: PaymentSeriesDefinition) {
    let path = '';

    data.forEach((point, index) => {
      const value = item.value(point);
      if (value === null || Number.isNaN(value)) return;
      const command = path ? 'L' : 'M';
      path += `${command}${xScale(index)} ${yScale(value)} `;
    });

    return path.trim();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>График оплат по дням</CardTitle>
        <CardDescription>
          Линейный график в стиле раздела «Графики»: можно включать успешные оплаты и все созданные попытки оплаты.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {series.map((item) => {
              const isActive = visibleKeys.includes(item.key);
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setVisibleKeys((current) => toggleKey(current, item.key))}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    isActive
                      ? 'border-foreground/20 bg-foreground text-background'
                      : 'border-border bg-background text-foreground/80 hover:border-foreground/20 hover:bg-accent',
                  )}
                >
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: item.color }} />
                  {item.label}
                </button>
              );
            })}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setChartHeightPx((current) => clamp(current - 40, 240, 480))}
              aria-label="Уменьшить высоту графика платежей"
            >
              −
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setChartHeightPx((current) => clamp(current + 40, 240, 480))}
              aria-label="Увеличить высоту графика платежей"
            >
              +
            </Button>
          </div>
        </div>

        {data.length === 0 || activeSeries.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            Нет данных для отображения в выбранном диапазоне.
          </div>
        ) : (
          <div
            ref={chartContainerRef}
            className="relative w-full overflow-hidden"
            onPointerLeave={() => {
              setHoveredIndex(null);
              setIsPointerInside(false);
              setPointerPosition(null);
            }}
            onPointerMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const rawPointerX = clamp(event.clientX - rect.left, 0, rect.width);
              const pointerX = clamp(rawPointerX, padding.left, width - padding.right);
              const ratio = clamp((pointerX - padding.left) / Math.max(chartWidth, 1), 0, 1);
              const yRatio = clamp((event.clientY - rect.top) / rect.height, 0, 1);
              const pointerY = clamp(yRatio * height, padding.top, height - padding.bottom);
              const nextIndex = Math.round(ratio * (data.length - 1));
              setHoveredIndex(nextIndex);
              setIsPointerInside(true);
              setPointerPosition({ x: pointerX, y: pointerY });
            }}
          >
            <svg
              width={width}
              height={height}
              className="block w-full overflow-visible"
              style={{ height: `${chartHeightPx}px` }}
            >
              {yTicks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={padding.left}
                    x2={width - padding.right}
                    y1={yScale(tick)}
                    y2={yScale(tick)}
                    stroke="currentColor"
                    strokeOpacity={0.08}
                  />
                  <text
                    x={padding.left - 12}
                    y={yScale(tick) + 4}
                    textAnchor="end"
                    fontSize="11"
                    fill="currentColor"
                    fillOpacity={0.6}
                  >
                    {formatCompactRub(tick)}
                  </text>
                </g>
              ))}

              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={zeroY}
                y2={zeroY}
                stroke="currentColor"
                strokeOpacity={0.22}
              />

              {xTicks.map((index) => (
                <g key={index}>
                  <line
                    x1={xScale(index)}
                    x2={xScale(index)}
                    y1={padding.top}
                    y2={height - padding.bottom}
                    stroke="currentColor"
                    strokeOpacity={0.05}
                  />
                  <text
                    x={xScale(index)}
                    y={height - 14}
                    textAnchor={index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle'}
                    fontSize="11"
                    fill="currentColor"
                    fillOpacity={0.6}
                  >
                    {formatDate(data[index].date)}
                  </text>
                </g>
              ))}

              {activeSeries.map((item) => (
                <path
                  key={item.key}
                  d={buildPath(item)}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}

              {pointerPosition && isPointerInside ? (
                <line
                  x1={pointerPosition.x}
                  x2={pointerPosition.x}
                  y1={padding.top}
                  y2={height - padding.bottom}
                  stroke="currentColor"
                  strokeOpacity={0.22}
                  strokeDasharray="4 4"
                />
              ) : null}

              {pointerPosition && isPointerInside ? (
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={pointerPosition.y}
                  y2={pointerPosition.y}
                  stroke="currentColor"
                  strokeOpacity={0.16}
                  strokeDasharray="4 4"
                />
              ) : null}

              {selectedPoint && activeSeries.map((item) => {
                const value = item.value(selectedPoint);
                if (value === null || Number.isNaN(value)) return null;

                return (
                  <circle
                    key={item.key}
                    cx={xScale(selectedIndex!)}
                    cy={yScale(value)}
                    r={4}
                    fill={item.color}
                    stroke="white"
                    strokeWidth={2}
                  />
                );
              })}
            </svg>

            {selectedPoint && isPointerInside ? (
              <div
                className={cn(
                  'pointer-events-none absolute z-10 w-[260px] max-w-[calc(100%-1.5rem)] rounded-xl border bg-background/95 p-3 shadow-xl backdrop-blur',
                  showTooltipOnRight ? 'translate-x-0' : '-translate-x-full',
                )}
                style={{ left: `${tooltipLeftPx}px`, top: `${tooltipTopPx}px` }}
              >
                <div className="mb-3">
                  <p className="text-sm font-semibold text-foreground">{formatDate(selectedPoint.date)}</p>
                  <p className="text-xs text-muted-foreground">{selectedPoint.date}</p>
                </div>

                <div className="space-y-2">
                  {activeSeries.map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="truncate text-muted-foreground">{item.label}</span>
                      </div>
                      <span className="shrink-0 font-medium text-foreground">{item.formatValue(item.value(selectedPoint))}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
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

            <PaymentsLineChart data={data.daily} />

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
