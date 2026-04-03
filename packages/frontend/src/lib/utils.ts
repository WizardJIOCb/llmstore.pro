import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type NumericValue = number | string | null | undefined;

interface CurrencyFormatOptions {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  useGrouping?: boolean;
  symbolPosition?: 'prefix' | 'suffix';
}

function toFiniteNumber(value: NumericValue): number {
  const numeric = typeof value === 'string' ? Number(value) : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function formatUsd(value: NumericValue, options: CurrencyFormatOptions = {}): string {
  const amount = toFiniteNumber(value);
  const {
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
    useGrouping = false,
  } = options;

  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits,
    maximumFractionDigits,
    useGrouping,
  })}`;
}

export function formatRub(value: NumericValue, options: CurrencyFormatOptions = {}): string {
  const amount = toFiniteNumber(value);
  const {
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
    useGrouping = true,
    symbolPosition = 'suffix',
  } = options;

  const formatted = amount.toLocaleString('ru-RU', {
    minimumFractionDigits,
    maximumFractionDigits,
    useGrouping,
  });

  return symbolPosition === 'prefix' ? `₽${formatted}` : `${formatted} ₽`;
}

interface UsdRubPairOptions {
  usdMinimumFractionDigits?: number;
  usdMaximumFractionDigits?: number;
  rubMinimumFractionDigits?: number;
  rubMaximumFractionDigits?: number;
  usdUseGrouping?: boolean;
  rubUseGrouping?: boolean;
}

export function formatUsdRubPair(
  usdValue: NumericValue,
  usdToRubRate: NumericValue,
  options: UsdRubPairOptions = {},
): string {
  const amountUsd = toFiniteNumber(usdValue);
  const rate = toFiniteNumber(usdToRubRate);

  return `${formatUsd(amountUsd, {
    minimumFractionDigits: options.usdMinimumFractionDigits ?? 4,
    maximumFractionDigits: options.usdMaximumFractionDigits ?? 4,
    useGrouping: options.usdUseGrouping ?? false,
  })} / ${formatRub(amountUsd * rate, {
    minimumFractionDigits: options.rubMinimumFractionDigits ?? 2,
    maximumFractionDigits: options.rubMaximumFractionDigits ?? 2,
    useGrouping: options.rubUseGrouping ?? true,
  })}`;
}
