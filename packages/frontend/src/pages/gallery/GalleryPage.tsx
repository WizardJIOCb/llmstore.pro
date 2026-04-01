import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGalleryPreviews } from '../../hooks/useChats';
import type { GalleryPreviewItem } from '../../lib/api/chats';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';

const PAGE_SIZE_OPTIONS = [2, 4, 6, 8, 10];

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function formatViews(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

function formatUsdCost(value: number): string {
  if (value === 0) return '$0';
  if (value < 0.0001) return '<$0.0001';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(3)}`;
}

function formatRubCost(value: number): string {
  if (value === 0) return '0 ₽';
  if (value < 0.01) return '<0.01 ₽';
  return `${value.toFixed(2)} ₽`;
}

function formatModelName(model: string | null): string | null {
  if (!model) return null;
  const trimmed = model.trim();
  if (!trimmed) return null;
  const lastPart = trimmed.split('/').pop()?.trim();
  return lastPart && lastPart.length > 0 ? lastPart : trimmed;
}

function buildPageButtons(totalPages: number, currentPage: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  if (currentPage <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (currentPage >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
    pages.add(totalPages - 3);
  }

  const sorted = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const result: Array<number | 'ellipsis'> = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const page = sorted[index]!;
    const previous = sorted[index - 1];
    if (previous && page - previous > 1) {
      result.push('ellipsis');
    }
    result.push(page);
  }

  return result;
}

function buildGalleryPreviewUrl(item: GalleryPreviewItem): string | null {
  if (!item.preview_url) return null;
  try {
    const url = new URL(item.preview_url, window.location.origin);
    url.searchParams.set('gallery', '1');
    url.searchParams.set('previewId', `gallery-${item.message_id}`);
    return url.toString();
  } catch {
    return item.preview_url;
  }
}

function GalleryPreviewFrame({ item }: { item: GalleryPreviewItem }) {
  const previewUrl = useMemo(() => buildGalleryPreviewUrl(item), [item]);

  if (item.preview_type === 'html' && previewUrl) {
    return (
      <iframe
        title={item.preview_title || item.chat_title}
        src={previewUrl}
        className="h-full w-full bg-white"
        sandbox="allow-scripts"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  }

  if (previewUrl) {
    return (
      <a
        href={previewUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-full items-center justify-center p-6 text-sm text-primary underline"
      >
        Открыть внешний preview
      </a>
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
      Preview недоступен
    </div>
  );
}

export function GalleryPage() {
  const [pageSize, setPageSize] = useState(4);
  const [currentPage, setCurrentPage] = useState(1);
  const { data, isLoading, error } = useGalleryPreviews(120);

  const items = data ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const pageButtons = useMemo(() => buildPageButtons(totalPages, currentPage), [currentPage, totalPages]);
  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [currentPage, items, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Галерея</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Здесь собраны публичные preview из общих чатов: можно посмотреть результат,
            узнать автора, открыть сам чат и вдохновиться свежими генерациями.
          </p>
        </div>

        {!isLoading && !error && items.length > 0 && (
          <div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Показано {currentItems.length} из {items.length} preview, страница {currentPage} из {totalPages}
            </p>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Показывать</span>
              <Select
                value={String(pageSize)}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setCurrentPage(1);
                }}
                options={PAGE_SIZE_OPTIONS.map((value) => ({ value: String(value), label: String(value) }))}
                className="h-9 min-w-[88px]"
              />
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}

        {!isLoading && error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
            Не удалось загрузить галерею preview.
          </div>
        )}

        {!isLoading && !error && items.length === 0 && (
          <div className="rounded-2xl border bg-muted/20 p-8 text-center text-muted-foreground">
            Пока нет публичных preview для галереи.
          </div>
        )}

        {!isLoading && !error && items.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2">
            {currentItems.map((item) => (
              <article key={item.message_id} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                <div className="aspect-[16/10] border-b bg-slate-50">
                  <GalleryPreviewFrame item={item} />
                </div>

                <div className="space-y-4 p-5">
                  <div className="space-y-2">
                    <p className="line-clamp-2 text-lg font-semibold">{item.chat_title}</p>
                    {item.preview_title && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">{item.preview_title}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border bg-muted/20 px-2.5 py-1">
                      Автор: {item.author_name}
                    </span>
                    <span className="rounded-full border bg-muted/20 px-2.5 py-1">
                      Просмотров: {formatViews(item.view_count)}
                    </span>
                    <span className="rounded-full border bg-muted/20 px-2.5 py-1">
                      {formatDate(item.created_at)}
                    </span>
                    <span className="rounded-full border bg-muted/20 px-2.5 py-1">
                      Стоимость: {formatUsdCost(item.total_usd_cost)} ({formatRubCost(item.total_rub_cost)})
                    </span>
                    {formatModelName(item.model) && (
                      <span className="rounded-full border bg-muted/20 px-2.5 py-1">
                        Модель: {formatModelName(item.model)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Link to={item.chat_url}>
                      <Button size="sm">Перейти в чат</Button>
                    </Link>
                    {item.preview_url && (
                      <a href={item.preview_url} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm">Открыть preview</Button>
                      </a>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {!isLoading && !error && items.length > 0 && totalPages > 1 && (
          <div className="flex flex-col gap-4 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((value) => Math.max(1, value - 1))}
                disabled={currentPage === 1}
              >
                Предыдущая
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((value) => Math.min(totalPages, value + 1))}
                disabled={currentPage === totalPages}
              >
                Следующая
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {pageButtons.map((value, index) =>
                value === 'ellipsis' ? (
                  <span key={`ellipsis-${index}`} className="px-2 text-sm text-muted-foreground">
                    ...
                  </span>
                ) : (
                  <Button
                    key={value}
                    variant={value === currentPage ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setCurrentPage(value)}
                  >
                    {value}
                  </Button>
                ),
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
