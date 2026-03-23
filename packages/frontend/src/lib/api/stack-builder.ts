import { apiClient } from '../api-client';
import type {
  StackBuilderInput,
  StackRecommendation,
  SavedStackResult,
} from '@llmstore/shared';

export const stackBuilderApi = {
  recommend: (input: StackBuilderInput) =>
    apiClient
      .post<{ data: StackRecommendation }>('/builder/stack/recommend', input)
      .then((r) => r.data.data),

  save: (body: {
    name?: string;
    builder_answers: StackBuilderInput;
    recommended_result: Record<string, unknown>;
  }) =>
    apiClient
      .post<{ data: { id: string } }>('/builder/stack/save', body)
      .then((r) => r.data.data),

  listSaved: () =>
    apiClient
      .get<{ data: SavedStackResult[] }>('/builder/stack/saved')
      .then((r) => r.data.data),

  getSaved: (id: string) =>
    apiClient
      .get<{ data: SavedStackResult }>(`/builder/stack/saved/${id}`)
      .then((r) => r.data.data),

  exportResult: (body: {
    format: 'json' | 'markdown';
    result?: Record<string, unknown>;
    saved_result_id?: string;
  }) =>
    apiClient
      .post<{ data: { format: string; data: unknown } }>('/builder/stack/export', body)
      .then((r) => r.data.data),

  createAgent: (body: {
    name?: string;
    result?: Record<string, unknown>;
    saved_result_id?: string;
  }) =>
    apiClient
      .post<{ data: { agent_id: string; redirect_url: string } }>(
        '/builder/stack/create-agent',
        body,
      )
      .then((r) => r.data.data),
};
