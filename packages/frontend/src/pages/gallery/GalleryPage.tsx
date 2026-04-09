import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDeleteGalleryReaction, useGalleryPreviews, useGalleryTextChats, useSetGalleryReaction } from '../../hooks/useChats';
import { chatsApi } from '../../lib/api/chats';
import type { ChatReactionType, GalleryPreviewItem, GalleryTextChatItem, GalleryTextChatSort, ProjectRunResult } from '../../lib/api/chats';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { UserLink } from '../../components/users/UserLink';
import { authApi } from '../../lib/api/auth';

const PAGE_SIZE_OPTIONS = [2, 4, 6, 8, 10];
const REACTION_OPTIONS: Array<{ type: ChatReactionType; emoji: string; label: string }> = [
  { type: 'heart', emoji: '❤️', label: 'Люблю' },
  { type: 'thumbs_up', emoji: '👍', label: 'Нравится' },
  { type: 'thumbs_down', emoji: '👎', label: 'Не нравится' },
  { type: 'laugh', emoji: '😂', label: 'Смешно' },
  { type: 'smile', emoji: '😊', label: 'Улыбнуло' },
  { type: 'meh', emoji: '😐', label: 'Нейтрально' },
];
const GALLERY_KIND_FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'project', label: 'Runnable Projects' },
  { value: 'preview', label: 'Лендинги и Preview' },
] as const;
const TEXT_CHAT_SORT_OPTIONS: Array<{ value: GalleryTextChatSort; label: string }> = [
  { value: 'newest', label: 'Сначала новые' },
  { value: 'oldest', label: 'Сначала старые' },
  { value: 'views_day', label: 'Макс. просмотры за день' },
  { value: 'views_week', label: 'Макс. просмотры за неделю' },
  { value: 'views_month', label: 'Макс. просмотры за месяц' },
  { value: 'views_all', label: 'Макс. просмотры за всё время' },
  { value: 'message_count', label: 'По количеству сообщений' },
  { value: 'total_cost', label: 'По цене чата' },
];

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

function getReactionAccentClasses(type: ChatReactionType, isActive: boolean): string {
  if (isActive) {
    switch (type) {
      case 'heart':
        return 'border-rose-300/70 bg-gradient-to-br from-rose-50 via-white to-pink-50 text-rose-700 shadow-sm';
      case 'thumbs_up':
        return 'border-emerald-300/70 bg-gradient-to-br from-emerald-50 via-white to-lime-50 text-emerald-700 shadow-sm';
      case 'thumbs_down':
        return 'border-amber-300/70 bg-gradient-to-br from-amber-50 via-white to-orange-50 text-amber-700 shadow-sm';
      case 'laugh':
        return 'border-sky-300/70 bg-gradient-to-br from-sky-50 via-white to-cyan-50 text-sky-700 shadow-sm';
      case 'smile':
        return 'border-fuchsia-300/70 bg-gradient-to-br from-fuchsia-50 via-white to-violet-50 text-fuchsia-700 shadow-sm';
      case 'meh':
        return 'border-slate-300/80 bg-gradient-to-br from-slate-50 via-white to-zinc-50 text-slate-700 shadow-sm';
      default:
        return 'border-primary/40 bg-primary/10 text-primary shadow-sm';
    }
  }

  return 'border-border bg-white/85 text-slate-600 hover:-translate-y-0.5 hover:bg-slate-50 hover:text-slate-900 hover:shadow-sm';
}

function getReactionEmojiBubbleClasses(type: ChatReactionType, isActive: boolean): string {
  const base = 'inline-flex h-6 w-6 items-center justify-center rounded-full text-[15px] shadow-sm transition-transform';
  if (isActive) {
    switch (type) {
      case 'heart':
        return `${base} bg-rose-100`;
      case 'thumbs_up':
        return `${base} bg-emerald-100`;
      case 'thumbs_down':
        return `${base} bg-amber-100`;
      case 'laugh':
        return `${base} bg-sky-100`;
      case 'smile':
        return `${base} bg-fuchsia-100`;
      case 'meh':
        return `${base} bg-slate-100`;
      default:
        return `${base} bg-slate-100`;
    }
  }

  return `${base} bg-slate-100/80`;
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

function buildGalleryChatTarget(item: GalleryPreviewItem): string {
  if (item.is_owner) {
    return `/chats?chat=${encodeURIComponent(item.chat_id)}`;
  }
  return item.chat_url || `/chats?chat=${encodeURIComponent(item.chat_id)}`;
}

function buildGalleryTextChatTarget(item: GalleryTextChatItem): string {
  if (item.is_owner) {
    return `/chats?chat=${encodeURIComponent(item.chat_id)}`;
  }
  return item.chat_url || `/chats?chat=${encodeURIComponent(item.chat_id)}`;
}

function GalleryArtifactFrame({
  item,
  projectRunCount,
}: {
  item: GalleryPreviewItem;
  projectRunCount: number;
}) {
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
    <div className="flex h-full min-h-0 flex-col justify-between overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_38%),linear-gradient(135deg,#0f172a,#111827_52%,#1e293b)] p-5 text-white">
      <div className="min-h-0 space-y-3 overflow-hidden">
        <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-sky-100">
          Runnable Project
        </span>
        <div className="space-y-2">
          <p className="line-clamp-4 text-lg font-semibold leading-8">
            {item.project_title || item.chat_title}
          </p>
          <p className="line-clamp-2 text-sm text-slate-300">
            Самодостаточный проект из чата, который можно скачать и запустить.
          </p>
        </div>
      </div>

      <div className="mt-4 grid shrink-0 gap-2 text-sm text-slate-200 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          Runtime: {formatProjectRuntime(item.project_runtime) || 'Не указан'}
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          Файлов: {item.project_file_count || 0}
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          Запусков: {formatViews(projectRunCount)}
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 sm:col-span-2">
          Entrypoint: {item.project_entrypoint || 'Не указан'}
        </div>
      </div>
    </div>
  );
}

