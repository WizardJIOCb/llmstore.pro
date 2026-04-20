interface RunMetadataProps {
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost?: string;
    charged_cost?: string;
    model?: string;
    usd_to_rub_rate?: number;
  } | null | undefined;
  latencyMs: number | undefined;
  agentName?: string;
  toolNames?: string[];
}

function formatCost(cost: string): string {
  const n = parseFloat(cost);
  if (n === 0) return '$0';
  if (n < 0.0001) return '<$0.0001';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(3)}`;
}

function formatRubFromUsd(cost: string, usdToRubRate?: number): string {
  const n = parseFloat(cost);
  const rate = typeof usdToRubRate === 'number' && Number.isFinite(usdToRubRate) && usdToRubRate > 0
    ? usdToRubRate
    : 90;
  if (n === 0) return '0 ₽';
  const rub = n * rate;
  if (rub < 0.01) return '<0.01 ₽';
  return `${rub.toFixed(2)} ₽`;
}

export function RunMetadata({ usage, latencyMs, agentName, toolNames }: RunMetadataProps) {
  if (!usage && !latencyMs && !agentName && (!toolNames || toolNames.length === 0)) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 break-words text-xs text-muted-foreground">
      {latencyMs != null && <span>Время: {(latencyMs / 1000).toFixed(1)}s</span>}
      {agentName && <span>Агент: {agentName}</span>}
      {toolNames && toolNames.length > 0 && <span>Инструменты: {toolNames.join(', ')}</span>}
      {usage && (
        <>
          <span>Токены: {usage.total_tokens}</span>
          <span className="hidden sm:inline">
            (prompt: {usage.prompt_tokens}, completion: {usage.completion_tokens})
          </span>
          {usage.charged_cost ? (
            <span>
              Списано: {formatCost(usage.charged_cost)} ({formatRubFromUsd(usage.charged_cost, usage.usd_to_rub_rate)})
            </span>
          ) : usage.estimated_cost ? (
            <span>
              Оценка: {formatCost(usage.estimated_cost)} ({formatRubFromUsd(usage.estimated_cost, usage.usd_to_rub_rate)})
            </span>
          ) : null}
          {usage.charged_cost && usage.estimated_cost && usage.charged_cost !== usage.estimated_cost && (
            <span className="hidden md:inline">
              Оценка: {formatCost(usage.estimated_cost)}
            </span>
          )}
          {usage.model && <span className="hidden md:inline">Модель: {usage.model.split('/').pop()}</span>}
        </>
      )}
    </div>
  );
}
