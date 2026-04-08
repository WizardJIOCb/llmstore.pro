import type { QueryClient } from '@tanstack/react-query';
import type { UserProfile } from '@llmstore/shared';
import type { MutableRefObject } from 'react';

interface LiveBalancePayload {
  run_id?: string;
  estimated_cost?: string;
  usd_to_rub_rate?: number;
}

function toFiniteNumber(value: unknown): number {
  const numeric = typeof value === 'string' ? Number(value) : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toFixedBalance(value: number): string {
  return Math.max(0, value).toFixed(4);
}

export function applyLiveBalanceDelta(
  queryClient: QueryClient,
  seenCostsByRun: MutableRefObject<Record<string, number>>,
  payload: LiveBalancePayload,
) {
  const runId = typeof payload.run_id === 'string' ? payload.run_id.trim() : '';
  const nextEstimatedCost = toFiniteNumber(payload.estimated_cost);
  if (!runId || nextEstimatedCost <= 0) return;

  const previousCost = seenCostsByRun.current[runId] ?? 0;
  if (nextEstimatedCost <= previousCost) return;

  const deltaUsd = nextEstimatedCost - previousCost;
  seenCostsByRun.current[runId] = nextEstimatedCost;

  queryClient.setQueryData<UserProfile | undefined>(['profile'], (current) => {
    if (!current) return current;

    const currentUsd = toFiniteNumber(current.balance_usd);
    const currentRub = toFiniteNumber(current.balance_rub);
    const rate = toFiniteNumber(payload.usd_to_rub_rate) || toFiniteNumber(current.usd_to_rub_rate);

    return {
      ...current,
      balance_usd: toFixedBalance(currentUsd - deltaUsd),
      balance_rub: toFixedBalance(currentRub - (deltaUsd * rate)),
    };
  });
}
