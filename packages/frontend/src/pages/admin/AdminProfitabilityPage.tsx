import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCcw, Save, SlidersHorizontal, Trash2 } from 'lucide-react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import { useAdminProfitability, useUpdateAdminProfitabilitySettings } from '../../hooks/useAdmin';
import type {
  AdminProfitabilityResponse,
  ProfitabilityModelRule,
  ProfitabilitySettings,
  ProfitabilityUserOverride,
} from '../../lib/api/admin';
import { cn } from '../../lib/utils';

const PRESET_DAYS = [7, 30, 90];

type NumberSettingKey =
  | 'global_markup_multiplier'
  | 'min_charge_usd'
  | 'fixed_fee_usd'
  | 'rounding_decimals'
  | 'yookassa_fee_percent'
  | 'yookassa_fee_fixed_rub'
  | 'tax_reserve_percent'
  | 'fx_buffer_percent'
  | 'bonus_reserve_percent';

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

function formatUsd(value: number, digits = 4) {
  return `$${value.toLocaleString('ru-RU', {
    minimumFractionDigits: value === 0 ? 0 : 2,
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

function formatNumber(value: number) {
  return value.toLocaleString('ru-RU');
}

function round(value: number, digits = 6) {
  return Number(value.toFixed(digits));
}

function roundUp(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.ceil((value + Number.EPSILON) * factor) / factor;
}

function matchModelRule(model: string, rules: ProfitabilityModelRule[]) {
  const normalized = model.toLowerCase();
  return rules.find((rule) => {
    if (!rule.enabled || !rule.model_pattern.trim()) return false;
    try {
      return new RegExp(rule.model_pattern, 'i').test(normalized);
    } catch {
      return normalized.includes(rule.model_pattern.trim().toLowerCase());
    }
  }) ?? null;
}

function matchUserOverride(input: {
  user_id?: string | null;
  user_email?: string | null;
}, overrides: ProfitabilityUserOverride[]) {
  const userId = input.user_id?.trim().toLowerCase() ?? '';
  const email = input.user_email?.trim().toLowerCase() ?? '';
  if (!userId && !email) return null;

  return overrides.find((override) => {
    if (!override.enabled) return false;
    const overrideUserId = override.user_id?.trim().toLowerCase() ?? '';
    const overrideEmail = override.email?.trim().toLowerCase() ?? '';
    return Boolean(
      (overrideUserId && userId && overrideUserId === userId)
      || (overrideEmail && email && overrideEmail === email),
    );
  }) ?? null;
}

function quoteSegmentWithDraft(
  segment: {
    model: string;
    user_id?: string | null;
    user_email?: string | null;
    user_role?: string | null;
    events_count: number;
    provider_cost_usd: number;
  },
  draft: ProfitabilitySettings,
) {
  if (segment.provider_cost_usd <= 0) return 0;

  const userOverride = matchUserOverride(segment, draft.user_overrides);
  const rule = matchModelRule(segment.model, draft.model_rules);
  const role = (
    segment.user_role === 'power_user'
    || segment.user_role === 'curator'
    || segment.user_role === 'admin'
      ? segment.user_role
      : 'user'
  ) as keyof ProfitabilitySettings['user_role_multipliers'];
  const roleMultiplier = draft.user_role_multipliers[role] ?? 1;
  const shouldApplyProfit = draft.enabled && !userOverride;
  const baseMultiplier = shouldApplyProfit
      ? (rule?.markup_multiplier ?? draft.global_markup_multiplier)
      : 1;
  const effectiveMultiplier = shouldApplyProfit ? baseMultiplier * roleMultiplier : 1;
  const rawCharge = shouldApplyProfit
    ? segment.provider_cost_usd * effectiveMultiplier + draft.fixed_fee_usd * segment.events_count
    : segment.provider_cost_usd;
  const minCharge = shouldApplyProfit ? draft.min_charge_usd * segment.events_count : 0;
  return roundUp(Math.max(minCharge, rawCharge), draft.rounding_decimals);
}

function simulateWithDraft(data: AdminProfitabilityResponse, draft: ProfitabilitySettings) {
  const sourceSegments = data.usage_segments.length > 0
    ? data.usage_segments
    : data.by_model.map((model) => ({ ...model, user_role: 'user', user_id: null, user_email: null }));
  const simulatedUsageRevenueUsd = sourceSegments.reduce((sum, segment) => (
    sum + quoteSegmentWithDraft(segment, draft)
  ), 0);
  const providerCostUsd = data.current.provider_cost_usd;
  const grossMarginUsd = simulatedUsageRevenueUsd - providerCostUsd;
  const paymentFeeUsd = data.current.paid_topups_usd * draft.yookassa_fee_percent / 100;
  const taxReserveUsd = data.current.paid_topups_usd * draft.tax_reserve_percent / 100;
  const fxBufferUsd = data.current.paid_topups_usd * draft.fx_buffer_percent / 100;
  const bonusReserveUsd = data.current.bonus_credits_usd
    + (simulatedUsageRevenueUsd * draft.bonus_reserve_percent / 100);

  return {
    usage_revenue_usd: round(simulatedUsageRevenueUsd, 6),
    provider_cost_usd: round(providerCostUsd, 6),
    gross_margin_usd: round(grossMarginUsd, 6),
    gross_margin_percent: simulatedUsageRevenueUsd > 0 ? round((grossMarginUsd / simulatedUsageRevenueUsd) * 100, 2) : null,
    roi_percent: providerCostUsd > 0 ? round((simulatedUsageRevenueUsd / providerCostUsd) * 100, 2) : null,
    delta_revenue_usd: round(simulatedUsageRevenueUsd - data.current.balance_spend_usd, 6),
    delta_margin_usd: round(grossMarginUsd - data.current.gross_margin_usd, 6),
    payment_fee_usd: round(paymentFeeUsd, 6),
    tax_reserve_usd: round(taxReserveUsd, 6),
    fx_buffer_usd: round(fxBufferUsd, 6),
    bonus_reserve_usd: round(bonusReserveUsd, 6),
    net_after_reserves_usd: round(
      simulatedUsageRevenueUsd
      - providerCostUsd
      - paymentFeeUsd
      - taxReserveUsd
      - fxBufferUsd
      - bonusReserveUsd,
      6,
    ),
  };
}

function NumberControl({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-800">
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <span className="text-xs text-slate-500">{value}{suffix ?? ''}</span>
      </span>
      <div className="grid grid-cols-[1fr_104px] gap-3">
        <input
          aria-label={label}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          className="min-w-0 accent-slate-950"
        />
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          className="h-9"
        />
      </div>
    </label>
  );
}

function MetricCard({
  label,
  value,
  tone = 'neutral',
  detail,
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'bad';
  detail?: string;
}) {
  return (
    <Card className="rounded-md">
      <CardContent className="p-4">
        <div className="text-xs font-medium uppercase tracking-normal text-slate-500">{label}</div>
        <div
          className={cn(
            'mt-2 text-2xl font-semibold tracking-normal',
            tone === 'good' && 'text-emerald-700',
            tone === 'bad' && 'text-red-700',
            tone === 'neutral' && 'text-slate-950',
          )}
        >
          {value}
        </div>
        {detail && <div className="mt-1 text-xs text-slate-500">{detail}</div>}
      </CardContent>
    </Card>
  );
}

export function AdminProfitabilityPage() {
  const initialRange = getPresetRange(30);
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const { data, isLoading, isFetching } = useAdminProfitability({ date_from: dateFrom, date_to: dateTo });
  const updateSettings = useUpdateAdminProfitabilitySettings();
  const [draft, setDraft] = useState<ProfitabilitySettings | null>(null);

  useEffect(() => {
    if (data?.settings) {
      setDraft(data.settings);
    }
  }, [data?.settings]);

  const isDirty = Boolean(draft && data && JSON.stringify(draft) !== JSON.stringify(data.settings));
  const preview = useMemo(() => (
    data && draft ? simulateWithDraft(data, draft) : null
  ), [data, draft]);
  const modelPreviewMap = useMemo(() => {
    if (!data || !draft) return new Map<string, number>();
    const map = new Map<string, number>();
    const sourceSegments = data.usage_segments.length > 0
      ? data.usage_segments
      : data.by_model.map((model) => ({ ...model, user_role: 'user', user_id: null, user_email: null }));

    for (const segment of sourceSegments) {
      map.set(
        segment.model,
        (map.get(segment.model) ?? 0) + quoteSegmentWithDraft(segment, draft),
      );
    }

    return map;
  }, [data, draft]);

  const updateDraft = (patch: Partial<ProfitabilitySettings>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const updateNumber = (key: NumberSettingKey, value: number) => {
    if (!Number.isFinite(value)) return;
    updateDraft({ [key]: value } as Partial<ProfitabilitySettings>);
  };

  const updateRoleMultiplier = (role: keyof ProfitabilitySettings['user_role_multipliers'], value: number) => {
    if (!Number.isFinite(value)) return;
    setDraft((current) => current
      ? {
        ...current,
        user_role_multipliers: {
          ...current.user_role_multipliers,
          [role]: value,
        },
      }
      : current);
  };

  const updateRule = (index: number, patch: Partial<ProfitabilityModelRule>) => {
    setDraft((current) => current
      ? {
        ...current,
        model_rules: current.model_rules.map((rule, ruleIndex) => (
          ruleIndex === index ? { ...rule, ...patch } : rule
        )),
      }
      : current);
  };

  const addRule = () => {
    setDraft((current) => current
      ? {
        ...current,
        model_rules: [
          ...current.model_rules,
          {
            id: `rule-${Date.now()}`,
            label: 'New model group',
            model_pattern: 'model-pattern',
            markup_multiplier: current.global_markup_multiplier,
            enabled: true,
          },
        ],
      }
      : current);
  };

  const removeRule = (index: number) => {
    setDraft((current) => current
      ? {
        ...current,
        model_rules: current.model_rules.filter((_, ruleIndex) => ruleIndex !== index),
      }
      : current);
  };

  const updateUserOverride = (index: number, patch: Partial<ProfitabilityUserOverride>) => {
    setDraft((current) => current
      ? {
        ...current,
        user_overrides: current.user_overrides.map((override, overrideIndex) => (
          overrideIndex === index ? { ...override, ...patch } : override
        )),
      }
      : current);
  };

  const addUserOverride = () => {
    setDraft((current) => current
      ? {
        ...current,
        user_overrides: [
          ...current.user_overrides,
          {
            id: `user-override-${Date.now()}`,
            label: 'At cost user',
            user_id: null,
            email: '',
            mode: 'at_cost',
            enabled: true,
          },
        ],
      }
      : current);
  };

  const removeUserOverride = (index: number) => {
    setDraft((current) => current
      ? {
        ...current,
        user_overrides: current.user_overrides.filter((_, overrideIndex) => overrideIndex !== index),
      }
      : current);
  };

  const save = async () => {
    if (!draft) return;
    await updateSettings.mutateAsync(draft);
  };

  const reset = () => {
    if (data?.settings) {
      setDraft(data.settings);
    }
  };

  if (isLoading || !data || !draft || !preview) {
    return (
      <AdminLayout>
        <div className="flex min-h-[360px] items-center justify-center">
          <Spinner size="lg" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-slate-700" />
              <h2 className="text-2xl font-semibold tracking-normal text-slate-950">Экономика OpenRouter</h2>
              <Badge variant={draft.enabled ? 'success' : 'warning'}>
                {draft.enabled ? 'pricing включен' : 'pricing выключен'}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {data.range.date_from} — {data.range.date_to}, {data.range.days} дн.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            {PRESET_DAYS.map((days) => (
              <Button
                key={days}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const next = getPresetRange(days);
                  setDateFrom(next.from);
                  setDateTo(next.to);
                }}
              >
                {days} дн.
              </Button>
            ))}
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.currentTarget.value)} className="h-9" />
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.currentTarget.value)} className="h-9" />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Текущая маржа"
            value={formatUsd(data.current.gross_margin_usd)}
            tone={data.current.gross_margin_usd >= 0 ? 'good' : 'bad'}
            detail={`ROI ${formatPercent(data.current.roi_percent)}`}
          />
          <MetricCard
            label="Прогноз маржи"
            value={formatUsd(preview.gross_margin_usd)}
            tone={preview.gross_margin_usd >= 0 ? 'good' : 'bad'}
            detail={`ROI ${formatPercent(preview.roi_percent)}`}
          />
          <MetricCard
            label="Дельта к текущему"
            value={formatUsd(preview.delta_margin_usd)}
            tone={preview.delta_margin_usd >= 0 ? 'good' : 'bad'}
            detail={`выручка ${formatUsd(preview.delta_revenue_usd)}`}
          />
          <MetricCard
            label="После резервов"
            value={formatUsd(preview.net_after_reserves_usd)}
            tone={preview.net_after_reserves_usd >= 0 ? 'good' : 'bad'}
            detail={`${formatNumber(data.current.usage_events_count)} usage-событий`}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-6">
            <Card className="rounded-md">
              <CardHeader>
                <CardTitle>Основные рычаги</CardTitle>
                <CardDescription>Глобальные коэффициенты, минимальный чек и округление списаний.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <label className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-4 py-3 text-sm font-medium text-slate-800">
                  <span>Включить pricing-политику</span>
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(event) => updateDraft({ enabled: event.currentTarget.checked })}
                    className="h-5 w-5 accent-slate-950"
                  />
                </label>

                <div className="grid gap-5 md:grid-cols-2">
                  <NumberControl
                    label="Глобальный множитель"
                    value={draft.global_markup_multiplier}
                    min={0}
                    max={5}
                    step={0.01}
                    onChange={(value) => updateNumber('global_markup_multiplier', value)}
                  />
                  <NumberControl
                    label="Минимальное списание"
                    value={draft.min_charge_usd}
                    min={0}
                    max={0.01}
                    step={0.0001}
                    suffix="$"
                    onChange={(value) => updateNumber('min_charge_usd', value)}
                  />
                  <NumberControl
                    label="Fixed fee за событие"
                    value={draft.fixed_fee_usd}
                    min={0}
                    max={0.05}
                    step={0.0001}
                    suffix="$"
                    onChange={(value) => updateNumber('fixed_fee_usd', value)}
                  />
                  <NumberControl
                    label="Знаков округления"
                    value={draft.rounding_decimals}
                    min={2}
                    max={4}
                    step={1}
                    onChange={(value) => updateNumber('rounding_decimals', Math.round(value))}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-md">
              <CardHeader>
                <CardTitle>Комиссии и резервы</CardTitle>
                <CardDescription>Расходы платежей, налоговый резерв, валютный буфер и промо-нагрузка.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 md:grid-cols-2">
                <NumberControl
                  label="YooKassa, %"
                  value={draft.yookassa_fee_percent}
                  min={0}
                  max={15}
                  step={0.1}
                  suffix="%"
                  onChange={(value) => updateNumber('yookassa_fee_percent', value)}
                />
                <NumberControl
                  label="YooKassa fixed, ₽"
                  value={draft.yookassa_fee_fixed_rub}
                  min={0}
                  max={100}
                  step={1}
                  suffix="₽"
                  onChange={(value) => updateNumber('yookassa_fee_fixed_rub', value)}
                />
                <NumberControl
                  label="Налоговый резерв"
                  value={draft.tax_reserve_percent}
                  min={0}
                  max={30}
                  step={0.5}
                  suffix="%"
                  onChange={(value) => updateNumber('tax_reserve_percent', value)}
                />
                <NumberControl
                  label="FX-буфер"
                  value={draft.fx_buffer_percent}
                  min={0}
                  max={30}
                  step={0.5}
                  suffix="%"
                  onChange={(value) => updateNumber('fx_buffer_percent', value)}
                />
                <NumberControl
                  label="Промо-резерв"
                  value={draft.bonus_reserve_percent}
                  min={0}
                  max={50}
                  step={0.5}
                  suffix="%"
                  onChange={(value) => updateNumber('bonus_reserve_percent', value)}
                />
              </CardContent>
            </Card>

            <Card className="rounded-md">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Правила по моделям</CardTitle>
                  <CardDescription>Regex-паттерн модели переопределяет глобальный множитель.</CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addRule}>
                  <Plus className="h-4 w-4" />
                  Добавить
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {draft.model_rules.map((rule, index) => (
                  <div key={rule.id} className="grid gap-3 rounded-md border border-slate-200 p-3 lg:grid-cols-[1fr_1.5fr_140px_44px_44px]">
                    <Input
                      value={rule.label}
                      onChange={(event) => updateRule(index, { label: event.currentTarget.value })}
                      className="h-9"
                      aria-label="Название правила"
                    />
                    <Input
                      value={rule.model_pattern}
                      onChange={(event) => updateRule(index, { model_pattern: event.currentTarget.value })}
                      className="h-9 font-mono"
                      aria-label="Паттерн модели"
                    />
                    <Input
                      type="number"
                      min={0}
                      max={20}
                      step={0.01}
                      value={rule.markup_multiplier}
                      onChange={(event) => updateRule(index, { markup_multiplier: Number(event.currentTarget.value) })}
                      className="h-9"
                      aria-label="Множитель правила"
                    />
                    <label className="flex h-9 items-center justify-center rounded-md border border-slate-200">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(event) => updateRule(index, { enabled: event.currentTarget.checked })}
                        className="h-4 w-4 accent-slate-950"
                        aria-label="Включить правило"
                      />
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removeRule(index)}
                      aria-label="Удалить правило"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="rounded-md">
              <CardHeader>
                <CardTitle>Множители ролей</CardTitle>
                <CardDescription>Коэффициент роли умножается на глобальное или модельное правило.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {([
                  ['user', 'User'],
                  ['power_user', 'Power user'],
                  ['curator', 'Curator'],
                  ['admin', 'Admin'],
                ] as const).map(([role, label]) => (
                  <NumberControl
                    key={role}
                    label={label}
                    value={draft.user_role_multipliers[role]}
                    min={0}
                    max={5}
                    step={0.01}
                    onChange={(value) => updateRoleMultiplier(role, value)}
                  />
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-md">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Пользователи по себестоимости</CardTitle>
                  <CardDescription>Для этих пользователей наценка, fixed fee и минимум списания не применяются.</CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addUserOverride}>
                  <Plus className="h-4 w-4" />
                  Добавить
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {draft.user_overrides.map((override, index) => (
                  <div key={override.id} className="grid gap-3 rounded-md border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <Badge variant={override.enabled ? 'success' : 'outline'}>at cost</Badge>
                      <div className="flex items-center gap-2">
                        <label className="flex h-9 items-center justify-center rounded-md border border-slate-200 px-3">
                          <input
                            type="checkbox"
                            checked={override.enabled}
                            onChange={(event) => updateUserOverride(index, { enabled: event.currentTarget.checked })}
                            className="h-4 w-4 accent-slate-950"
                            aria-label="Включить исключение пользователя"
                          />
                        </label>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => removeUserOverride(index)}
                          aria-label="Удалить исключение пользователя"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <Input
                      value={override.label}
                      onChange={(event) => updateUserOverride(index, { label: event.currentTarget.value })}
                      className="h-9"
                      aria-label="Название исключения"
                    />
                    <Input
                      value={override.email ?? ''}
                      onChange={(event) => updateUserOverride(index, { email: event.currentTarget.value || null })}
                      className="h-9"
                      placeholder="email пользователя"
                      aria-label="Email пользователя"
                    />
                    <Input
                      value={override.user_id ?? ''}
                      onChange={(event) => updateUserOverride(index, { user_id: event.currentTarget.value || null })}
                      className="h-9 font-mono"
                      placeholder="user id, если удобнее точечно по UUID"
                      aria-label="User id пользователя"
                    />
                  </div>
                ))}
                {draft.user_overrides.length === 0 && (
                  <div className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
                    Исключений пока нет.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-md">
              <CardHeader>
                <CardTitle>Waterfall</CardTitle>
                <CardDescription>Деньги и резервы в выбранном периоде.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { label: 'Оплаты клиентов', value: data.current.paid_topups_usd },
                  { label: 'Текущие списания', value: data.current.balance_spend_usd },
                  { label: 'Списания по настройкам', value: preview.usage_revenue_usd },
                  { label: 'OpenRouter', value: -preview.provider_cost_usd },
                  { label: 'YooKassa', value: -preview.payment_fee_usd },
                  { label: 'Налоги', value: -preview.tax_reserve_usd },
                  { label: 'FX-буфер', value: -preview.fx_buffer_usd },
                  { label: 'Бонусы/промо', value: -preview.bonus_reserve_usd },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
                    <span className="text-slate-600">{row.label}</span>
                    <span className={cn('font-semibold', row.value >= 0 ? 'text-emerald-700' : 'text-red-700')}>
                      {formatUsd(row.value)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={save} disabled={!isDirty || updateSettings.isPending}>
                <Save className="h-4 w-4" />
                {updateSettings.isPending ? 'Сохраняю' : 'Сохранить'}
              </Button>
              <Button type="button" variant="outline" onClick={reset} disabled={!isDirty || updateSettings.isPending}>
                <RefreshCcw className="h-4 w-4" />
                Сбросить
              </Button>
              {isFetching && <Badge variant="outline">обновляю</Badge>}
            </div>
          </div>
        </div>

        <Card className="rounded-md">
          <CardHeader>
            <CardTitle>Модели</CardTitle>
            <CardDescription>Себестоимость OpenRouter и прогноз списаний по текущему черновику.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-normal text-slate-500">
                  <th className="py-2 pr-4 font-medium">Модель</th>
                  <th className="py-2 pr-4 font-medium">События</th>
                  <th className="py-2 pr-4 font-medium">Токены</th>
                  <th className="py-2 pr-4 font-medium">OpenRouter</th>
                  <th className="py-2 pr-4 font-medium">Текущие списания</th>
                  <th className="py-2 pr-4 font-medium">Прогноз</th>
                  <th className="py-2 pr-4 font-medium">Маржа</th>
                </tr>
              </thead>
              <tbody>
                {data.by_model.map((model) => {
                  const simulatedCharge = modelPreviewMap.get(model.model) ?? 0;
                  const margin = simulatedCharge - model.provider_cost_usd;

                  return (
                    <tr key={model.model} className="border-b border-slate-100 last:border-0">
                      <td className="py-3 pr-4 font-mono text-xs text-slate-900">{model.model}</td>
                      <td className="py-3 pr-4">{formatNumber(model.events_count)}</td>
                      <td className="py-3 pr-4">{formatNumber(model.total_tokens)}</td>
                      <td className="py-3 pr-4">{formatUsd(model.provider_cost_usd)}</td>
                      <td className="py-3 pr-4">{formatUsd(model.current_charged_usd)}</td>
                      <td className="py-3 pr-4">{formatUsd(simulatedCharge)}</td>
                      <td className={cn('py-3 pr-4 font-semibold', margin >= 0 ? 'text-emerald-700' : 'text-red-700')}>
                        {formatUsd(margin)}
                      </td>
                    </tr>
                  );
                })}
                {data.by_model.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Нет usage-событий за выбранный период.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
