import { apiClient } from '../api-client';

export interface AdminListParams {
  page?: number;
  per_page?: number;
  type?: string;
  status?: string;
  search?: string;
}

export interface AdminUsersParams {
  page?: number;
  per_page?: number;
  search?: string;
  role?: string;
  status?: string;
}

export interface AdminAgentsParams {
  page?: number;
  per_page?: number;
  search?: string;
  status?: string;
  owner_id?: string;
}

export interface AdminTool {
  id: string;
  name: string;
  slug: string;
  tool_type: string;
  description: string | null;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown> | null;
  config_json: Record<string, unknown> | null;
  is_builtin: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminDashboardStats {
  totals: {
    users: number;
    active_users: number;
    users_balance_usd: number;
    agents: number;
    runs: number;
    chats: number;
    chats_general: number;
    chats_agent: number;
    chat_messages: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    chat_cost_usd: number;
  };
  last_30_days: {
    total_tokens: number;
    chat_cost_usd: number;
  };
  derived: {
    avg_messages_per_chat: number;
    avg_cost_per_chat_usd: number;
    avg_tokens_per_message: number;
  };
  by_model: Array<{
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    usd_cost: number;
    messages: number;
  }>;
  top_expensive_chats: Array<{
    id: string;
    title: string;
    mode: string;
    message_count: number;
    usd_cost: number;
  }>;
}

export const adminApi = {
  // Dashboard
  getDashboardStats: () =>
    apiClient.get<{ data: AdminDashboardStats }>('/admin/dashboard/stats').then((r) => r.data.data),

  // Catalog items
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

  // Taxonomy
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

  // Users
  listUsers: (params: AdminUsersParams) =>
    apiClient.get('/admin/users', { params }).then((r) => r.data),

  getUser: (id: string) =>
    apiClient.get(`/admin/users/${id}`).then((r) => r.data.data),

  updateUserRole: (id: string, role: string) =>
    apiClient.put(`/admin/users/${id}/role`, { role }).then((r) => r.data.data),

  updateUserStatus: (id: string, status: string) =>
    apiClient.put(`/admin/users/${id}/status`, { status }).then((r) => r.data.data),

  adjustUserBalance: (id: string, amount: number, description: string) =>
    apiClient.post(`/admin/users/${id}/balance`, { amount, description }).then((r) => r.data.data),

  // Agents
  listAgents: (params: AdminAgentsParams) =>
    apiClient.get('/admin/agents', { params }).then((r) => r.data),

  // Tools
  listTools: () =>
    apiClient.get<{ data: AdminTool[] }>('/admin/tools').then((r) => r.data.data),

  createTool: (data: {
    name: string;
    slug: string;
    tool_type: string;
    description?: string | null;
    input_schema: Record<string, unknown>;
    output_schema?: Record<string, unknown> | null;
    config_json?: Record<string, unknown> | null;
    is_builtin?: boolean;
    is_active?: boolean;
  }) =>
    apiClient.post<{ data: AdminTool }>('/admin/tools', data).then((r) => r.data.data),

  updateTool: (id: string, data: Record<string, unknown>) =>
    apiClient.put<{ data: AdminTool }>(`/admin/tools/${id}`, data).then((r) => r.data.data),

  deleteTool: (id: string) =>
    apiClient.delete(`/admin/tools/${id}`).then((r) => r.data),
};
