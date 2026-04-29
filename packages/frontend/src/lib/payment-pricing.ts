export const FALLBACK_TOP_UP_AMOUNTS_RUB = [100, 500, 1000, 3000, 5000, 10000];

export function resolveTopUpAmounts(presetAmounts?: number[]): number[] {
  const source = presetAmounts && presetAmounts.length > 0
    ? presetAmounts
    : FALLBACK_TOP_UP_AMOUNTS_RUB;

  return Array.from(
    new Set(
      source.filter((amount) => Number.isFinite(amount) && amount > 0),
    ),
  ).sort((left, right) => left - right);
}

export function formatRubAmount(amount: number): string {
  return `${amount.toLocaleString('ru-RU')} ₽`;
}
