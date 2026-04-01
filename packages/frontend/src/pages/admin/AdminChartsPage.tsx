import { useState } from 'react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import { useAdminDashboardCharts } from '../../hooks/useAdmin';
import type { AdminDashboardCharts } from '../../lib/api/admin';
import { cn } from '../../lib/utils';

type DailyPoint = AdminDashboardCharts['daily'][number];
type DatePoint = { date: string };
type SavedRangePreset = { id: string; name: string; from: string; to: string; createdAt: string };

type SeriesDefinition<T extends DatePoint> = {
  key: string;
  label: string;
  color: string;
  value: (point: T) => number | null;
  formatValue: (value: number | null) => string;
};

const PRESET_DAYS = [7, 30, 90, 180];
const SAVED_PRESETS_KEY = 'llmstore.admin.charts.saved-presets.v1';

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

function formatDayLabel(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return parsed.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
}

function formatInt(value: number) {
  return value.toLocaleString('ru-RU');
}

function formatUsd(value: number | null, digits = 4) {
  if (value === null) return '—';
  return `$${value.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })}`;
}

function formatPercent(value: number | null, digits = 2) {
  if (value === null) return '—';
  return `${value.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })}%`;
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatCompactUsd(value: number) {
  return `$${new Intl.NumberFormat('ru-RU', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)}`;
}

function slugifyLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'metric';
}

function loadSavedPresets(): SavedRangePreset[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(SAVED_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is SavedRangePreset => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Record<string, unknown>;
      return typeof candidate.id === 'string'
        && typeof candidate.name === 'string'
        && typeof candidate.from === 'string'
        && typeof candidate.to === 'string'
        && typeof candidate.createdAt === 'string';
    });
  } catch {
    return [];
  }
}

function persistSavedPresets(presets: SavedRangePreset[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SAVED_PRESETS_KEY, JSON.stringify(presets));
}

