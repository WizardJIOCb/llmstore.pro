import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { newsApi, type NewsListParams, type AdminNewsListParams, type CreateNewsData } from '../lib/api/news';

// ─── Public ─────────────────────────────────────────────────

export function useLatestNews(limit: number = 3) {
  return useQuery({
    queryKey: ['news', 'latest', limit],
    queryFn: () => newsApi.list({ page: 1, per_page: limit }),
  });
}

export function useNewsList(params: NewsListParams) {
  return useQuery({
    queryKey: ['news', 'list', params],
    queryFn: () => newsApi.list(params),
  });
}

export function useNewsArticle(slug: string) {
  return useQuery({
    queryKey: ['news', slug],
    queryFn: () => newsApi.getBySlug(slug),
    enabled: !!slug,
  });
}

// ─── Admin ──────────────────────────────────────────────────

export function useAdminNewsList(params: AdminNewsListParams) {
  return useQuery({
    queryKey: ['admin', 'news', params],
    queryFn: () => newsApi.adminList(params),
  });
}

export function useAdminNews(id: string) {
  return useQuery({
    queryKey: ['admin', 'news', id],
    queryFn: () => newsApi.adminGet(id),
    enabled: !!id,
  });
}

export function useCreateNews() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateNewsData) => newsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'news'] });
      queryClient.invalidateQueries({ queryKey: ['news'] });
    },
  });
}

export function useUpdateNews() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateNewsData> }) =>
      newsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'news'] });
      queryClient.invalidateQueries({ queryKey: ['news'] });
    },
  });
}

export function useDeleteNews() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => newsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'news'] });
      queryClient.invalidateQueries({ queryKey: ['news'] });
    },
  });
}

export function useUploadNewsImages() {
  return useMutation({
    mutationFn: (files: File[]) => newsApi.uploadImages(files),
  });
}
