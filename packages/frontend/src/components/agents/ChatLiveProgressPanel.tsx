import type { ReactNode } from 'react';
import { Spinner } from '../ui/Spinner';
import { cn } from '../../lib/utils';

export interface ChatLiveProgressEvent {
  id: string;
  label: string;
  detail?: string;
  status?: string;
  tool_name?: string;
  ts?: string;
  error?: string;
}

interface ChatLiveProgressPanelProps {
  events: ChatLiveProgressEvent[];
  connected: boolean;
  className?: string;
  title?: string;
  connectedLabel?: string;
  disconnectedLabel?: string;
  trailing?: ReactNode;
}

function formatLiveProgressTimestamp(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function ChatLiveProgressPanel({
  events,
  connected,
  className,
  title = 'Живой процесс выполнения',
  connectedLabel = 'SSE подключен',
  disconnectedLabel = 'Ожидаю переподключение к SSE',
  trailing,
}: ChatLiveProgressPanelProps) {
  if (events.length === 0) return null;

  return (
    <div className={cn('rounded-xl border border-sky-200 bg-sky-50/80 p-4', className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-sky-950">{title}</p>
          <p className="text-xs text-sky-900/70">
            {connected ? connectedLabel : disconnectedLabel}
          </p>
        </div>
        {trailing}
      </div>
      <div className="space-y-2">
        {events.map((event) => (
          <div key={event.id} className="rounded-lg border border-sky-200/80 bg-white/80 px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-slate-900">{event.label}</p>
                {event.detail && (
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {event.detail}
                  </p>
                )}
                {(event.tool_name || event.status || event.error) && (
                  <p className="mt-1 text-xs text-slate-500">
                    {[event.tool_name, event.status, event.error].filter(Boolean).join(' • ')}
                  </p>
                )}
              </div>
              {event.ts && (
                <span className="shrink-0 text-[11px] text-slate-400">
                  {formatLiveProgressTimestamp(event.ts)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChatLiveProgressTrailingBusy() {
  return (
    <div className="flex items-center gap-2 text-xs text-sky-900/80">
      <Spinner size="sm" /> Агент работает
    </div>
  );
}
