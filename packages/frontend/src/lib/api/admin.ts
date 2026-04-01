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

export interface AdminDashboardChartsParams {
  date_from?: string;
  date_to?: string;
}

export interface AdminSettings {
  usd_to_rub_rate: number;
  topup_message: string;
  topup_telegram: string;
  topup_email: string;
  topup_phone: string;
  starter_prompts_openrouter_coding_agent: string[];
  starter_prompts_openrouter_coding_agent_fast: string[];
  starter_prompts_openrouter_coding_agent_heavy_planning: string[];
  starter_prompts_openrouter_coding_agent_coding_alternative: string[];
  starter_prompts_dtf_news_agent: string[];
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
  openrouter: {
    fetched_at: string;
    available: boolean;
    error: string | null;
    key: {
      label: string;
      limit: number | null;
      limit_remaining: number | null;
      limit_reset: string | null;
      usage: number;
      usage_daily: number;
      usage_weekly: number;
      usage_monthly: number;
      byok_usage: number;
      byok_usage_daily: number;
      byok_usage_weekly: number;
      byok_usage_monthly: number;
      include_byok_in_limit: boolean;
      is_free_tier: boolean;
      is_management_key: boolean;
      is_provisioning_key: boolean;
      expires_at: string | null;
    } | null;
    credits: {
      is_available: boolean;
      error: string | null;
      total_credits: number | null;
      total_usage: number | null;
      remaining_credits: number | null;
    };
  };
}

export interface AdminDashboardCharts {
  range: {
    date_from: string;
    date_to: string;
    days: number;
  };
  totals: {
    registrations: number;
    total_users_end: number;
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    topups_usd: number;
    paid_topups_usd: number;
    bonus_credits_usd: number;
    balance_spend_usd: number;
    manual_debits_usd: number;
    usage_cost_usd: number;
    margin_usd: number;
    cashflow_usd: number;
    roi_percent: number | null;
    chats_created: number;
    chat_messages: number;
    assistant_messages: number;
    user_messages: number;
    agent_runs: number;
    successful_runs: number;
    success_rate_percent: number | null;
    payers_count: number;
    avg_dau: number;
    avg_wau: number;
    avg_mau: number;
    peak_dau: number;
    peak_wau: number;
    peak_mau: number;
    arpu_usd: number;
    range_days_with_activity: number;
    active_days_share_percent: number;
  };
  daily: Array<{
    date: string;
    registrations: number;
    cumulative_users: number;
    active_users: number;
    dau: number;
    wau: number;
    mau: number;
    payers_count: number;
    chats_created: number;
    chat_messages: number;
    assistant_messages: number;
    user_messages: number;
    agent_runs: number;
    successful_runs: number;
    success_rate_percent: number | null;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    usage_cost_usd: number;
    topups_usd: number;
    paid_topups_usd: number;
    bonus_credits_usd: number;
    balance_spend_usd: number;
    manual_debits_usd: number;
    margin_usd: number;
    cashflow_usd: number;
    roi_percent: number | null;
    arpu_usd: number;
    arppu_usd: number;
    payer_share_percent: number;
  }>;
  model_series: Array<{
    model: string;
    rank: number;
    total_usage_cost_usd: number;
    total_tokens: number;
    daily: Array<{
      date: string;
      usage_cost_usd: number;
      total_tokens: number;
    }>;
  }>;
}

export const adminApi = {
  // Dashboard
  getDashboardStats: () =>
    apiClient.get<{ data: AdminDashboardStats }>('/admin/dashboard/stats').then((r) => r.data.data),

  getDashboardCharts: (params: AdminDashboardChartsParams) =>
    apiClient.get<{ data: AdminDashboardCharts }>('/admin/dashboard/charts', { params }).then((r) => r.data.data),

  // Settings
  getSettings: () =>
    apiClient.get<{ data: AdminSettings }>('/admin/settings').then((r) => r.data.data),

  updateSettings: (data: AdminSettings) =>
    apiClient.put<{ data: AdminSettings }>('/admin/settings', data).then((r) => r.data.data),

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
