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
  source?: 'regular' | 'alice' | 'all';
  sort_by?: 'spent_usd' | 'spent_tokens' | 'agents_count' | 'chats_count' | 'balance_usd' | 'last_activity_at' | 'last_login_at' | 'created_at' | 'role';
  sort_order?: 'asc' | 'desc';
}

export interface AdminUserListItem {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  role: string;
  status: string;
  balance_usd: number;
  created_at: string;
  last_activity_at: string | null;
  last_login_at: string | null;
  updated_at: string;
  chats_count: number;
  agents_count: number;
  spent_tokens: number;
  spent_usd: number;
}

export interface AdminUsersListResponse {
  data: AdminUserListItem[];
  meta: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
  };
}

export interface AdminUserDetails extends Omit<AdminUserListItem, 'chats_count' | 'spent_tokens' | 'spent_usd'> {
  runs_count: number;
  recent_transactions: Array<{
    id: string;
    amount: string | number;
    balance_after: string | number;
    type: string;
    description: string | null;
    created_at: string;
  }>;
}

export interface AdminAgentsParams {
  page?: number;
  per_page?: number;
  search?: string;
  status?: string;
  owner_id?: string;
}

export interface AdminRuntimesParams {
  search?: string;
  status?: 'all' | 'deploying' | 'running' | 'stopped' | 'failed';
}

export interface AdminDebugChatsParams {
  query: string;
  limit?: number;
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
  legal_business_name: string;
  legal_business_status: string;
  legal_inn: string;
  legal_ogrn: string;
  legal_address: string;
  legal_support_email: string;
  legal_support_phone: string;
  legal_support_telegram: string;
  starter_prompts_openrouter_coding_agent: string[];
  starter_prompts_openrouter_coding_agent_fast: string[];
  starter_prompts_openrouter_coding_agent_heavy_planning: string[];
  starter_prompts_openrouter_coding_agent_coding_alternative: string[];
  starter_prompts_dtf_news_agent: string[];
  signup_bonus_requires_email_verification: boolean;
  signup_bonus_amount_usd: number;
  openrouter_requests_enabled: boolean;
  openrouter_disabled_message: string;
}

export interface ProfitabilityModelRule {
  id: string;
  label: string;
  model_pattern: string;
  markup_multiplier: number;
  enabled: boolean;
}

export interface ProfitabilityUserOverride {
  id: string;
  label: string;
  user_id: string | null;
  email: string | null;
  mode: 'at_cost';
  enabled: boolean;
}

export interface ProfitabilitySettings {
  enabled: boolean;
  global_markup_multiplier: number;
  min_charge_usd: number;
  fixed_fee_usd: number;
  rounding_decimals: number;
  yookassa_fee_percent: number;
  yookassa_fee_fixed_rub: number;
  tax_reserve_percent: number;
  fx_buffer_percent: number;
  bonus_reserve_percent: number;
  user_role_multipliers: {
    user: number;
    power_user: number;
    curator: number;
    admin: number;
  };
  model_rules: ProfitabilityModelRule[];
  user_overrides: ProfitabilityUserOverride[];
}

export interface AdminProfitabilityParams {
  date_from?: string;
  date_to?: string;
}

