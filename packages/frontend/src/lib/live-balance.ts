import type { QueryClient } from '@tanstack/react-query';
import type { UserProfile } from '@llmstore/shared';
import type { MutableRefObject } from 'react';

interface LiveBalancePayload {
  run_id?: string;
  charged_cost?: string;
  usd_to_rub_rate?: number;
  balance_after_usd?: string;
}

export function shouldApplyLiveBalanceEvent(eventName: string): boolean {
  return (
    eventName === 'chat.run.started'
    || eventName === 'chat.run.status'
    || eventName === 'chat.run.tool.started'
    || eventName === 'chat.run.tool.finished'
    || eventName === 'chat.message.completed'
  );
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
  const nextChargedCost = toFiniteNumber(payload.charged_cost);
  if (!runId || nextChargedCost <= 0) return;

  const previousCost = seenCostsByRun.current[runId] ?? 0;
  if (nextChargedCost <= previousCost) return;

  const deltaUsd = nextChargedCost - previousCost;
  seenCostsByRun.current[runId] = nextChargedCost;

  queryClient.setQueryData<UserProfile | undefined>(['profile'], (current) => {
    if (!current) return current;

    const currentUsd = toFiniteNumber(current.balance_usd);
    const currentRub = toFiniteNumber(current.balance_rub);
    const rate = toFiniteNumber(payload.usd_to_rub_rate) || toFiniteNumber(current.usd_to_rub_rate);

    return {
      ...current,
      balance_usd: typeof payload.balance_after_usd === 'string'
        ? toFixedBalance(toFiniteNumber(payload.balance_after_usd))
        : toFixedBalance(currentUsd - deltaUsd),
      balance_rub: toFixedBalance(currentRub - (deltaUsd * rate)),
    };
  });
}
