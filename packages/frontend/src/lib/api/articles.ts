import { apiClient } from '../api-client';
import type { CatalogItemCard, CatalogItemFull } from '@llmstore/shared';

export interface ArticlesListParams {
  page?: number;
  per_page?: number;
  search?: string;
  sort?: 'top_day' | 'top_week' | 'top_month' | 'top_all' | 'newest';
  featured?: boolean;
  recommended?: boolean;
}

export interface ArticlesListResponse {
  data: CatalogItemCard[];
  meta: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
  };
}

export interface ArticleReactionState {
  likes_count: number;
  liked_by_me: boolean;
}

export interface ArticleBookmarkState {
  bookmarks_count: number;
  bookmarked_by_me: boolean;
}

export interface ArticleReportPayload {
  reason: 'spam' | 'abuse' | 'broken' | 'copyright' | 'other';
  details?: string;
}

export interface MyArticleListItem extends CatalogItemCard {
  status: string;
  visibility: string;
  updated_at: string;
}

export interface MyBookmarkedArticleItem extends CatalogItemCard {
  bookmarked_at: string;
}

export interface MyArticleAnalyticsItem {
  id: string;
  title: string;
  slug: string;
  status: string;
  published_at: string | null;
  updated_at: string;
  views_count: number;
  views_last_7_days: number;
  likes_count: number;
  comments_count: number;
  bookmarks_count: number;
  open_reports_count: number;
  ranking_score: number;
}

export interface MyArticleAnalyticsResponse {
  totals: {
    articles: number;
    published: number;
    drafts: number;
    views: number;
    views_last_7_days: number;
    likes: number;
    comments: number;
    bookmarks: number;
    open_reports: number;
  };
  items: MyArticleAnalyticsItem[];
}

export interface ArticleEditorRecord {
  id: string;
  title: string;
  slug: string;
  short_description: string | null;
  full_description: string | null;
  status: string;
  visibility: string;
  hero_image_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  meta: {
    primary_cta_label: string | null;
    primary_cta_url: string | null;
    secondary_cta_label: string | null;
    secondary_cta_url: string | null;
    reading_time_minutes: number | null;
  } | null;
  category_ids: string[];
  tag_ids: string[];
  use_case_ids: string[];
}

export interface UploadedArticleImage {
  filename: string;
  original_name: string;
  url: string;
}

export interface UpsertArticlePayload {
  title: string;
  slug: string;
  short_description: string;
  full_description: string;
  status: 'draft' | 'published';
  hero_image_url?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  meta?: {
    primary_cta_label?: string | null;
    primary_cta_url?: string | null;
    secondary_cta_label?: string | null;
    secondary_cta_url?: string | null;
    reading_time_minutes?: number | null;
  };
  category_ids?: string[];
  tag_ids?: string[];
  use_case_ids?: string[];
}

export const articlesApi = {
  list: (params: ArticlesListParams) =>
    apiClient.get<ArticlesListResponse>('/articles', { params }).then((response) => response.data),

  getBySlug: (slug: string) =>
    apiClient.get<{ data: CatalogItemFull }>(`/articles/${slug}`).then((response) => response.data.data),

  like: (slug: string) =>
    apiClient.post<{ data: ArticleReactionState }>(`/articles/${slug}/reaction`).then((response) => response.data.data),

  unlike: (slug: string) =>
    apiClient.delete<{ data: ArticleReactionState }>(`/articles/${slug}/reaction`).then((response) => response.data.data),

  bookmark: (slug: string) =>
    apiClient.post<{ data: ArticleBookmarkState }>(`/articles/${slug}/bookmark`).then((response) => response.data.data),

  unbookmark: (slug: string) =>
    apiClient.delete<{ data: ArticleBookmarkState }>(`/articles/${slug}/bookmark`).then((response) => response.data.data),

  report: (slug: string, payload: ArticleReportPayload) =>
    apiClient.post<{ data: { submitted: boolean } }>(`/articles/${slug}/report`, payload).then((response) => response.data.data),

  listMine: () =>
    apiClient.get<{ data: MyArticleListItem[] }>('/articles/mine').then((response) => response.data.data),

  listBookmarked: () =>
    apiClient.get<{ data: MyBookmarkedArticleItem[] }>('/articles/mine/bookmarks').then((response) => response.data.data),

  getAnalytics: () =>
    apiClient.get<{ data: MyArticleAnalyticsResponse }>('/articles/mine/analytics').then((response) => response.data.data),

  getMineById: (id: string) =>
    apiClient.get<{ data: ArticleEditorRecord }>(`/articles/mine/${id}`).then((response) => response.data.data),

  create: (payload: UpsertArticlePayload) =>
    apiClient.post<{ data: ArticleEditorRecord }>('/articles', payload).then((response) => response.data.data),

  update: (id: string, payload: UpsertArticlePayload) =>
    apiClient.put<{ data: ArticleEditorRecord }>(`/articles/${id}`, payload).then((response) => response.data.data),

  uploadHeroImage: (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return apiClient
      .post<{ data: UploadedArticleImage }>('/articles/upload/hero', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((response) => response.data.data);
  },
};
