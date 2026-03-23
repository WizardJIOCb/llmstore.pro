import type { ScoredItem } from '@llmstore/shared';
import { Card, CardContent, Badge } from '../ui';
import { confidenceLabels } from '../../lib/label-maps';
import { cn } from '../../lib/utils';

interface RecommendedCardProps {
  item: ScoredItem;
  label: string;
  variant?: 'primary' | 'secondary';
}

const badgeVariant: Record<string, 'success' | 'warning' | 'secondary'> = {
  high: 'success',
  medium: 'warning',
  low: 'secondary',
};

export function RecommendedCard({ item, label, variant = 'secondary' }: RecommendedCardProps) {
  const ci = item.catalog_item;

  return (
    <Card
      className={cn(
        'relative overflow-hidden',
        variant === 'primary' && 'border-primary ring-1 ring-primary',
      )}
    >
      {/* Category ribbon */}
      <div
        className={cn(
          'px-3 py-1.5 text-xs font-semibold',
          variant === 'primary'
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground',
        )}
      >
        {label}
      </div>

      <CardContent className="p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">{ci.title}</h3>
            {ci.short_description && (
              <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                {ci.short_description}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="text-lg font-bold text-primary">{item.score}</span>
            <Badge variant={badgeVariant[item.confidence] ?? 'secondary'}>
              {confidenceLabels[item.confidence]}
            </Badge>
          </div>
        </div>

        {/* Compatibility breakdown */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(item.compatibility_breakdown).map(([key, val]) => (
            <span
              key={key}
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium',
                val > 0
                  ? 'bg-green-100 text-green-800'
                  : val < 0
                    ? 'bg-red-100 text-red-800'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {key}: {val > 0 ? '+' : ''}{val}
            </span>
          ))}
        </div>

        {/* Penalties */}
        {item.penalties.length > 0 && (
          <div className="mt-2 space-y-0.5">
            {item.penalties.map((p, i) => (
              <p key={i} className="text-xs text-destructive">
                {p}
              </p>
            ))}
          </div>
        )}

        {/* Tags */}
        {ci.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {ci.tags.slice(0, 5).map((tag) => (
              <span key={tag.id} className="text-xs text-muted-foreground">
                #{tag.slug}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
