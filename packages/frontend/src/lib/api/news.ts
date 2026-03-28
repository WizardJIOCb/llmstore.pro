import { apiClient } from '../api-client';

export interface NewsListParams {
  page?: number;
  per_page?: number;
}

export interface AdminNewsListParams {
  page?: number;
  per_page?: number;
  status?: string;
  search?: string;
}

export interface NewsImage {
  id?: string;
  filename: string;
  original_name?: string;
  url: string;
  sort_order: number;
}

export interface NewsArticle {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  status: string;
  views_count: number;
  comments_count: number;
  author_user_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  images: NewsImage[];
}

export interface CreateNewsData {
  title: string;
  content: string;
  excerpt?: string | null;
  status?: string;
  images?: { filename: string; original_name?: string; sort_order: number }[];
}

export const newsApi = {
  // Public
  list: (params: NewsListParams) =>
    apiClient.get('/news', { params }).then((r) => r.data),

  getBySlug: (slug: string) =>
    apiClient.get(`/news/${slug}`).then((r) => r.data.data as NewsArticle),

  // Admin
  adminList: (params: AdminNewsListParams) =>
    apiClient.get('/admin/news', { params }).then((r) => r.data),

  adminGet: (id: string) =>
    apiClient.get(`/admin/news/${id}`).then((r) => r.data.data as NewsArticle),

  create: (data: CreateNewsData) =>
    apiClient.post('/admin/news', data).then((r) => r.data.data as NewsArticle),

  update: (id: string, data: Partial<CreateNewsData>) =>
    apiClient.put(`/admin/news/${id}`, data).then((r) => r.data.data as NewsArticle),

  delete: (id: string) =>
    apiClient.delete(`/admin/news/${id}`).then((r) => r.data),

  uploadImages: (files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('images', f));
    return apiClient
      .post('/admin/upload/news', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data.data as { filename: string; original_name: string; url: string }[]);
  },

  deleteImage: (filename: string) =>
    apiClient.delete(`/admin/upload/news/${filename}`).then((r) => r.data),
};
