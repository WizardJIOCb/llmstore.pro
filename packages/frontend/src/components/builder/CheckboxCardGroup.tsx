import { cn } from '../../lib/utils';

interface CheckboxCardOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface CheckboxCardGroupProps<T extends string> {
  options: CheckboxCardOption<T>[];
  value: T[];
  onChange: (value: T[]) => void;
  columns?: 1 | 2 | 3;
}

export function CheckboxCardGroup<T extends string>({
  options,
  value,
  onChange,
  columns = 2,
}: CheckboxCardGroupProps<T>) {
  const gridCls =
    columns === 1
      ? 'grid-cols-1'
      : columns === 3
        ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
        : 'grid-cols-1 sm:grid-cols-2';

  const toggle = (item: T) => {
    if (value.includes(item)) {
      onChange(value.filter((v) => v !== item));
    } else {
      onChange([...value, item]);
    }
  };

  return (
    <div className={cn('grid gap-3', gridCls)}>
      {options.map((opt) => {
        const selected = value.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            className={cn(
              'flex items-start gap-3 rounded-lg border p-4 text-left transition-all',
              'hover:border-primary/50 hover:shadow-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              selected
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'border-input bg-background',
            )}
          >
            <div
              className={cn(
                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-muted-foreground/30',
              )}
            >
              {selected && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path
                    d="M2 5L4 7L8 3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
            <div className="flex flex-col">
              <span className={cn('text-sm font-medium', selected && 'text-primary')}>
                {opt.label}
              </span>
              {opt.description && (
                <span className="mt-0.5 text-xs text-muted-foreground">{opt.description}</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
