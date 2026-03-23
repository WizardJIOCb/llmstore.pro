import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, type AdminListParams } from '../lib/api/admin';

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
