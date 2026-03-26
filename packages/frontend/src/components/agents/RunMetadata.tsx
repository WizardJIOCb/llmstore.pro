interface RunMetadataProps {
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost?: string;
    model?: string;
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

export function RunMetadata({ usage, latencyMs, agentName, toolNames }: RunMetadataProps) {
  if (!usage && !latencyMs && !agentName && (!toolNames || toolNames.length === 0)) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {latencyMs != null && <span>Время: {(latencyMs / 1000).toFixed(1)}s</span>}
      {agentName && <span>Агент: {agentName}</span>}
      {toolNames && toolNames.length > 0 && <span>Инструменты: {toolNames.join(', ')}</span>}
      {usage && (
        <>
          <span>Токены: {usage.total_tokens}</span>
          <span className="hidden sm:inline">
            (prompt: {usage.prompt_tokens}, completion: {usage.completion_tokens})
          </span>
          {usage.estimated_cost && <span>Стоимость: {formatCost(usage.estimated_cost)}</span>}
          {usage.model && <span className="hidden md:inline">Модель: {usage.model.split('/').pop()}</span>}
        </>
      )}
    </div>
  );
}
