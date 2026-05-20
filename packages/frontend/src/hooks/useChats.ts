import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  chatsApi,
  type ChatAccess,
  type ChatAttachment,
  type ChatContextBlocks,
  type ChatWorkspaceProject,
  type ChatReasoningEffort,
  type GalleryTextChatSort,
  type ChatListItem,
  type ChatMode,
} from '../lib/api/chats';

export function useChatsList(enabled = true) {
  return useQuery({
    queryKey: ['chats'],
    queryFn: chatsApi.list,
    enabled,
  });
}

export function useChatProjects(enabled = true) {
  return useQuery({
    queryKey: ['chat-projects'],
    queryFn: chatsApi.listProjects,
    enabled,
  });
}

export function useGalleryPreviews(limit = 24) {
  return useQuery({
    queryKey: ['gallery-previews', limit],
    queryFn: () => chatsApi.gallery(limit),
  });
}

export function useGalleryTextChats(limit = 8, sort: GalleryTextChatSort = 'newest') {
  return useQuery({
    queryKey: ['gallery-text-chats', limit, sort],
    queryFn: () => chatsApi.galleryTextChats(limit, sort),
  });
}

export function useSetGalleryReaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, reactionType }: { chatId: string; reactionType: 'heart' | 'thumbs_up' | 'thumbs_down' | 'laugh' | 'smile' | 'meh' }) =>
      chatsApi.setGalleryReaction(chatId, reactionType),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gallery-previews'] });
    },
  });
}

export function useDeleteGalleryReaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (chatId: string) => chatsApi.deleteGalleryReaction(chatId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gallery-previews'] });
    },
  });
}

export function useChatAgents(enabled = true) {
  return useQuery({
    queryKey: ['chat-agents'],
    queryFn: chatsApi.listAgents,
    enabled,
    staleTime: 30_000,
  });
}

export function usePublicAgentChats(agentId: string, enabled = true) {
  return useQuery({
    queryKey: ['public-agent-chats', agentId],
    queryFn: () => chatsApi.publicAgentChats(agentId),
    enabled: enabled && Boolean(agentId),
    staleTime: 30_000,
  });
}

export function usePublicModelChats(modelExternalId: string, enabled = true) {
  return useQuery({
    queryKey: ['public-model-chats', modelExternalId],
    queryFn: () => chatsApi.publicModelChats(modelExternalId),
    enabled: enabled && Boolean(modelExternalId),
    staleTime: 30_000,
  });
}

export function useChat(chatId: string | undefined, options?: { adminView?: boolean }) {
  return useQuery({
    queryKey: ['chats', chatId, options?.adminView ? 'admin-view' : 'default-view'],
    queryFn: () => chatsApi.get(chatId!),
    enabled: !!chatId,
    placeholderData: (previousData) => previousData,
  });
}

export function useCreateChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload?: {
      title?: string;
      note?: string | null;
      mode?: ChatMode;
      agent_id?: string | null;
      model_external_id?: string | null;
      reasoning_effort?: ChatReasoningEffort | null;
      system_prompt?: string | null;
      tool_ids?: string[];
      project_id?: string | null;
      project_folder_id?: string | null;
      access?: ChatAccess;
      access_identifiers?: string[];
    }) => chatsApi.create(payload),
    onSuccess: (chat) => {
      qc.setQueryData<ChatListItem[] | undefined>(['chats'], (prev) => {
        const existing = prev ?? [];
        const withoutCreated = existing.filter((item) => item.id !== chat.id);
        return [chat, ...withoutCreated];
      });
      qc.invalidateQueries({ queryKey: ['chats'] });
      qc.invalidateQueries({ queryKey: ['chat-projects'] });
    },
  });
}

export function useCreateChatProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload?: { title?: string; description?: string | null; git_remote_url?: string | null }) =>
      chatsApi.createProject(payload),
    onSuccess: (project) => {
      qc.setQueryData<ChatWorkspaceProject[] | undefined>(['chat-projects'], (prev) => [project, ...(prev ?? [])]);
      qc.invalidateQueries({ queryKey: ['chat-projects'] });
    },
  });
}

