interface RunMetadataProps {
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null | undefined;
  latencyMs: number | undefined;
}

export function RunMetadata({ usage, latencyMs }: RunMetadataProps) {
  if (!usage && !latencyMs) return null;

  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      {latencyMs != null && (
        <span>Время: {(latencyMs / 1000).toFixed(1)}s</span>
      )}
      {usage && (
        <>
          <span>Токены: {usage.total_tokens}</span>
          <span className="hidden sm:inline">
            (prompt: {usage.prompt_tokens}, completion: {usage.completion_tokens})
          </span>
        </>
      )}
    </div>
  );
}
