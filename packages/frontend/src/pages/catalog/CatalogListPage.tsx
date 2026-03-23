import { useState, useMemo } from 'react';
import { useCatalogList } from '../../hooks/useCatalog';
import { CatalogCard } from '../../components/catalog/CatalogCard';
import { CatalogFilters } from '../../components/catalog/CatalogFilters';
import { SearchBar } from '../../components/catalog/SearchBar';
import { SortSelect } from '../../components/catalog/SortSelect';
import { Button, Skeleton, Spinner } from '../../components/ui';
import { contentTypeLabels } from '../../lib/label-maps';
import type { ContentType } from '@llmstore/shared';

interface CatalogListPageProps {
  type: ContentType;
  filterLanguage?: string;
}

export function CatalogListPage({ type, filterLanguage }: CatalogListPageProps) {
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (filterLanguage) initial.language = filterLanguage;
    return initial;
  });
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('curated');

  const params = useMemo(() => ({
    type,
    ...filters,
    search: search || undefined,
    sort,
    limit: 20,
  }), [type, filters, search, sort]);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useCatalogList(params);

  const items = data?.pages.flatMap((p) => p.data) ?? [];

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (value) {
        next[key] = value;
      } else {
        delete next[key];
      }
      return next;
    });
  };

  const title = contentTypeLabels[type] ?? type;

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">{title}</h1>

      <div className="mb-6 space-y-3">
        {/* Row 1: Search + Sort */}
        <div className="flex items-center gap-3">
          <SearchBar onSearch={setSearch} placeholder={`Поиск в ${title.toLowerCase()}...`} />
          <SortSelect value={sort} onChange={setSort} />
        </div>
        {/* Row 2: Compact filter chips */}
        <CatalogFilters filters={filters} onChange={handleFilterChange} />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-lg text-muted-foreground">Ничего не найдено</p>
          <p className="mt-2 text-sm text-muted-foreground">Попробуйте изменить фильтры или поисковый запрос</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <CatalogCard key={item.id} item={item} />
            ))}
          </div>

          {hasNextPage && (
            <div className="mt-8 flex justify-center">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? <Spinner size="sm" /> : 'Загрузить ещё'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