export function useUpdateChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, ...payload }: {
      chatId: string;
      title?: string;
      note?: string | null;
      mode?: ChatMode;
      agent_id?: string | null;
      model_external_id?: string | null;
      reasoning_effort?: ChatReasoningEffort | null;
      system_prompt?: string | null;
      context_window_tokens?: number | null;
      context_blocks?: ChatContextBlocks | null;
      tool_ids?: string[];
      project_id?: string | null;
      project_folder_id?: string | null;
      project_sort_order?: number | null;
      access?: ChatAccess;
      access_identifiers?: string[];
      pin_to_top?: boolean;
      unpin_from_top?: boolean;
    }) => chatsApi.update(chatId, payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['chats'] });
      qc.invalidateQueries({ queryKey: ['chat-projects'] });
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
      qc.invalidateQueries({ queryKey: ['chat-projects'] });
      qc.removeQueries({ queryKey: ['chats', chatId] });
    },
  });
}

export function useCloneChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, includeMessages }: { chatId: string; includeMessages?: boolean }) =>
      chatsApi.clone(chatId, includeMessages === undefined ? undefined : { include_messages: includeMessages }),
    onSuccess: (chat) => {
      qc.setQueryData<ChatListItem[] | undefined>(['chats'], (prev) => {
        const existing = prev ?? [];
        const withoutCreated = existing.filter((item) => item.id !== chat.id);
        return [chat, ...withoutCreated];
      });
      qc.invalidateQueries({ queryKey: ['chats'] });
      qc.invalidateQueries({ queryKey: ['chats', chat.id] });
    },
  });
}

export function useTransferChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, identifier }: { chatId: string; identifier: string }) =>
      chatsApi.transfer(chatId, identifier),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['chats'] });
      qc.removeQueries({ queryKey: ['chats', vars.chatId] });
    },
  });
}

export function useDeleteChatMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, messageId }: { chatId: string; messageId: string }) =>
      chatsApi.deleteMessage(chatId, messageId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['chats'] });
      qc.invalidateQueries({ queryKey: ['chats', vars.chatId] });
    },
  });
}

export function useTruncateChatFromMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, messageId }: { chatId: string; messageId: string }) =>
      chatsApi.truncateFromMessage(chatId, messageId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['chats'] });
      qc.invalidateQueries({ queryKey: ['chats', vars.chatId] });
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
    mutationFn: ({ chatId, content, attachments }: { chatId: string; content: string; attachments?: ChatAttachment[] }) =>
      chatsApi.sendMessage(chatId, content, attachments),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['chats'] });
      qc.invalidateQueries({ queryKey: ['chats', vars.chatId] });
      qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export function useUploadChatFiles() {
  return useMutation({
    mutationFn: (files: File[]) => chatsApi.uploadFiles(files),
  });
}

export function useImportChatBundle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => chatsApi.importBundle(file),
    onSuccess: (chat) => {
      qc.setQueryData<ChatListItem[] | undefined>(['chats'], (prev) => {
        const existing = prev ?? [];
        const withoutImported = existing.filter((item) => item.id !== chat.id);
        return [chat, ...withoutImported];
      });
      qc.invalidateQueries({ queryKey: ['chats'] });
      qc.invalidateQueries({ queryKey: ['chats', chat.id] });
    },
  });
}

export function useChatStats(chatId: string | undefined, enabled = true, options?: { adminView?: boolean }) {
  return useQuery({
    queryKey: ['chats', chatId, 'stats', options?.adminView ? 'admin-view' : 'default-view'],
    queryFn: () => chatsApi.stats(chatId!),
    enabled: !!chatId && enabled,
  });
}

export function useUpdateChatMessagePreview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, messageId, ...payload }: {
      chatId: string;
      messageId: string;
      title?: string | null;
      html: string;
    }) => chatsApi.updatePreview(chatId, messageId, payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['chats', vars.chatId] });
      qc.invalidateQueries({ queryKey: ['chats'] });
    },
  });
}