export function GalleryPage() {
  type GalleryRunErrorState = {
    message: string;
    message_id?: string;
  };
  const TEXT_CHAT_PAGE_SIZE = 6;

  const textChatsTopRef = useRef<HTMLDivElement | null>(null);
  const resultsTopRef = useRef<HTMLDivElement | null>(null);
  const previousTextChatPageRef = useRef(1);
  const previousPageRef = useRef(1);
  const [pageSize, setPageSize] = useState(4);
  const [currentPage, setCurrentPage] = useState(1);
  const [textChatPage, setTextChatPage] = useState(1);
  const [search, setSearch] = useState('');
  const [gallerySort, setGallerySort] = useState<GalleryTextChatSort>('newest');
  const [textChatSort, setTextChatSort] = useState<GalleryTextChatSort>('newest');
  const [kindFilter, setKindFilter] = useState<GalleryKindFilter>('preview');
  const [runningMessageId, setRunningMessageId] = useState<string | null>(null);
  const [projectRunCounts, setProjectRunCounts] = useState<Record<string, number>>({});
  const [runResult, setRunResult] = useState<(ProjectRunResult & {
    title: string;
    message_id: string;
    chat_id: string;
  }) | null>(null);
  const [runError, setRunError] = useState<GalleryRunErrorState | null>(null);
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
  const { data: textChatsData, isLoading: textChatsLoading } = useGalleryTextChats(120, textChatSort);
  const setReactionMutation = useSetGalleryReaction();
  const deleteReactionMutation = useDeleteGalleryReaction();

  const items = data ?? [];
  const textChats = textChatsData ?? [];
  const filteredTextChats = useMemo(() => {
    const query = search.trim().toLowerCase();
    return textChats.filter((item) => {
      if (!query) {
        return true;
      }

      return [
        item.chat_title,
        item.text_preview,
        item.author_name,
        item.author_username,
        item.model,
      ]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [search, textChats]);
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
  const sortedFilteredItems = useMemo(() => {
    const nextItems = [...filteredItems];
    nextItems.sort((a, b) => {
      switch (gallerySort) {
        case 'oldest':
          return Date.parse(a.created_at) - Date.parse(b.created_at);
        case 'views_day':
          return b.recent_view_count_day - a.recent_view_count_day || Date.parse(b.created_at) - Date.parse(a.created_at);
        case 'views_week':
          return b.recent_view_count_week - a.recent_view_count_week || Date.parse(b.created_at) - Date.parse(a.created_at);
        case 'views_month':
          return b.recent_view_count_month - a.recent_view_count_month || Date.parse(b.created_at) - Date.parse(a.created_at);
        case 'views_all':
          return b.total_view_count - a.total_view_count || Date.parse(b.created_at) - Date.parse(a.created_at);
        case 'message_count':
          return b.message_count - a.message_count || Date.parse(b.created_at) - Date.parse(a.created_at);
        case 'total_cost':
          return b.total_usd_cost - a.total_usd_cost || Date.parse(b.created_at) - Date.parse(a.created_at);
        case 'newest':
        default:
          return Date.parse(b.created_at) - Date.parse(a.created_at);
      }
    });
    return nextItems;
  }, [filteredItems, gallerySort]);
  const textChatTotalPages = Math.max(1, Math.ceil(filteredTextChats.length / TEXT_CHAT_PAGE_SIZE));
  const textChatPageButtons = useMemo(
    () => buildPageButtons(textChatTotalPages, textChatPage),
    [textChatPage, textChatTotalPages],
  );
  const currentTextChats = useMemo(() => {
    const start = (textChatPage - 1) * TEXT_CHAT_PAGE_SIZE;
    return filteredTextChats.slice(start, start + TEXT_CHAT_PAGE_SIZE);
  }, [filteredTextChats, textChatPage]);
  const totalPages = Math.max(1, Math.ceil(sortedFilteredItems.length / pageSize));
  const pageButtons = useMemo(() => buildPageButtons(totalPages, currentPage), [currentPage, totalPages]);
  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedFilteredItems.slice(start, start + pageSize);
  }, [currentPage, sortedFilteredItems, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [gallerySort, kindFilter, pageSize, search]);

  useEffect(() => {
    setTextChatPage(1);
  }, [search, textChatSort]);

  useEffect(() => {
    if (textChatPage > textChatTotalPages) {
      setTextChatPage(textChatTotalPages);
    }
  }, [textChatPage, textChatTotalPages]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (previousPageRef.current !== currentPage) {
      resultsTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    previousPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    if (previousTextChatPageRef.current !== textChatPage) {
      textChatsTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    previousTextChatPageRef.current = textChatPage;
  }, [textChatPage]);

  const getDisplayedProjectRunCount = (item: GalleryPreviewItem): number =>
    projectRunCounts[item.message_id] ?? item.project_run_count ?? 0;

  const runGalleryProject = async (item: GalleryPreviewItem) => {
    if (!currentUser) return;

    setRunError(null);
    setRunningMessageId(item.message_id);
    try {
      const result = await chatsApi.runGalleryProject(item.chat_id, item.message_id);
      const nextProjectRunCount = result.project_run_count;
      if (typeof nextProjectRunCount === 'number') {
        setProjectRunCounts((current) => ({
          ...current,
          [item.message_id]: nextProjectRunCount,
        }));
      }
      setRunResult({
        ...result,
        title: item.project_title || item.preview_title || item.chat_title,
        message_id: item.message_id,
        chat_id: item.chat_id,
      });
    } catch (error) {
      const maybe = error as { response?: { data?: { error?: { message?: string } } } };
      setRunError({
        message: maybe?.response?.data?.error?.message ?? 'Не удалось запустить проект из галереи',
        message_id: item.message_id,
      });
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
            Здесь собраны публичные результаты из общих чатов: сначала runnable projects, лендинги и preview, ниже интересные текстовые диалоги.
            Можно быстро найти интересный сценарий, открыть исходный чат и продолжить уже у себя.
          </p>
        </div>

        {!isLoading && !error && items.length > 0 && (
          <div className="space-y-4 rounded-2xl border bg-white p-4 shadow-sm">
            <div className="space-y-1">
              <p className="text-lg font-semibold text-slate-950">Runnable Projects и лендинги</p>
              <p className="text-sm text-muted-foreground">
                Визуальные результаты, preview и runnable bundle, которые можно открыть, изучить и запустить.
              </p>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <p className="text-sm text-muted-foreground">
                Найдено {filteredItems.length} из {items.length} элементов, страница {currentPage} из {totalPages}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-muted-foreground">Показывать</span>
                <Select
                  value={String(pageSize)}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  options={PAGE_SIZE_OPTIONS.map((value) => ({ value: String(value), label: String(value) }))}
                  className="h-9 min-w-[88px]"
                />
                <span className="text-sm text-muted-foreground">Сортировка</span>
                <Select
                  value={gallerySort}
                  onChange={(event) => setGallerySort(event.target.value as GalleryTextChatSort)}
                  options={TEXT_CHAT_SORT_OPTIONS}
                  className="h-9 min-w-[240px]"
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
          <div ref={resultsTopRef} className="grid gap-6 md:grid-cols-2">
            {currentItems.map((item) => {
              const previewUrl = buildGalleryPreviewUrl(item);
              const displayTitle = item.project_title || item.preview_title || item.chat_title;

              return (
                <article key={item.message_id} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                  <div className="aspect-[16/10] border-b bg-slate-50">
                    <GalleryArtifactFrame item={item} projectRunCount={getDisplayedProjectRunCount(item)} />
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
                      {previewUrl ? (
                        <a
                          href={previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block line-clamp-2 text-lg font-semibold transition-colors hover:text-primary"
                        >
                          {displayTitle}
                        </a>
                      ) : (
                        <p className="line-clamp-2 text-lg font-semibold">
                          {displayTitle}
                        </p>
                      )}
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
                        Просмотры: {formatViews(item.total_view_count)}
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
                      {(item.kind === 'project' || item.kind === 'hybrid') && (
                        <span className="rounded-full border bg-muted/20 px-2.5 py-1">
                          Запусков: {formatViews(getDisplayedProjectRunCount(item))}
                        </span>
                      )}
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
                              'inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-all',
                              getReactionAccentClasses(reaction.type, isActive),
                              !currentUser ? 'cursor-default opacity-70' : '',
                            ].join(' ')}
                          >
                            <span aria-hidden="true" className={getReactionEmojiBubbleClasses(reaction.type, isActive)}>
                              {reaction.emoji}
                            </span>
                            <span>{count}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2">
                      <Link to={buildGalleryChatTarget(item)}>
                        <Button size="sm">Открыть чат</Button>
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
                      {previewUrl ? (
                        <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm">Открыть preview</Button>
                        </a>
                      ) : null}
                    </div>

                    {runError?.message_id === item.message_id ? (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        {runError.message}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
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

        {!textChatsLoading && filteredTextChats.length > 0 && (
          <section ref={textChatsTopRef} className="space-y-3 rounded-2xl border bg-[linear-gradient(180deg,#ffffff,#f8fafc)] p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-1">
                <p className="text-lg font-semibold text-slate-950">Интересные текстовые чаты</p>
                <p className="text-sm text-muted-foreground">
                  Небольшая подборка удачных публичных диалогов, которые можно сразу открыть и продолжить.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  {filteredTextChats.length} {filteredTextChats.length === 1 ? 'чат' : filteredTextChats.length < 5 ? 'чата' : 'чатов'} Страница {textChatPage} из {textChatTotalPages}
                </p>
                <Select
                  value={textChatSort}
                  onChange={(event) => setTextChatSort(event.target.value as GalleryTextChatSort)}
                  options={TEXT_CHAT_SORT_OPTIONS}
                  className="h-9 min-w-[240px]"
                />
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              {currentTextChats.map((item) => (
                <article key={item.chat_id} className="flex min-h-[188px] flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      <span className="rounded-full border bg-slate-50 px-2.5 py-1">Текстовый чат</span>
                      {formatModelName(item.model) && (
                        <span className="rounded-full border bg-slate-50 px-2.5 py-1">
                          {formatModelName(item.model)}
                        </span>
                      )}
                    </div>
                    <Link to={buildGalleryTextChatTarget(item)} className="line-clamp-2 text-base font-semibold text-slate-950 transition-colors hover:text-primary">
                      {item.chat_title}
                    </Link>
                    <p className="line-clamp-4 text-sm leading-6 text-slate-600">
                      {item.text_preview}
                    </p>
                  </div>

                  <div className="mt-auto space-y-3 pt-4">
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
                        Просмотры: {formatViews(item.total_view_count)}
                      </span>
                      <span className="rounded-full border bg-muted/20 px-2.5 py-1">
                        Сообщений: {formatViews(item.message_count)}
                      </span>
                      <span className="rounded-full border bg-muted/20 px-2.5 py-1">
                        Стоимость: {formatUsdCost(item.total_usd_cost)}
                      </span>
                      {formatModelName(item.model) && (
                        <span className="rounded-full border bg-muted/20 px-2.5 py-1">
                          Модель: {formatModelName(item.model)}
                        </span>
                      )}
                      <span className="rounded-full border bg-muted/20 px-2.5 py-1">
                        {formatDate(item.created_at)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link to={buildGalleryTextChatTarget(item)}>
                        <Button size="sm">Открыть чат</Button>
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {textChatTotalPages > 1 && (
              <div className="flex flex-col gap-4 rounded-2xl border bg-white/80 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTextChatPage((value) => Math.max(1, value - 1))}
                    disabled={textChatPage === 1}
                  >
                    Предыдущая
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTextChatPage((value) => Math.min(textChatTotalPages, value + 1))}
                    disabled={textChatPage === textChatTotalPages}
                  >
                    Следующая
                  </Button>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {textChatPageButtons.map((value, index) =>
                    value === 'ellipsis' ? (
                      <span key={`text-ellipsis-${index}`} className="px-2 text-sm text-muted-foreground">
                        ...
                      </span>
                    ) : (
                      <Button
                        key={`text-page-${value}`}
                        variant={value === textChatPage ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => setTextChatPage(value)}
                      >
                        {value}
                      </Button>
                    ))}
                </div>
              </div>
            )}
          </section>
        )}

        {runError && !runError.message_id && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {runError.message}
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
                <p className="truncate text-xs text-slate-500">
                  Запусков: {formatViews(runResult.project_run_count ?? projectRunCounts[runResult.message_id] ?? 0)}
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

            {runError?.message_id === runResult.message_id ? (
              <div className="border-b border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {runError.message}
              </div>
            ) : null}

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
                  <p className="mt-2 text-xs text-muted-foreground">
                    Запусков: {formatViews(runResult.project_run_count ?? projectRunCounts[runResult.message_id] ?? 0)}
                  </p>
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
