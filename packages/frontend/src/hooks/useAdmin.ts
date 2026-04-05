import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  adminApi,
  type AdminListParams,
  type AdminUsersParams,
  type AdminAgentsParams,
  type AdminDashboardChartsParams,
  type AdminRuntimesParams,
} from '../lib/api/admin';

export function useAdminDashboardStats() {
  return useQuery({
    queryKey: ['admin', 'dashboard', 'stats'],
    queryFn: () => adminApi.getDashboardStats(),
    staleTime: 0,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: 'always',
  });
}

export function useAdminDashboardCharts(params: AdminDashboardChartsParams) {
  return useQuery({
    queryKey: ['admin', 'dashboard', 'charts', params],
    queryFn: () => adminApi.getDashboardCharts(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useAdminRuntimes(params: AdminRuntimesParams) {
  return useQuery({
    queryKey: ['admin', 'runtimes', params],
    queryFn: () => adminApi.listRuntimes(params),
    placeholderData: (previousData) => previousData,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });
}

export function useAdminSettings() {
  return useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => adminApi.getSettings(),
  });
}

export function useUpdateAdminSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
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
      openrouter_requests_enabled: boolean;
      openrouter_disabled_message: string;
    }) => adminApi.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['app', 'settings'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['chat'] });
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
  });
}

// ─── Catalog Items ──────────────────────────────────────────

export function useAdminItems(params: AdminListParams) {
  return useQuery({
    queryKey: ['admin', 'items', params],
    queryFn: () => adminApi.listItems(params),
  });
}

export function useAdminItem(id: string) {
  return useQuery({
    queryKey: ['admin', 'items', id],
    queryFn: () => adminApi.getItem(id),
    enabled: !!id,
  });
}

export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => adminApi.createItem(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'items'] });
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
    },
  });
}

export function useUpdateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      adminApi.updateItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'items'] });
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
    },
  });
}

export function useDeleteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.deleteItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'items'] });
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
    },
  });
}

// ─── Users ──────────────────────────────────────────────────

export function useAdminUsers(params: AdminUsersParams) {
  return useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: () => adminApi.listUsers(params),
  });
}

export function useAdminUser(id: string) {
  return useQuery({
    queryKey: ['admin', 'users', id],
    queryFn: () => adminApi.getUser(id),
    enabled: !!id,
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      adminApi.updateUserRole(id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useUpdateUserStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminApi.updateUserStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useAdjustUserBalance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount, description }: { id: string; amount: number; description: string }) =>
      adminApi.adjustUserBalance(id, amount, description),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

// ─── Agents ─────────────────────────────────────────────────

export function useResetUserPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      adminApi.resetUserPassword(id, { password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useAdminAgents(params: AdminAgentsParams) {
  return useQuery({
    queryKey: ['admin', 'agents', params],
    queryFn: () => adminApi.listAgents(params),
  });
}

export function useAdminTools() {
  return useQuery({
    queryKey: ['admin', 'tools'],
    queryFn: () => adminApi.listTools(),
  });
}

export function useCreateAdminTool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      slug: string;
      tool_type: string;
      description?: string | null;
      input_schema: Record<string, unknown>;
      output_schema?: Record<string, unknown> | null;
      config_json?: Record<string, unknown> | null;
      is_builtin?: boolean;
      is_active?: boolean;
    }) => adminApi.createTool(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tools'] });
      queryClient.invalidateQueries({ queryKey: ['builtin-tools'] });
    },
  });
}

export function useDeleteAdminTool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.deleteTool(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tools'] });
      queryClient.invalidateQueries({ queryKey: ['builtin-tools'] });
    },
  });
}

export function useStartAdminRuntime() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.startRuntime(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'runtimes'] });
    },
  });
}

export function useStopAdminRuntime() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.stopRuntime(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'runtimes'] });
    },
  });
}

export function useUpdateAdminTool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      adminApi.updateTool(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tools'] });
      queryClient.invalidateQueries({ queryKey: ['builtin-tools'] });
    },
  });
}
