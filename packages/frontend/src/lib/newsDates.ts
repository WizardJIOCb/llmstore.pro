export interface NewsDateParts {
  date: string;
  time: string;
}

export function formatNewsDateParts(value: string | null, options?: { shortMonth?: boolean }): NewsDateParts | null {
  if (!value) return null;

  const date = new Date(value);
  return {
    date: date.toLocaleDateString('ru-RU', {
      day: options?.shortMonth ? '2-digit' : 'numeric',
      month: options?.shortMonth ? 'short' : 'long',
      year: options?.shortMonth ? undefined : 'numeric',
    }),
    time: date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}