function escapeCsvCell(value: string | number | null | undefined) {
  const normalized = value === null || value === undefined ? '' : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, content: string) {
  if (typeof window === 'undefined') return;
  const blob = new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = filename;
  window.document.body.appendChild(link);
  link.click();
  window.document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

function buildChartsCsv(data: AdminDashboardCharts) {
  const modelCostMaps = new Map(
    data.model_series.map((model) => [model.model, new Map(model.daily.map((point) => [point.date, point.usage_cost_usd]))]),
  );
  const modelTokenMaps = new Map(
    data.model_series.map((model) => [model.model, new Map(model.daily.map((point) => [point.date, point.total_tokens]))]),
  );

  const headers = [
    'date',
    'registrations',
    'cumulative_users',
    'active_users',
    'dau',
    'wau',
    'mau',
    'payers_count',
    'chats_created',
    'chat_messages',
    'assistant_messages',
    'user_messages',
    'agent_runs',
    'successful_runs',
    'success_rate_percent',
    'prompt_tokens',
    'completion_tokens',
    'total_tokens',
    'usage_cost_usd',
    'topups_usd',
    'paid_topups_usd',
    'bonus_credits_usd',
    'balance_spend_usd',
    'manual_debits_usd',
    'margin_usd',
    'cashflow_usd',
    'roi_percent',
    'arpu_usd',
    'arppu_usd',
    'payer_share_percent',
    ...data.model_series.flatMap((model) => [
      `model_cost__${slugifyLabel(model.model)}`,
      `model_tokens__${slugifyLabel(model.model)}`,
    ]),
  ];

  const lines = [
    headers.map(escapeCsvCell).join(';'),
    ...data.daily.map((point) => {
      const row: Array<string | number | null> = [
        point.date,
        point.registrations,
        point.cumulative_users,
        point.active_users,
        point.dau,
        point.wau,
        point.mau,
        point.payers_count,
        point.chats_created,
        point.chat_messages,
        point.assistant_messages,
        point.user_messages,
        point.agent_runs,
        point.successful_runs,
        point.success_rate_percent,
        point.prompt_tokens,
        point.completion_tokens,
        point.total_tokens,
        point.usage_cost_usd,
        point.topups_usd,
        point.paid_topups_usd,
        point.bonus_credits_usd,
        point.balance_spend_usd,
        point.manual_debits_usd,
        point.margin_usd,
        point.cashflow_usd,
        point.roi_percent,
        point.arpu_usd,
        point.arppu_usd,
        point.payer_share_percent,
        ...data.model_series.flatMap((model) => [
          modelCostMaps.get(model.model)?.get(point.date) ?? 0,
          modelTokenMaps.get(model.model)?.get(point.date) ?? 0,
        ]),
      ];

      return row.map(escapeCsvCell).join(';');
    }),
  ];

  return lines.join('\n');
}

function formatAxisUsd(value: number) {
  return formatCompactUsd(value);
}

function formatAxisInt(value: number) {
  return formatCompactNumber(value);
}

function formatAxisPercent(value: number) {
  return `${value.toFixed(0)}%`;
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

function getActivePreset(from: string, to: string) {
  for (const days of PRESET_DAYS) {
    const preset = getPresetRange(days);
    if (preset.from === from && preset.to === to) return days;
  }

  return null;
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
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

function MultiSeriesChart<T extends DatePoint>({
  title,
  description,
  data,
  series,
  defaultVisibleKeys,
  axisFormatter,
}: {
  title: string;
  description: string;
  data: T[];
  series: Array<SeriesDefinition<T>>;
  defaultVisibleKeys: string[];
  axisFormatter: (value: number) => string;
}) {
  const [visibleKeys, setVisibleKeys] = useState<string[]>(defaultVisibleKeys);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const activeSeries = series.filter((item) => visibleKeys.includes(item.key));
  const width = 920;
  const height = 320;
  const padding = { top: 18, right: 16, bottom: 42, left: 64 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

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

  function buildPath(item: SeriesDefinition<T>) {
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
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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

        {data.length === 0 || activeSeries.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            Нет данных для отображения в выбранном диапазоне.
          </div>
        ) : (
          <>
            <div
              className="relative"
              onMouseLeave={() => setHoveredIndex(null)}
              onMouseMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
                const nextIndex = Math.round(ratio * (data.length - 1));
                setHoveredIndex(nextIndex);
              }}
            >
              <svg viewBox={`0 0 ${width} ${height}`} className="h-[320px] w-full overflow-visible">
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
                      {axisFormatter(tick)}
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
                      textAnchor="middle"
                      fontSize="11"
                      fill="currentColor"
                      fillOpacity={0.6}
                    >
                      {formatDayLabel(data[index].date)}
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

                {selectedIndex !== null && (
                  <line
                    x1={xScale(selectedIndex)}
                    x2={xScale(selectedIndex)}
                    y1={padding.top}
                    y2={height - padding.bottom}
                    stroke="currentColor"
                    strokeOpacity={0.2}
                    strokeDasharray="4 4"
                  />
                )}

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
            </div>

            {selectedPoint && (
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <p className="text-sm font-medium">{formatDayLabel(selectedPoint.date)}</p>
                  <p className="text-xs text-muted-foreground">{selectedPoint.date}</p>
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {activeSeries.map((item) => (
                    <div key={item.key} className="rounded-lg border bg-background px-3 py-2 text-sm">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-muted-foreground">{item.label}</span>
                      </div>
                      <div className="font-medium">{item.formatValue(item.value(selectedPoint))}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminChartsPage() {
  const initialRange = getPresetRange(30);
  const [draftFrom, setDraftFrom] = useState(initialRange.from);
  const [draftTo, setDraftTo] = useState(initialRange.to);
  const [appliedFrom, setAppliedFrom] = useState(initialRange.from);
  const [appliedTo, setAppliedTo] = useState(initialRange.to);
  const [presetName, setPresetName] = useState('');
  const [savedPresets, setSavedPresets] = useState<SavedRangePreset[]>(() => loadSavedPresets());

  const { data, isLoading, isFetching, error } = useAdminDashboardCharts({
    date_from: appliedFrom,
    date_to: appliedTo,
  });

  const activePreset = getActivePreset(appliedFrom, appliedTo);
  const errorMessage = error instanceof Error ? error.message : 'Не удалось загрузить графики';

  function applyPreset(days: number) {
    const preset = getPresetRange(days);
    setDraftFrom(preset.from);
    setDraftTo(preset.to);
    setAppliedFrom(preset.from);
    setAppliedTo(preset.to);
  }

  function applyCustomRange() {
    if (!draftFrom || !draftTo) return;
    if (draftFrom > draftTo) {
      window.alert('Дата начала не может быть позже даты окончания');
      return;
    }

    setAppliedFrom(draftFrom);
    setAppliedTo(draftTo);
  }

  function applySavedPreset(preset: SavedRangePreset) {
    setDraftFrom(preset.from);
    setDraftTo(preset.to);
    setAppliedFrom(preset.from);
    setAppliedTo(preset.to);
  }

  function saveCurrentPreset() {
    const normalizedName = presetName.trim();
    if (!normalizedName) {
      window.alert('Введите название пресета');
      return;
    }

    if (!draftFrom || !draftTo) {
      window.alert('Сначала выберите диапазон дат');
      return;
    }

    const nextPreset: SavedRangePreset = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: normalizedName,
      from: draftFrom,
      to: draftTo,
      createdAt: new Date().toISOString(),
    };

    const nextPresets = [
      nextPreset,
      ...savedPresets.filter((item) => item.name.toLowerCase() !== normalizedName.toLowerCase()),
    ].slice(0, 12);

    setSavedPresets(nextPresets);
    persistSavedPresets(nextPresets);
    setPresetName('');
  }

  function deleteSavedPreset(id: string) {
    const nextPresets = savedPresets.filter((item) => item.id !== id);
    setSavedPresets(nextPresets);
    persistSavedPresets(nextPresets);
  }

  function exportCurrentRangeCsv() {
    if (!data) return;
    downloadCsv(`admin-charts_${data.range.date_from}_${data.range.date_to}.csv`, buildChartsCsv(data));
  }

  const moneySeries: Array<SeriesDefinition<DailyPoint>> = [
    { key: 'topups_usd', label: 'Все пополнения', color: '#0f766e', value: (point) => point.topups_usd, formatValue: (value) => formatUsd(value) },
    { key: 'paid_topups_usd', label: 'Платные пополнения', color: '#0891b2', value: (point) => point.paid_topups_usd, formatValue: (value) => formatUsd(value) },
    { key: 'bonus_credits_usd', label: 'Бонусы и кредиты', color: '#7c3aed', value: (point) => point.bonus_credits_usd, formatValue: (value) => formatUsd(value) },
    { key: 'balance_spend_usd', label: 'Списания с баланса', color: '#dc2626', value: (point) => point.balance_spend_usd, formatValue: (value) => formatUsd(value) },
    { key: 'usage_cost_usd', label: 'Себестоимость моделей', color: '#f59e0b', value: (point) => point.usage_cost_usd, formatValue: (value) => formatUsd(value) },
    { key: 'margin_usd', label: 'Маржа', color: '#16a34a', value: (point) => point.margin_usd, formatValue: (value) => formatUsd(value) },
    { key: 'cashflow_usd', label: 'Cashflow', color: '#1d4ed8', value: (point) => point.cashflow_usd, formatValue: (value) => formatUsd(value) },
    { key: 'manual_debits_usd', label: 'Ручные списания', color: '#9333ea', value: (point) => point.manual_debits_usd, formatValue: (value) => formatUsd(value) },
  ];

  const audienceSeries: Array<SeriesDefinition<DailyPoint>> = [
    { key: 'registrations', label: 'Регистрации', color: '#2563eb', value: (point) => point.registrations, formatValue: (value) => formatInt(value ?? 0) },
    { key: 'cumulative_users', label: 'Всего пользователей', color: '#1d4ed8', value: (point) => point.cumulative_users, formatValue: (value) => formatInt(value ?? 0) },
    { key: 'dau', label: 'DAU', color: '#0f766e', value: (point) => point.dau, formatValue: (value) => formatInt(value ?? 0) },
    { key: 'wau', label: 'WAU', color: '#0891b2', value: (point) => point.wau, formatValue: (value) => formatInt(value ?? 0) },
    { key: 'mau', label: 'MAU', color: '#7c3aed', value: (point) => point.mau, formatValue: (value) => formatInt(value ?? 0) },
    { key: 'payers_count', label: 'Плательщики', color: '#dc2626', value: (point) => point.payers_count, formatValue: (value) => formatInt(value ?? 0) },
  ];

  const productSeries: Array<SeriesDefinition<DailyPoint>> = [
    { key: 'chats_created', label: 'Новые чаты', color: '#2563eb', value: (point) => point.chats_created, formatValue: (value) => formatInt(value ?? 0) },
    { key: 'chat_messages', label: 'Все сообщения', color: '#0f766e', value: (point) => point.chat_messages, formatValue: (value) => formatInt(value ?? 0) },
    { key: 'assistant_messages', label: 'Ответы ассистента', color: '#7c3aed', value: (point) => point.assistant_messages, formatValue: (value) => formatInt(value ?? 0) },
    { key: 'user_messages', label: 'Сообщения пользователей', color: '#dc2626', value: (point) => point.user_messages, formatValue: (value) => formatInt(value ?? 0) },
    { key: 'agent_runs', label: 'Запуски агентов', color: '#f59e0b', value: (point) => point.agent_runs, formatValue: (value) => formatInt(value ?? 0) },
    { key: 'successful_runs', label: 'Успешные запуски', color: '#16a34a', value: (point) => point.successful_runs, formatValue: (value) => formatInt(value ?? 0) },
  ];

  const tokenSeries: Array<SeriesDefinition<DailyPoint>> = [
    { key: 'total_tokens', label: 'Все токены', color: '#2563eb', value: (point) => point.total_tokens, formatValue: (value) => formatInt(value ?? 0) },
    { key: 'prompt_tokens', label: 'Prompt tokens', color: '#0f766e', value: (point) => point.prompt_tokens, formatValue: (value) => formatInt(value ?? 0) },
    { key: 'completion_tokens', label: 'Completion tokens', color: '#7c3aed', value: (point) => point.completion_tokens, formatValue: (value) => formatInt(value ?? 0) },
  ];

  const ratioSeries: Array<SeriesDefinition<DailyPoint>> = [
    { key: 'roi_percent', label: 'ROI / окупаемость', color: '#16a34a', value: (point) => point.roi_percent, formatValue: (value) => formatPercent(value) },
    { key: 'payer_share_percent', label: 'Доля плательщиков', color: '#2563eb', value: (point) => point.payer_share_percent, formatValue: (value) => formatPercent(value) },
    { key: 'success_rate_percent', label: 'Успешность запусков', color: '#f59e0b', value: (point) => point.success_rate_percent, formatValue: (value) => formatPercent(value) },
  ];

  const modelData = data?.daily.map((point) => ({ date: point.date })) ?? [];
  const modelSeries: Array<SeriesDefinition<DatePoint>> = (data?.model_series ?? []).map((model, index) => {
    const pointsByDate = new Map(model.daily.map((point) => [point.date, point.usage_cost_usd]));
    const palette = ['#2563eb', '#0f766e', '#7c3aed', '#dc2626', '#f59e0b', '#0891b2', '#1d4ed8', '#9333ea'];

    return {
      key: model.model,
      label: model.model,
      color: palette[index % palette.length],
      value: (point) => pointsByDate.get(point.date) ?? 0,
      formatValue: (value) => formatUsd(value),
    };
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Графики</CardTitle>
            <CardDescription>
              Дни по оси X, включаемые и отключаемые кривые по финансам, аудитории, продукту, токенам и расходам по моделям.
              Активный пользователь считается по любому событию за день: чат, сообщение, запуск агента или транзакция.
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
              <Button type="button" variant="secondary" size="sm" onClick={exportCurrentRangeCsv} disabled={!data}>
                Экспорт CSV
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <Input type="date" value={draftFrom} onChange={(event) => setDraftFrom(event.target.value)} />
              <Input type="date" value={draftTo} onChange={(event) => setDraftTo(event.target.value)} />
              <Button type="button" variant="outline" onClick={applyCustomRange}>
                Применить диапазон
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <Input
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                placeholder="Название сохранённого пресета"
              />
              <Button type="button" variant="outline" onClick={saveCurrentPreset}>
                Сохранить пресет
              </Button>
            </div>

            {savedPresets.length > 0 ? (
              <div className="rounded-lg border bg-background p-4">
                <p className="mb-3 text-sm font-medium">Сохранённые пресеты</p>
                <div className="flex flex-wrap gap-2">
                  {savedPresets.map((preset) => {
                    const isActive = appliedFrom === preset.from && appliedTo === preset.to;
                    return (
                      <div key={preset.id} className="inline-flex items-center gap-2 rounded-full border px-2 py-1">
                        <button
                          type="button"
                          onClick={() => applySavedPreset(preset)}
                          className={cn(
                            'rounded-full px-2 py-1 text-xs font-medium transition-colors',
                            isActive ? 'bg-foreground text-background' : 'text-foreground/80 hover:bg-accent',
                          )}
                        >
                          {preset.name}: {preset.from} - {preset.to}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSavedPreset(preset.id)}
                          className="px-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
                          aria-label={`Удалить пресет ${preset.name}`}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Пресеты сохраняются локально в этом браузере.
                </p>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
              <div>
                <span className="font-medium">Период:</span>{' '}
                {data ? `${data.range.date_from} - ${data.range.date_to}` : `${appliedFrom} - ${appliedTo}`}
              </div>
              <div className="text-muted-foreground">
                {isFetching ? 'Обновляем…' : 'По умолчанию показываются последние 30 дней'}
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
              <SummaryCard
                label="Пополнения / списания"
                value={`${formatUsd(data.totals.topups_usd)} / ${formatUsd(data.totals.balance_spend_usd)}`}
                hint={`Платные пополнения: ${formatUsd(data.totals.paid_topups_usd)}. Бонусы: ${formatUsd(data.totals.bonus_credits_usd)}.`}
              />
              <SummaryCard
                label="Себестоимость / маржа"
                value={`${formatUsd(data.totals.usage_cost_usd)} / ${formatUsd(data.totals.margin_usd)}`}
                hint={`Cashflow: ${formatUsd(data.totals.cashflow_usd)}. ROI: ${formatPercent(data.totals.roi_percent)}.`}
              />
              <SummaryCard
                label="DAU / WAU / MAU"
                value={`${formatInt(Math.round(data.totals.avg_dau))} / ${formatInt(Math.round(data.totals.avg_wau))} / ${formatInt(Math.round(data.totals.avg_mau))}`}
                hint={`Пики: ${formatInt(data.totals.peak_dau)} / ${formatInt(data.totals.peak_wau)} / ${formatInt(data.totals.peak_mau)}.`}
              />
              <SummaryCard
                label="Регистрации / база"
                value={`${formatInt(data.totals.registrations)} / ${formatInt(data.totals.total_users_end)}`}
                hint={`Активных дней: ${data.totals.range_days_with_activity} из ${data.range.days} (${formatPercent(data.totals.active_days_share_percent)}).`}
              />
              <SummaryCard
                label="Чаты / сообщения"
                value={`${formatInt(data.totals.chats_created)} / ${formatInt(data.totals.chat_messages)}`}
                hint={`Пользовательских: ${formatInt(data.totals.user_messages)}, ответов ассистента: ${formatInt(data.totals.assistant_messages)}.`}
              />
              <SummaryCard
                label="Запуски агентов"
                value={`${formatInt(data.totals.agent_runs)} / ${formatInt(data.totals.successful_runs)}`}
                hint={`Успешность: ${formatPercent(data.totals.success_rate_percent)}.`}
              />
              <SummaryCard
                label="Токены"
                value={formatInt(data.totals.total_tokens)}
                hint={`Prompt: ${formatInt(data.totals.prompt_tokens)}, completion: ${formatInt(data.totals.completion_tokens)}.`}
              />
              <SummaryCard
                label="ARPU / плательщики"
                value={`${formatUsd(data.totals.arpu_usd)} / ${formatInt(data.totals.payers_count)}`}
                hint="ARPU здесь считается как списания с баланса за период, делённые на текущую пользовательскую базу."
              />
            </div>

            <MultiSeriesChart
              title="Деньги"
              description="Пополнения, платные пополнения, списания, себестоимость моделей, маржа и cashflow."
              data={data.daily}
              series={moneySeries}
              defaultVisibleKeys={['topups_usd', 'balance_spend_usd', 'usage_cost_usd', 'margin_usd']}
              axisFormatter={formatAxisUsd}
            />

            <MultiSeriesChart
              title="Аудитория"
              description="Регистрации, размер базы и активность пользователей по DAU/WAU/MAU, плюс число плательщиков."
              data={data.daily}
              series={audienceSeries}
              defaultVisibleKeys={['registrations', 'cumulative_users', 'dau', 'wau', 'mau']}
              axisFormatter={formatAxisInt}
            />

            <MultiSeriesChart
              title="Продукт"
              description="Новые чаты, сообщения и запуски агентов. Удобно смотреть, где растёт нагрузка и вовлечённость."
              data={data.daily}
              series={productSeries}
              defaultVisibleKeys={['chats_created', 'chat_messages', 'agent_runs']}
              axisFormatter={formatAxisInt}
            />

            <MultiSeriesChart
              title="Токены"
              description="Разделение по prompt/completion и общему объёму токенов за каждый день."
              data={data.daily}
              series={tokenSeries}
              defaultVisibleKeys={['total_tokens', 'prompt_tokens', 'completion_tokens']}
              axisFormatter={formatAxisInt}
            />

            <MultiSeriesChart
              title="Коэффициенты"
              description="Окупаемость, доля плательщиков и качество запусков по дням."
              data={data.daily}
              series={ratioSeries}
              defaultVisibleKeys={['roi_percent', 'payer_share_percent', 'success_rate_percent']}
              axisFormatter={formatAxisPercent}
            />

            <MultiSeriesChart
              key={data.model_series.map((item) => item.model).join('|') || 'empty-models'}
              title="Расходы по моделям"
              description="Топ моделей по себестоимости в выбранном диапазоне. Кривые можно включать и отключать независимо."
              data={modelData}
              series={modelSeries}
              defaultVisibleKeys={modelSeries.slice(0, 4).map((item) => item.key)}
              axisFormatter={formatAxisUsd}
            />

            {data.model_series.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Топ моделей за период</CardTitle>
                  <CardDescription>Сводка по моделям, которые попали в график по расходам.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {data.model_series.map((model) => (
                      <div key={model.model} className="rounded-lg border p-4">
                        <p className="text-sm font-medium break-all">{model.model}</p>
                        <p className="mt-2 text-xl font-semibold">{formatUsd(model.total_usage_cost_usd)}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatInt(model.total_tokens)} токенов
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
}