export interface AdminProfitabilityResponse {
  range: {
    date_from: string;
    date_to: string;
    days: number;
  };
  settings: ProfitabilitySettings;
  current: {
    usage_events_count: number;
    total_tokens: number;
    provider_cost_usd: number;
    usage_charged_from_messages_usd: number;
    balance_spend_usd: number;
    topups_usd: number;
    paid_topups_usd: number;
    bonus_credits_usd: number;
    manual_debits_usd: number;
    payment_fee_usd: number;
    tax_reserve_usd: number;
    fx_buffer_usd: number;
    gross_margin_usd: number;
    gross_margin_percent: number | null;
    roi_percent: number | null;
    net_cashflow_usd: number;
    transaction_count: number;
    payers_count: number;
  };
  simulation: {
    usage_revenue_usd: number;
    provider_cost_usd: number;
    gross_margin_usd: number;
    gross_margin_percent: number | null;
    roi_percent: number | null;
    delta_revenue_usd: number;
    delta_margin_usd: number;
    payment_fee_usd: number;
    tax_reserve_usd: number;
    fx_buffer_usd: number;
    bonus_reserve_usd: number;
    net_after_reserves_usd: number;
  };
  waterfall: Array<{
    key: string;
    label: string;
    amount_usd: number;
    kind: 'income' | 'cost';
  }>;
  by_model: Array<{
    model: string;
    events_count: number;
    total_tokens: number;
    provider_cost_usd: number;
    current_charged_usd: number;
    simulated_charge_usd: number;
    margin_usd: number;
    margin_percent: number | null;
    effective_markup_percent: number | null;
  }>;
  usage_segments: Array<{
    user_id: string | null;
    user_email: string | null;
    user_role: string;
    model: string;
    events_count: number;
    total_tokens: number;
    provider_cost_usd: number;
    current_charged_usd: number;
    simulated_charge_usd: number;
  }>;
}

export interface ResetUserPasswordInput {
  password: string;
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

export interface AdminPaymentsParams {
  page?: number;
  per_page?: number;
  date_from?: string;
  date_to?: string;
  status?: 'all' | 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled' | 'creation_failed';
  provider?: string;
  search?: string;
}

export interface AdminPaymentDailyPoint {
  date: string;
  total_count: number;
  succeeded_count: number;
  pending_count: number;
  failed_count: number;
  total_amount_rub: number;
  total_amount_usd: number;
  succeeded_amount_rub: number;
  succeeded_amount_usd: number;
}

export interface AdminPaymentItem {
  id: string;
  user_id: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    username: string | null;
  } | null;
  provider: string;
  provider_payment_id: string | null;
  idempotence_key: string;
  status: string;
  amount_rub: number;
  amount_usd: number;
  usd_to_rub_rate: number;
  description: string | null;
  confirmation_url: string | null;
  balance_transaction_id: string | null;
  paid_at: string | null;
  credited_at: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminPaymentsResponse {
  filters: {
    date_from: string;
    date_to: string;
    status: string;
    provider: string;
    search: string;
    page: number;
    per_page: number;
  };
  summary: {
    total_count: number;
    succeeded_count: number;
    pending_count: number;
    failed_count: number;
    payers_count: number;
    total_amount_rub: number;
    total_amount_usd: number;
    succeeded_amount_rub: number;
    succeeded_amount_usd: number;
    avg_succeeded_payment_rub: number;
    avg_succeeded_payment_usd: number;
    success_rate_percent: number | null;
  };
  daily: AdminPaymentDailyPoint[];
  payments: AdminPaymentItem[];
  meta: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
  };
}

export interface AdminRuntimeRecentRun {
  id: string;
  status: string;
  input_summary: string | null;
  output_summary: string | null;
  error_message: string | null;
  latency_ms: number | null;
  started_at: string;
  completed_at: string | null;
  total_tokens: number;
  estimated_cost_usd: number;
}

export interface AdminRuntimeItem {
  id: string;
  conversation_id: string;
  message_id: string;
  owner_user_id: string;
  owner_name: string | null;
  owner_username: string | null;
  owner_email: string;
  chat_title: string;
  chat_share_token: string | null;
  status: 'deploying' | 'running' | 'stopped' | 'failed';
  title: string;
  runtime: 'node' | 'python';
  entrypoint: string | null;
  env: Record<string, string>;
  webhook_url: string;
  linked_agent_id: string | null;
  linked_agent_name: string | null;
  linked_agent_model_external_id: string | null;
  model_external_id: string | null;
  effective_model_external_id: string | null;
  effective_model_source: 'deployment' | 'agent' | 'recent_run' | 'default' | null;
  runtime_model_external_id: string | null;
  agent_run_url: string | null;
  last_error: string | null;
  last_exit_code: number | null;
  last_signal: string | null;
  live_stdout: string;
  live_stderr: string;
  run_stats: {
    total_runs: number;
    completed_runs: number;
    failed_runs: number;
    total_prompt_tokens: number;
    total_completion_tokens: number;
    total_tokens: number;
    total_cost_usd: number;
    total_cost_rub: number;
    last_run_at: string | null;
  };
  recent_runs: AdminRuntimeRecentRun[];
  created_at: string;
  updated_at: string;
  last_started_at: string | null;
  last_stopped_at: string | null;
}

