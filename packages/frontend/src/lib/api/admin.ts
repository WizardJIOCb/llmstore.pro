import { apiClient } from '../api-client';

export interface AdminListParams {
  page?: number;
  per_page?: number;
  type?: string;
  status?: string;
  search?: string;
}

export const adminApi = {
  listItems: (params: AdminListParams) =>
    apiClient.get('/admin/items', { params }).then((r) => r.data),

  getItem: (id: string) =>
    apiClient.get(`/admin/items/${id}`).then((r) => r.data.data),

  createItem: (data: Record<string, unknown>) =>
    apiClient.post('/admin/items', data).then((r) => r.data.data),

  updateItem: (id: string, data: Record<string, unknown>) =>
    apiClient.put(`/admin/items/${id}`, data).then((r) => r.data.data),

  deleteItem: (id: string) =>
    apiClient.delete(`/admin/items/${id}`).then((r) => r.data),

  createCategory: (data: { name: string; slug: string; parent_id?: string | null }) =>
    apiClient.post('/admin/categories', data).then((r) => r.data.data),

  updateCategory: (id: string, data: Record<string, unknown>) =>
    apiClient.put(`/admin/categories/${id}`, data).then((r) => r.data.data),

  deleteCategory: (id: string) =>
    apiClient.delete(`/admin/categories/${id}`).then((r) => r.data),

  createTag: (data: { name: string; slug: string }) =>
    apiClient.post('/admin/tags', data).then((r) => r.data.data),

  updateTag: (id: string, data: Record<string, unknown>) =>
    apiClient.put(`/admin/tags/${id}`, data).then((r) => r.data.data),

  deleteTag: (id: string) =>
    apiClient.delete(`/admin/tags/${id}`).then((r) => r.data),

  createUseCase: (data: { name: string; slug: string }) =>
    apiClient.post('/admin/use-cases', data).then((r) => r.data.data),

  updateUseCase: (id: string, data: Record<string, unknown>) =>
    apiClient.put(`/admin/use-cases/${id}`, data).then((r) => r.data.data),

  deleteUseCase: (id: string) =>
    apiClient.delete(`/admin/use-cases/${id}`).then((r) => r.data),
};
