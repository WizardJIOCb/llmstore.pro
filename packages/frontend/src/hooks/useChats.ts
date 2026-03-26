import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { chatsApi, type ChatMode } from '../lib/api/chats';

export function useChatsList(enabled = true) {
  return useQuery({
    queryKey: ['chats'],
    queryFn: chatsApi.list,
    enabled,
  });
}

export function useChatAgents() {
  return useQuery({
    queryKey: ['chat-agents'],
    queryFn: chatsApi.listAgents,
    staleTime: 30_000,
  });
}

export function useChat(chatId: string | undefined) {
  return useQuery({
    queryKey: ['chats', chatId],
    queryFn: () => chatsApi.get(chatId!),
    enabled: !!chatId,
  });
}

export function useCreateChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload?: {
      title?: string;
      mode?: ChatMode;
      agent_id?: string | null;
      model_external_id?: string | null;
      system_prompt?: string | null;
    }) => chatsApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chats'] });
    },
  });
}

export function useUpdateChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, ...payload }: {
      chatId: string;
      title?: string;
      mode?: ChatMode;
      agent_id?: string | null;
      model_external_id?: string | null;
      system_prompt?: string | null;
    }) => chatsApi.update(chatId, payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['chats'] });
      qc.invalidateQueries({ queryKey: ['chats', vars.chatId] });
    },
  });
}

export function useDeleteChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (chatId: string) => chatsApi.remove(chatId),
    onSuccess: (_data, chatId) => {
      qc.invalidateQueries({ queryKey: ['chats'] });
      qc.removeQueries({ queryKey: ['chats', chatId] });
    },
  });
}

export function useShareChatById() {
  return useMutation({
    mutationFn: (chatId: string) => chatsApi.share(chatId),
  });
}

export function useSendChatMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, content }: { chatId: string; content: string }) =>
      chatsApi.sendMessage(chatId, content),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['chats'] });
      qc.invalidateQueries({ queryKey: ['chats', vars.chatId] });
    },
  });
}

export function useChatStats(chatId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['chats', chatId, 'stats'],
    queryFn: () => chatsApi.stats(chatId!),
    enabled: !!chatId && enabled,
  });
}