export interface AdminDebugChatMatch {
  id: string;
  title: string;
  mode: string;
  access: string;
  share_token: string | null;
  model_external_id: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  total_view_count: number;
  unique_view_count: number;
  message_count: number;
  assistant_message_count: number;
  run_count: number;
  owner: {
    id: string;
    name: string | null;
    username: string | null;
    email: string;
  };
  agent: {
    id: string;
    name: string | null;
  } | null;
}

export interface AdminDebugToolCall {
  id: string;
  tool_definition_id: string | null;
  tool_call_id: string;
  tool_name: string;
  tool_input: Record<string, unknown> | null;
  tool_output: Record<string, unknown> | null;
  status: string;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
}

export interface AdminDebugRunMessage {
  id: string;
  role: string;
  content_text: string | null;
  content_json: Record<string, unknown> | null;
  token_estimate: number | null;
  created_at: string;
}

export interface AdminDebugRun {
  id: string;
  status: string;
  mode: string;
  model_id: string | null;
  model_external_id: string | null;
  provider_name: string | null;
  external_generation_id: string | null;
  external_response_id: string | null;
  session_key: string | null;
  trace_id: string;
  started_at: string;
  completed_at: string | null;
  latency_ms: number | null;
  error_message: string | null;
  input_summary: string | null;
  output_summary: string | null;
  final_output: string | null;
  final_output_json: Record<string, unknown> | null;
  run_messages: AdminDebugRunMessage[];
  tool_calls: AdminDebugToolCall[];
}

export interface AdminDebugChatMessage {
  id: string;
  role: string;
  content_text: string;
  run_id: string | null;
  usage_json: Record<string, unknown> | null;
  preview_view_count: number;
  project_run_count: number;
  latency_ms: number | null;
  created_at: string;
  run: AdminDebugRun | null;
}

export interface AdminDebugChatDetail {
  conversation: {
    id: string;
    title: string;
    mode: string;
    access: string;
    share_token: string | null;
    model_external_id: string | null;
    system_prompt: string | null;
    settings_json: Record<string, unknown> | null;
    total_view_count: number;
    unique_view_count: number;
    created_at: string;
    updated_at: string;
    last_message_at: string;
    message_count: number;
    user_message_count: number;
    assistant_message_count: number;
    owner: {
      id: string;
      name: string | null;
      username: string | null;
      email: string;
    };
    agent: {
      id: string;
      name: string | null;
      slug: string | null;
    } | null;
  };
  messages: AdminDebugChatMessage[];
}

export interface AdminAliceLogsParams {
  page?: number;
  per_page?: number;
  search?: string;
  status?: 'all' | 'success' | 'error' | 'ping_pong';
}

export interface AdminAliceLogItem {
  id: string;
  status: 'success' | 'error';
  response_status_code: number;
  yandex_skill_user_id: string | null;
  yandex_application_id: string | null;
  session_id: string | null;
  request_id: string | null;
  message_id: number | null;
  request_type: string | null;
  command: string | null;
  original_utterance: string | null;
  response_text: string | null;
  error_code: string | null;
  error_message: string | null;
  is_new_user: boolean | null;
  bonus_granted: boolean | null;
  ip_address: string | null;
  user_agent: string | null;
  duration_ms: number | null;
  response_size_bytes: number | null;
  request_json: Record<string, unknown> | null;
  response_json: Record<string, unknown> | null;
  created_at: string;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    username: string | null;
  } | null;
  chat: {
    id: string;
    title: string | null;
  } | null;
  alice_link: {
    skill_user_id: string;
  } | null;
}

