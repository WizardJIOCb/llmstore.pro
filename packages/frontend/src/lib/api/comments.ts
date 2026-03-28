import { apiClient } from '../api-client';

export interface PublicComment {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    name: string | null;
    username: string | null;
    avatar_url: string | null;
  };
}

export const commentsApi = {
  listNewsComments: (slug: string) =>
    apiClient.get<{ data: PublicComment[] }>(`/news/${slug}/comments`).then((r) => r.data.data),

  createNewsComment: (slug: string, content: string) =>
    apiClient.post<{ data: PublicComment }>(`/news/${slug}/comments`, { content }).then((r) => r.data.data),

  deleteNewsComment: (slug: string, commentId: string) =>
    apiClient.delete(`/news/${slug}/comments/${commentId}`).then((r) => r.data),

  listArticleComments: (slug: string) =>
    apiClient.get<{ data: PublicComment[] }>(`/catalog/article/${slug}/comments`).then((r) => r.data.data),

  createArticleComment: (slug: string, content: string) =>
    apiClient.post<{ data: PublicComment }>(`/catalog/article/${slug}/comments`, { content }).then((r) => r.data.data),

  deleteArticleComment: (slug: string, commentId: string) =>
    apiClient.delete(`/catalog/article/${slug}/comments/${commentId}`).then((r) => r.data),
};
