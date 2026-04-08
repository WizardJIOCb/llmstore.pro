import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { articlesApi, type ArticleReportPayload, type ArticlesListParams, type UpsertArticlePayload } from '../lib/api/articles';

export function useArticlesList(params: ArticlesListParams) {
  return useQuery({
    queryKey: ['articles', 'list', params],
    queryFn: () => articlesApi.list(params),
  });
}

export function useArticleBySlug(slug: string) {
  return useQuery({
    queryKey: ['articles', 'detail', slug],
    queryFn: () => articlesApi.getBySlug(slug),
    enabled: Boolean(slug),
  });
}

export function useArticleReaction(slug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (liked: boolean) => {
      if (liked) {
        return articlesApi.unlike(slug);
      }
      return articlesApi.like(slug);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles'] });
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
    },
  });
}

export function useArticleBookmark(slug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bookmarked: boolean) => {
      if (bookmarked) {
        return articlesApi.unbookmark(slug);
      }
      return articlesApi.bookmark(slug);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles'] });
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
    },
  });
}

export function useArticleReport(slug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ArticleReportPayload) => articlesApi.report(slug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles'] });
    },
  });
}

export function useMyArticles(enabled = true) {
  return useQuery({
    queryKey: ['articles', 'mine'],
    queryFn: () => articlesApi.listMine(),
    enabled,
  });
}

export function useMyBookmarkedArticles(enabled = true) {
  return useQuery({
    queryKey: ['articles', 'mine', 'bookmarks'],
    queryFn: () => articlesApi.listBookmarked(),
    enabled,
  });
}

export function useMyArticleAnalytics(enabled = true) {
  return useQuery({
    queryKey: ['articles', 'mine', 'analytics'],
    queryFn: () => articlesApi.getAnalytics(),
    enabled,
  });
}

export function useMyArticle(id: string, enabled = true) {
  return useQuery({
    queryKey: ['articles', 'mine', id],
    queryFn: () => articlesApi.getMineById(id),
    enabled: enabled && Boolean(id),
  });
}

export function useCreateArticle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpsertArticlePayload) => articlesApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles'] });
      queryClient.invalidateQueries({ queryKey: ['articles', 'mine', 'analytics'] });
    },
  });
}

export function useUpdateArticle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpsertArticlePayload }) =>
      articlesApi.update(id, payload),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['articles'] });
      queryClient.invalidateQueries({ queryKey: ['articles', 'mine'] });
      queryClient.invalidateQueries({ queryKey: ['articles', 'mine', 'analytics'] });
      queryClient.invalidateQueries({ queryKey: ['articles', 'mine', variables.id] });
    },
  });
}
