import { apiClient } from '../api-client';
import type { CatalogItemCard, CatalogItemFull, CategorySlim, TagSlim, UseCaseSlim } from '@llmstore/shared';

export interface CatalogListParams {
  type?: string;
  category?: string;
  tags?: string;
  use_case?: string;
  pricing?: string;
  deployment?: string;
  privacy?: string;
  language?: string;
  difficulty?: string;
  featured?: string;
  search?: string;
  sort?: string;
  cursor?: string;
  limit?: number;
}

export interface CatalogListResponse {
  data: CatalogItemCard[];
  meta: { cursor: string | null };
}

export const catalogApi = {
  list: (params: CatalogListParams) =>
    apiClient.get<CatalogListResponse>('/catalog', { params }).then((r) => r.data),

  getByTypeAndSlug: (type: string, slug: string) =>
    apiClient.get<{ data: CatalogItemFull }>(`/catalog/${type}/${slug}`).then((r) => r.data.data),

  getBySlug: (slug: string) =>
    apiClient.get<{ data: CatalogItemFull }>(`/catalog/article/${slug}`).then((r) => r.data.data),

  getCategories: () =>
    apiClient.get<{ data: CategorySlim[] }>('/catalog/categories').then((r) => r.data.data),

  getTags: () =>
    apiClient.get<{ data: TagSlim[] }>('/catalog/tags').then((r) => r.data.data),

  getUseCases: () =>
    apiClient.get<{ data: UseCaseSlim[] }>('/catalog/use-cases').then((r) => r.data.data),
};
