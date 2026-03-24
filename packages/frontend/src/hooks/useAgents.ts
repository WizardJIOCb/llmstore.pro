import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentApi } from '../lib/api/agents';

export function useAgentList() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: () => agentApi.list(),
  });
}

export function useAgent(id: string | undefined) {
  return useQuery({
    queryKey: ['agents', id],
    queryFn: () => agentApi.get(id!),
    enabled: !!id,
  });
}

export function useBuiltinTools() {
  return useQuery({
    queryKey: ['builtin-tools'],
    queryFn: () => agentApi.listBuiltinTools(),
    staleTime: 5 * 60 * 1000, // 5 min
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: agentApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; description?: string; status?: string }) =>
      agentApi.update(id, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['agents', vars.id] });
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agentApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}

export function useCreateVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, ...data }: {
      agentId: string;
      system_prompt?: string;
      tool_ids?: string[];
      runtime_config?: Record<string, unknown>;
    }) => agentApi.createVersion(agentId, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['agents', vars.agentId] });
    },
  });
}

export function useStartRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, messages }: {
      agentId: string;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    }) => agentApi.startRun(agentId, { messages }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['runs'] });
    },
  });
}

export function useRun(runId: string | undefined) {
  return useQuery({
    queryKey: ['runs', runId],
    queryFn: () => agentApi.getRun(runId!),
    enabled: !!runId,
  });
}

export function useAgentStats() {
  return useQuery({
    queryKey: ['agent-stats'],
    queryFn: () => agentApi.getStats(),
    staleTime: 30_000,
  });
}

export function useRunList(agentId?: string) {
  return useQuery({
    queryKey: ['runs', { agentId }],
    queryFn: () => agentApi.listRuns(agentId),
  });
}

export function useChatHistory(agentId: string | undefined) {
  return useQuery({
    queryKey: ['chat-history', agentId],
    queryFn: () => agentApi.getChatHistory(agentId!),
    enabled: !!agentId,
    staleTime: 10_000,
  });
}

export function useShareChat() {
  return useMutation({
    mutationFn: (agentId: string) => agentApi.shareChat(agentId),
  });
}

export function useClearChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => agentApi.clearChat(agentId),
    onSuccess: (_data, agentId) => {
      qc.invalidateQueries({ queryKey: ['chat-history', agentId] });
    },
  });
}

export function useSharedChat(token: string | undefined) {
  return useQuery({
    queryKey: ['shared-chat', token],
    queryFn: () => agentApi.getSharedChat(token!),
    enabled: !!token,
  });
}
