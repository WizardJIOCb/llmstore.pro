import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  estimated_cost?: string;
  usd_to_rub_rate?: number;
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
    second: '2-digit',
  }).format(new Date(iso));
}

function formatInt(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}

function formatUsd(value: number): string {
  const digits = value >= 1 ? 3 : 4;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatRub(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${totalSeconds} с`;
  }

  return `${minutes} мин ${seconds.toString().padStart(2, '0')} с`;
}

function buildUsageLabel(event: ChatLiveProgressEvent): string | null {
  if (
    typeof event.completion_tokens !== 'number' &&
    typeof event.total_tokens !== 'number'
  ) {
    return null;
  }

  const parts: string[] = [];

  if (typeof event.completion_tokens === 'number') {
    parts.push(`Сгенерировано: ${formatInt(event.completion_tokens)}`);
  }

  if (typeof event.total_tokens === 'number') {
    parts.push(`Всего: ${formatInt(event.total_tokens)}`);
  }

  const costUsd = typeof event.estimated_cost === 'string' ? Number(event.estimated_cost) : Number.NaN;
  if (Number.isFinite(costUsd)) {
    parts.push(formatUsd(costUsd));
    if (typeof event.usd_to_rub_rate === 'number') {
      parts.push(formatRub(costUsd * event.usd_to_rub_rate));
    }
  }

  return parts.join(' • ');
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
  const [animatedEventIds, setAnimatedEventIds] = useState<string[]>([]);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const animationTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (seenEventIdsRef.current.size === 0) {
      events.forEach((event) => seenEventIdsRef.current.add(event.id));
      return;
    }

    const nextAnimatedIds: string[] = [];
    for (const event of events) {
      if (!seenEventIdsRef.current.has(event.id)) {
        seenEventIdsRef.current.add(event.id);
        nextAnimatedIds.push(event.id);
      }
    }

    if (nextAnimatedIds.length === 0) return;

    setAnimatedEventIds((prev) => [...new Set([...prev, ...nextAnimatedIds])]);

    nextAnimatedIds.forEach((id) => {
      const existingTimer = animationTimersRef.current.get(id);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      const timer = setTimeout(() => {
        setAnimatedEventIds((prev) => prev.filter((item) => item !== id));
        animationTimersRef.current.delete(id);
      }, 520);
      animationTimersRef.current.set(id, timer);
    });
  }, [events]);

  useEffect(() => () => {
    animationTimersRef.current.forEach((timer) => clearTimeout(timer));
    animationTimersRef.current.clear();
  }, []);

  useEffect(() => {
    if (events.length === 0) return;

    setNowMs(Date.now());
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [events.length]);

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
        {events.map((event, index) => {
          const usageLabel = buildUsageLabel(event);
          const isFresh = animatedEventIds.includes(event.id);
          const startedAtMs = event.ts ? Date.parse(event.ts) : Number.NaN;
          const nextEvent = events[index + 1];
          const nextEventMs = nextEvent?.ts ? Date.parse(nextEvent.ts) : Number.NaN;
          const elapsedLabel = Number.isFinite(startedAtMs)
            ? formatElapsed(
                Math.max(
                  0,
                  (Number.isFinite(nextEventMs) ? nextEventMs : nowMs) - startedAtMs,
                ),
              )
            : null;
          const progressLabel = [usageLabel, elapsedLabel ? `Прошло: ${elapsedLabel}` : null]
            .filter(Boolean)
            .join(' • ');

          return (
            <div
              key={event.id}
              className={cn(
                'rounded-lg border border-sky-200/80 bg-white/80 px-3 py-2',
                isFresh && 'animate-[fadeIn_260ms_ease-out,zoomIn_280ms_ease-out]',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-start gap-2">
                    <span className="inline-flex min-w-7 shrink-0 justify-center rounded-full border border-sky-200 bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-900">
                      {index + 1}
                    </span>
                    <p className="pt-0.5 text-sm text-slate-900">{event.label}</p>
                  </div>
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
                  {progressLabel && (
                    <p className="mt-1 text-xs font-medium text-sky-900/80">
                      {progressLabel}
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
          );
        })}
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
