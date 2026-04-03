import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useDeleteGalleryReaction, useGalleryPreviews, useSetGalleryReaction } from '../../hooks/useChats';
import { chatsApi } from '../../lib/api/chats';
import type { ChatReactionType, GalleryPreviewItem, ProjectRunResult } from '../../lib/api/chats';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { UserLink } from '../../components/users/UserLink';
import { authApi } from '../../lib/api/auth';

const PAGE_SIZE_OPTIONS = [2, 4, 6, 8, 10];
const REACTION_OPTIONS: Array<{ type: ChatReactionType; emoji: string; label: string }> = [
  { type: 'heart', emoji: '❤', label: 'Сердце' },
  { type: 'thumbs_up', emoji: '👍', label: 'Нравится' },
  { type: 'thumbs_down', emoji: '👎', label: 'Не нравится' },
  { type: 'laugh', emoji: '🤣', label: 'Смешно' },
  { type: 'meh', emoji: '😐', label: 'Нейтрально' },
];
const GALLERY_KIND_FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'project', label: 'Runnable Projects' },
  { value: 'preview', label: 'Лендинги и Preview' },
] as const;

type GalleryKindFilter = (typeof GALLERY_KIND_FILTERS)[number]['value'];

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

function formatProjectRuntime(runtime: GalleryPreviewItem['project_runtime']): string | null {
  if (!runtime) return null;
  if (runtime === 'node') return 'Node.js';
  if (runtime === 'python') return 'Python';
  if (runtime === 'static') return 'Static';
  if (runtime === 'generic') return 'Generic';
  return runtime;
}

function formatKindLabel(kind: GalleryPreviewItem['kind']): string {
  if (kind === 'project') return 'Runnable Project';
  if (kind === 'hybrid') return 'Preview + Project';
  return 'Preview';
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

function matchesKindFilter(item: GalleryPreviewItem, filter: GalleryKindFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'project') return item.kind === 'project' || item.kind === 'hybrid';
  return item.kind === 'preview' || item.kind === 'hybrid';
}

