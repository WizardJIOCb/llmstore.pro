import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type RouteTransitionMode = 'soft' | 'glide' | 'flash' | 'focus';

interface RouteTransitionShellProps {
  children: ReactNode;
  routeKey: string;
  enabled: boolean;
  mode: RouteTransitionMode;
}

const EXIT_MS = 170;
const ENTER_MS = 240;

export function RouteTransitionShell({ children, routeKey, enabled, mode }: RouteTransitionShellProps) {
  const [displayedChildren, setDisplayedChildren] = useState(children);
  const [displayedRouteKey, setDisplayedRouteKey] = useState(routeKey);
  const [phase, setPhase] = useState<'idle' | 'exit' | 'enter'>('idle');
  const [flashPulseKey, setFlashPulseKey] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ routeKey: string; children: ReactNode } | null>(null);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    setPrefersReducedMotion(media.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!enabled || prefersReducedMotion) {
      pendingRef.current = null;
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
      setDisplayedChildren(children);
      setDisplayedRouteKey(routeKey);
      setPhase('idle');
      return;
    }

    if (routeKey === displayedRouteKey) {
      setDisplayedChildren(children);
      return;
    }

    pendingRef.current = { routeKey, children };

    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    if (enterTimerRef.current) clearTimeout(enterTimerRef.current);

    setPhase('exit');
    exitTimerRef.current = setTimeout(() => {
      const pending = pendingRef.current;
      if (!pending) return;

      setDisplayedChildren(pending.children);
      setDisplayedRouteKey(pending.routeKey);
      if (mode === 'flash') {
        setFlashPulseKey((current) => current + 1);
      }
      setPhase('enter');

      enterTimerRef.current = setTimeout(() => {
        pendingRef.current = null;
        setPhase('idle');
      }, ENTER_MS);
    }, EXIT_MS);
  }, [children, displayedRouteKey, enabled, mode, prefersReducedMotion, routeKey]);

  const transitionClass = phase === 'idle'
    ? null
    : phase === 'exit'
      ? {
          soft: 'route-transition--soft-out',
          glide: 'route-transition--glide-out',
          flash: 'route-transition--flash-out',
          focus: 'route-transition--focus-out',
        }[mode]
      : {
          soft: 'route-transition--soft-in',
          glide: 'route-transition--glide-in',
          flash: 'route-transition--flash-in',
          focus: 'route-transition--focus-in',
        }[mode];

  return (
    <div className="route-transition-shell">
      {mode === 'flash' && enabled && !prefersReducedMotion ? (
        <div
          key={flashPulseKey}
          className={cn(
            'route-transition__flash',
            phase === 'enter' && 'route-transition__flash--pulse',
          )}
          aria-hidden="true"
        />
      ) : null}
      <div className={cn('route-transition__content', transitionClass)}>
        {displayedChildren}
      </div>
    </div>
  );
}
