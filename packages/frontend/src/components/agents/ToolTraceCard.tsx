import { useState } from 'react';
import type { ToolTrace } from '../../lib/api/agents';
import { cn } from '../../lib/utils';

interface ToolTraceCardProps {
  trace: ToolTrace;
}

export function ToolTraceCard({ trace }: ToolTraceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isError = trace.status === 'error';

  return (
    <div
      className={cn(
        'rounded-md border text-sm',
        isError ? 'border-destructive/50 bg-destructive/5' : 'border-border bg-muted/50',
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', isError ? 'bg-destructive' : 'bg-green-500')} />
          <span className="font-mono font-medium">{trace.tool_name}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {trace.duration_ms != null && <span>{trace.duration_ms}ms</span>}
          <span>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t px-3 py-2 space-y-2">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Input</div>
            <pre className="text-xs bg-background rounded p-2 overflow-x-auto max-h-40">
              {JSON.stringify(trace.input, null, 2)}
            </pre>
          </div>
          {trace.output && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Output</div>
              <pre className="text-xs bg-background rounded p-2 overflow-x-auto max-h-40">
                {JSON.stringify(trace.output, null, 2)}
              </pre>
            </div>
          )}
          {trace.error && (
            <div>
              <div className="text-xs font-medium text-destructive mb-1">Error</div>
              <pre className="text-xs bg-background rounded p-2">{trace.error}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
