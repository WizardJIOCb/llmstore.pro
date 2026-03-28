import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, type AdminListParams, type AdminUsersParams, type AdminAgentsParams } from '../lib/api/admin';

export function useAdminDashboardStats() {
  return useQuery({
    queryKey: ['admin', 'dashboard', 'stats'],
    queryFn: () => adminApi.getDashboardStats(),
    refetchInterval: 30_000,
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
    },
  });
}

// ─── Agents ─────────────────────────────────────────────────

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
