import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { commentsApi } from '../lib/api/comments';

export function useNewsComments(slug: string) {
  return useQuery({
    queryKey: ['comments', 'news', slug],
    queryFn: () => commentsApi.listNewsComments(slug),
    enabled: !!slug,
  });
}

export function useCreateNewsComment(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => commentsApi.createNewsComment(slug, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', 'news', slug] });
      queryClient.invalidateQueries({ queryKey: ['news'] });
    },
  });
}

export function useDeleteNewsComment(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => commentsApi.deleteNewsComment(slug, commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', 'news', slug] });
      queryClient.invalidateQueries({ queryKey: ['news'] });
    },
  });
}

export function useArticleComments(slug: string) {
  return useQuery({
    queryKey: ['comments', 'article', slug],
    queryFn: () => commentsApi.listArticleComments(slug),
    enabled: !!slug,
  });
}

export function useCreateArticleComment(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => commentsApi.createArticleComment(slug, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', 'article', slug] });
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
    },
  });
}

export function useDeleteArticleComment(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => commentsApi.deleteArticleComment(slug, commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', 'article', slug] });
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
    },
  });
}
