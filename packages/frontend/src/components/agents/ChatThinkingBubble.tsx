import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

interface ChatThinkingBubbleProps {
  label?: string;
  detail?: string;
  startedAt?: string | null;
  className?: string;
  presenceState?: 'enter' | 'exit';
  onHeightChange?: (height: number) => void;
}

function formatThinkingElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${totalSeconds} с`;
  }

  return `${minutes} мин ${seconds.toString().padStart(2, '0')} с`;
}

export function ChatThinkingBubble({
  label = 'Думаю...',
  detail = 'Собираю следующий ответ.',
  startedAt,
  className,
  presenceState = 'enter',
  onHeightChange,
}: ChatThinkingBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [elapsedLabel, setElapsedLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!startedAt) {
      setElapsedLabel(null);
      return;
    }

    const startedAtMs = Date.parse(startedAt);
    if (Number.isNaN(startedAtMs)) {
      setElapsedLabel(null);
      return;
    }

    const updateElapsed = () => {
      setElapsedLabel(formatThinkingElapsed(Date.now() - startedAtMs));
    };

    updateElapsed();
    const intervalId = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(intervalId);
  }, [startedAt]);

  useEffect(() => {
    if (!bubbleRef.current || !onHeightChange) return;

    const measure = () => {
      onHeightChange(Math.ceil(bubbleRef.current?.getBoundingClientRect().height ?? 0));
    };

    measure();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => measure());
    observer.observe(bubbleRef.current);
    return () => observer.disconnect();
  }, [detail, elapsedLabel, label, onHeightChange, presenceState]);

  return (
    <div
      ref={bubbleRef}
      className={cn(
        'chat-thinking-bubble flex justify-start',
        presenceState === 'enter' && 'chat-thinking-bubble--enter',
        presenceState === 'exit' && 'chat-thinking-bubble--exit',
        className,
      )}
    >
      <div className="chat-thinking-bubble__surface relative w-full max-w-[28rem] overflow-hidden rounded-[24px] border border-sky-200/80 bg-[linear-gradient(135deg,rgba(248,250,252,0.98),rgba(240,249,255,0.98)_52%,rgba(236,254,255,0.98))] px-4 py-3 text-slate-900 shadow-[0_20px_55px_-30px_rgba(14,116,144,0.55)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(103,232,249,0.26),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(45,212,191,0.18),transparent_36%)]" />
        <div className="relative flex items-center gap-3">
          <div className="chat-thinking-loader" aria-hidden="true">
            <span className="chat-thinking-loader__ring chat-thinking-loader__ring--outer" />
            <span className="chat-thinking-loader__ring chat-thinking-loader__ring--middle" />
            <span className="chat-thinking-loader__ring chat-thinking-loader__ring--inner" />
            <span className="chat-thinking-loader__core" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold tracking-[0.01em] text-slate-900">{label}</p>
              {elapsedLabel ? (
                <span className="rounded-full border border-sky-200/80 bg-white/70 px-2 py-0.5 text-[11px] font-medium text-sky-800">
                  {elapsedLabel}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
