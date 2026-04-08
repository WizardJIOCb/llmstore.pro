interface RawReactionCounter {
  id?: number;
  count?: number;
}

interface RawReactionsPayload {
  counters?: RawReactionCounter[];
}

interface RawLikesPayload {
  counterLikes?: number;
}

const DTF_REACTION_LABELS: Record<number, string> = {
  1: 'лайки',
  2: 'огонь',
  3: 'смех',
  4: 'сердца',
  5: 'удивление',
  6: 'дизлайки',
};

export interface DtfReactionBreakdownItem {
  id: number;
  label: string;
  count: number;
}

export interface DtfReactionStats {
  reactions_count: number;
  reaction_breakdown: DtfReactionBreakdownItem[];
  reactions_summary: string;
}

export function buildDtfReactionStats(input: {
  counters?: { reactions?: number } | null;
  reactions?: RawReactionsPayload | null;
  likes?: RawLikesPayload | number | null;
}): DtfReactionStats {
  const rawCounters = input.reactions?.counters ?? [];
  const normalizedCounters = rawCounters
    .map((item) => ({
      id: typeof item?.id === 'number' ? item.id : null,
      count: typeof item?.count === 'number' ? item.count : 0,
    }))
    .filter((item): item is { id: number; count: number } => item.id !== null && item.count > 0);

  const likesCount = typeof input.likes === 'object' && input.likes !== null
    ? (typeof input.likes.counterLikes === 'number' ? input.likes.counterLikes : 0)
    : 0;

  const breakdown = normalizedCounters.map((item) => ({
    id: item.id,
    label: DTF_REACTION_LABELS[item.id] ?? `реакция ${item.id}`,
    count: item.count,
  }));

  if (likesCount > 0 && !breakdown.some((item) => item.label === 'лайки')) {
    breakdown.unshift({
      id: 1,
      label: 'лайки',
      count: likesCount,
    });
  }

  const breakdownTotal = breakdown.reduce((sum, item) => sum + item.count, 0);
  const apiTotal = typeof input.counters?.reactions === 'number' ? input.counters.reactions : 0;
  const reactionsCount = Math.max(apiTotal, breakdownTotal, likesCount);
  const summary = breakdown.length > 0
    ? breakdown.map((item) => `${item.label}: ${item.count}`).join(', ')
    : `всего: ${reactionsCount}`;

  return {
    reactions_count: reactionsCount,
    reaction_breakdown: breakdown,
    reactions_summary: summary,
  };
}
