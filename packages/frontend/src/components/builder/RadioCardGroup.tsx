import { cn } from '../../lib/utils';

interface RadioCardOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface RadioCardGroupProps<T extends string> {
  options: RadioCardOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  columns?: 1 | 2 | 3;
}

export function RadioCardGroup<T extends string>({
  options,
  value,
  onChange,
  columns = 2,
}: RadioCardGroupProps<T>) {
  const gridCls =
    columns === 1
      ? 'grid-cols-1'
      : columns === 3
        ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
        : 'grid-cols-1 sm:grid-cols-2';

  return (
    <div className={cn('grid gap-3', gridCls)}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex flex-col items-start rounded-lg border p-4 text-left transition-all',
              'hover:border-primary/50 hover:shadow-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              selected
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'border-input bg-background',
            )}
          >
            <span className={cn('text-sm font-medium', selected && 'text-primary')}>
              {opt.label}
            </span>
            {opt.description && (
              <span className="mt-1 text-xs text-muted-foreground">{opt.description}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