function buildSearchText(item: GalleryPreviewItem): string {
  return [
    item.chat_title,
    item.preview_title,
    item.project_title,
    item.project_runtime,
    item.project_entrypoint,
    item.author_name,
    item.author_username,
    item.model,
    item.kind,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();
}

function GalleryArtifactFrame({ item }: { item: GalleryPreviewItem }) {
  const previewUrl = useMemo(() => buildGalleryPreviewUrl(item), [item]);

  if ((item.kind === 'preview' || item.kind === 'hybrid') && item.preview_type === 'html' && previewUrl) {
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

  if ((item.kind === 'preview' || item.kind === 'hybrid') && previewUrl) {
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
    <div className="flex h-full flex-col justify-between bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_38%),linear-gradient(135deg,#0f172a,#111827_52%,#1e293b)] p-6 text-white">
      <div className="space-y-3">
        <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-sky-100">
          Runnable Project
        </span>
        <div>
          <p className="text-lg font-semibold">
            {item.project_title || item.chat_title}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            Самодостаточный проект из чата, который можно скачать и запустить.
          </p>
        </div>
      </div>

      <div className="grid gap-2 text-sm text-slate-200 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          Runtime: {formatProjectRuntime(item.project_runtime) || 'Не указан'}
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          Файлов: {item.project_file_count || 0}
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 sm:col-span-2">
          Entrypoint: {item.project_entrypoint || 'Не указан'}
        </div>
      </div>
    </div>
  );
}

export function GalleryPage() {
  const [pageSize, setPageSize] = useState(4);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<GalleryKindFilter>('all');
  const [runningMessageId, setRunningMessageId] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<(ProjectRunResult & {
    title: string;
    message_id: string;
    chat_id: string;
  }) | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const { data: currentUser } = useQuery({
    queryKey: ['gallery-auth-me'],
    queryFn: async () => {
      try {
        return await authApi.me();
      } catch {
        return null;
      }
    },
    staleTime: 30_000,
  });
  const { data, isLoading, error } = useGalleryPreviews(120);
  const setReactionMutation = useSetGalleryReaction();
  const deleteReactionMutation = useDeleteGalleryReaction();

  const items = data ?? [];
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (!matchesKindFilter(item, kindFilter)) {
        return false;
      }

      if (!query) {
        return true;
      }

      return buildSearchText(item).includes(query);
    });
  }, [items, kindFilter, search]);
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const pageButtons = useMemo(() => buildPageButtons(totalPages, currentPage), [currentPage, totalPages]);
  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [currentPage, filteredItems, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [kindFilter, pageSize, search]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const runGalleryProject = async (item: GalleryPreviewItem) => {
    if (!currentUser) return;

    setRunError(null);
    setRunningMessageId(item.message_id);
    try {
      const result = await chatsApi.runProject(item.chat_id, item.message_id);
      setRunResult({
        ...result,
        title: item.project_title || item.preview_title || item.chat_title,
        message_id: item.message_id,
        chat_id: item.chat_id,
      });
    } catch (error) {
      const maybe = error as { response?: { data?: { error?: { message?: string } } } };
      setRunError(maybe?.response?.data?.error?.message ?? 'Не удалось запустить проект из галереи');
    } finally {
      setRunningMessageId(null);
    }
  };

  return (
    <div className="px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Галерея</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Здесь собраны публичные результаты из общих чатов: лендинги и preview, а также runnable project bundle.
            Можно быстро отфильтровать нужный тип, найти проект по названию и открыть исходный чат.
          </p>
        </div>

        {!isLoading && !error && items.length > 0 && (
          <div className="space-y-4 rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <p className="text-sm text-muted-foreground">
                Найдено {filteredItems.length} из {items.length} элементов, страница {currentPage} из {totalPages}
              </p>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Показывать</span>
                <Select
                  value={String(pageSize)}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  options={PAGE_SIZE_OPTIONS.map((value) => ({ value: String(value), label: String(value) }))}
                  className="h-9 min-w-[88px]"
                />
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Поиск по названию, автору, runtime, entrypoint или модели"
              />
              <div className="flex flex-wrap gap-2">
                {GALLERY_KIND_FILTERS.map((filter) => (
                  <Button
                    key={filter.value}
                    type="button"
                    size="sm"
                    variant={kindFilter === filter.value ? 'primary' : 'outline'}
                    onClick={() => setKindFilter(filter.value)}
                  >
                    {filter.label}
                  </Button>
                ))}
              </div>
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
            Не удалось загрузить галерею.
          </div>
        )}

        {!isLoading && !error && items.length === 0 && (
          <div className="rounded-2xl border bg-muted/20 p-8 text-center text-muted-foreground">
            Пока нет публичных элементов для галереи.
          </div>
        )}

        {!isLoading && !error && items.length > 0 && filteredItems.length === 0 && (
          <div className="rounded-2xl border bg-muted/20 p-8 text-center text-muted-foreground">
            По текущему фильтру ничего не найдено. Попробуйте другой запрос или переключите тип карточек.
          </div>
        )}

        {!isLoading && !error && filteredItems.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2">
            {currentItems.map((item) => (
              <article key={item.message_id} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                <div className="aspect-[16/10] border-b bg-slate-50">
                  <GalleryArtifactFrame item={item} />
                </div>

                <div className="space-y-4 p-5">
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border bg-muted/20 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {formatKindLabel(item.kind)}
                      </span>
                      {item.project_runtime ? (
                        <span className="rounded-full border bg-muted/20 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {formatProjectRuntime(item.project_runtime)}
                        </span>
                      ) : null}
                    </div>
                    <p className="line-clamp-2 text-lg font-semibold">
                      {item.project_title || item.preview_title || item.chat_title}
                    </p>
                    {(item.preview_title && item.preview_title !== item.chat_title) || item.project_entrypoint ? (
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {[
                          item.preview_title && item.preview_title !== item.chat_title ? item.preview_title : null,
                          item.project_entrypoint ? `Entrypoint: ${item.project_entrypoint}` : null,
                        ]
                          .filter((value): value is string => Boolean(value))
                          .join(' • ')}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border bg-muted/20 px-2.5 py-1">
                      Автор:{' '}
                      <UserLink
                        username={item.author_username}
                        name={item.author_name}
                        fallback="Пользователь"
                        className="text-foreground hover:text-primary hover:underline"
                      />
                    </span>
                    <span className="rounded-full border bg-muted/20 px-2.5 py-1">
                      Всего: {formatViews(item.total_view_count)}
                    </span>
                    <span className="rounded-full border bg-muted/20 px-2.5 py-1">
                      Уникальных: {formatViews(item.unique_view_count ?? item.view_count)}
                    </span>
                    <span className="rounded-full border bg-muted/20 px-2.5 py-1">
                      {formatDate(item.created_at)}
                    </span>
                    <span className="rounded-full border bg-muted/20 px-2.5 py-1">
                      Стоимость: {formatUsdCost(item.total_usd_cost)} ({formatRubCost(item.total_rub_cost)})
                    </span>
                    {item.project_file_count > 0 ? (
                      <span className="rounded-full border bg-muted/20 px-2.5 py-1">
                        Файлов: {item.project_file_count}
                      </span>
                    ) : null}
                    {formatModelName(item.model) && (
                      <span className="rounded-full border bg-muted/20 px-2.5 py-1">
                        Модель: {formatModelName(item.model)}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {REACTION_OPTIONS.map((reaction) => {
                      const count = item.reaction_counts?.[reaction.type] ?? 0;
                      const isActive = item.my_reaction === reaction.type;
                      const isBusy = setReactionMutation.isPending || deleteReactionMutation.isPending;

                      return (
                        <button
                          key={reaction.type}
                          type="button"
                          title={currentUser ? reaction.label : 'Нужна авторизация'}
                          disabled={!currentUser || isBusy}
                          onClick={() => {
                            if (!currentUser || isBusy) return;
                            if (isActive) {
                              deleteReactionMutation.mutate(item.chat_id);
                              return;
                            }
                            setReactionMutation.mutate({ chatId: item.chat_id, reactionType: reaction.type });
                          }}
                          className={[
                            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                            isActive
                              ? 'border-primary/40 bg-primary/10 text-primary'
                              : 'border-border bg-muted/20 text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                            !currentUser ? 'cursor-default opacity-70' : '',
                          ].join(' ')}
                        >
                          <span aria-hidden="true">{reaction.emoji}</span>
                          <span>{count}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2">
                    <Link to={item.chat_url}>
                      <Button size="sm">Перейти в чат</Button>
                    </Link>
                    {(item.kind === 'project' || item.kind === 'hybrid') && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!currentUser || runningMessageId === item.message_id}
                        onClick={() => { void runGalleryProject(item); }}
                        title={currentUser ? 'Запустить проект' : 'Нужна авторизация для запуска'}
                      >
                        {runningMessageId === item.message_id ? 'Запускаю...' : 'Запустить'}
                      </Button>
                    )}
                    {item.preview_url ? (
                      <a href={item.preview_url} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm">Открыть preview</Button>
                      </a>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {!isLoading && !error && filteredItems.length > 0 && totalPages > 1 && (
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
                ))}
            </div>
          </div>
        )}

        {runError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {runError}
          </div>
        )}
      </div>

      {runResult && (
        <div
          className="fixed inset-0 z-[132] flex items-center justify-center bg-black/85 p-3"
          onClick={() => setRunResult(null)}
        >
          <div
            className="flex h-[94vh] w-[96vw] max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  Результат запуска: {runResult.status}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {runResult.title} • {runResult.command.join(' ')} • {runResult.duration_ms} ms
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const item = items.find((candidate) => candidate.message_id === runResult.message_id);
                    if (!item) return;
                    void runGalleryProject(item);
                  }}
                  disabled={runningMessageId === runResult.message_id}
                >
                  {runningMessageId === runResult.message_id ? 'Запускаю...' : 'Запустить'}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setRunResult(null)}>
                  Закрыть
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
              <div className="flex min-h-full flex-col gap-4">
                <div className="rounded-lg border border-border/70 bg-background/70 p-3 text-sm">
                  <p className="font-medium text-slate-900">Проверка</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {runResult.verification.message}
                    {runResult.verification.url ? ` (${runResult.verification.url})` : ''}
                  </p>
                  {runResult.entrypoint && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Entrypoint: {runResult.entrypoint}
                    </p>
                  )}
                </div>

                <div className={[
                  'grid min-h-0 flex-1 gap-4',
                  runResult.stdout && runResult.stderr ? 'lg:grid-cols-2' : 'grid-cols-1',
                ].join(' ')}>
                  {runResult.stdout && (
                    <div className="flex min-h-0 flex-col space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">stdout</p>
                      <pre className="min-h-0 flex-1 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
                        {runResult.stdout}
                      </pre>
                    </div>
                  )}

                  {runResult.stderr && (
                    <div className="flex min-h-0 flex-col space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">stderr</p>
                      <pre className="min-h-0 flex-1 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-rose-200">
                        {runResult.stderr}
                      </pre>
                    </div>
                  )}
                </div>

                {!runResult.stdout && !runResult.stderr && (
                  <div className="rounded-lg border border-border/70 bg-background/70 p-3 text-sm text-muted-foreground">
                    Процесс не вернул stdout или stderr.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
