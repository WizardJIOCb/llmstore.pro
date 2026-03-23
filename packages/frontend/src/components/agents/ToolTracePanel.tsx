import type { ToolTrace } from '../../lib/api/agents';
import { ToolTraceCard } from './ToolTraceCard';

interface ToolTracePanelProps {
  traces: ToolTrace[];
}

export function ToolTracePanel({ traces }: ToolTracePanelProps) {
  if (traces.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        Вызовы инструментов появятся здесь
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold mb-2">Вызовы инструментов ({traces.length})</h3>
      {traces.map((trace, i) => (
        <ToolTraceCard key={`${trace.tool_call_id}-${i}`} trace={trace} />
      ))}
    </div>
  );
}