export interface AdminAliceLogsResponse {
  data: AdminAliceLogItem[];
  meta: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
  };
}

export const adminApi = {
  // Dashboard
  getDashboardStats: () =>
    apiClient.get<{ data: AdminDashboardStats }>('/admin/dashboard/stats').then((r) => r.data.data),

  getDashboardCharts: (params: AdminDashboardChartsParams) =>
    apiClient.get<{ data: AdminDashboardCharts }>('/admin/dashboard/charts', { params }).then((r) => r.data.data),

  getPayments: (params: AdminPaymentsParams) =>
    apiClient.get<{ data: AdminPaymentsResponse }>('/admin/payments', { params }).then((r) => r.data.data),

  getProfitability: (params: AdminProfitabilityParams) =>
    apiClient.get<{ data: AdminProfitabilityResponse }>('/admin/profitability', { params }).then((r) => r.data.data),

  updateProfitabilitySettings: (data: ProfitabilitySettings) =>
    apiClient.put<{ data: ProfitabilitySettings }>('/admin/profitability/settings', data).then((r) => r.data.data),

  listAliceLogs: (params: AdminAliceLogsParams) =>
    apiClient.get<AdminAliceLogsResponse>('/admin/alice/logs', { params }).then((r) => r.data),

  listRuntimes: (params: AdminRuntimesParams) =>
    apiClient.get<{ data: AdminRuntimeItem[]; meta: { total: number } }>('/admin/runtimes', { params }).then((r) => r.data),

  searchDebugChats: (params: AdminDebugChatsParams) =>
    apiClient.get<{ data: AdminDebugChatMatch[] }>('/admin/debug/chats', { params }).then((r) => r.data.data),

  getDebugChat: (id: string) =>
    apiClient.get<{ data: AdminDebugChatDetail }>(`/admin/debug/chats/${id}`).then((r) => r.data.data),

  startRuntime: (id: string) =>
    apiClient.post<{ data: AdminRuntimeItem }>(`/admin/runtimes/${id}/start`).then((r) => r.data.data),

  stopRuntime: (id: string) =>
    apiClient.post<{ data: AdminRuntimeItem }>(`/admin/runtimes/${id}/stop`).then((r) => r.data.data),

  // Settings
  getSettings: () =>
    apiClient.get<{ data: AdminSettings }>('/admin/settings').then((r) => r.data.data),

  updateSettings: (data: AdminSettings) =>
    apiClient.put<{ data: AdminSettings }>('/admin/settings', data).then((r) => r.data.data),

  resetUserPassword: (id: string, data: ResetUserPasswordInput) =>
    apiClient.post(`/admin/users/${id}/password`, data).then((r) => r.data.data),

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
    apiClient.get<AdminUsersListResponse>('/admin/users', { params }).then((r) => r.data),

  getUser: (id: string) =>
    apiClient.get<{ data: AdminUserDetails }>(`/admin/users/${id}`).then((r) => r.data.data),

  updateUserRole: (id: string, role: string) =>
    apiClient.put(`/admin/users/${id}/role`, { role }).then((r) => r.data.data),

  updateUserStatus: (id: string, status: string) =>
    apiClient.put(`/admin/users/${id}/status`, { status }).then((r) => r.data.data),

  adjustUserBalance: (id: string, amount: number, description: string) =>
    apiClient.post(`/admin/users/${id}/balance`, { amount, description }).then((r) => r.data.data),

  impersonateUser: (id: string) =>
    apiClient.post(`/admin/users/${id}/impersonate`).then((r) => r.data.data),

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
