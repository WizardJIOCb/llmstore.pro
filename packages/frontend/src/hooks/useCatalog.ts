import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { catalogApi, type CatalogListParams } from '../lib/api/catalog';

export function useCatalogList(params: CatalogListParams) {
  return useInfiniteQuery({
    queryKey: ['catalog', params],
    queryFn: ({ pageParam }) =>
      catalogApi.list({ ...params, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta.cursor ?? undefined,
  });
}

export function useCatalogItem(type: string, slug: string) {
  return useQuery({
    queryKey: ['catalog', type, slug],
    queryFn: () => catalogApi.getByTypeAndSlug(type, slug),
    enabled: !!type && !!slug,
  });
}
