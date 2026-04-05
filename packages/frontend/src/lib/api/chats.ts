import { apiClient } from '../api-client';

export type ChatMode = 'general' | 'agent';
export type ChatAccess = 'public' | 'private' | 'restricted';
export type ChatReactionType = 'heart' | 'thumbs_up' | 'thumbs_down' | 'laugh' | 'smile' | 'meh';

export interface CodingReportChangedFile {
  path: string;
  summary?: string;
}

export interface CodingReportProjectFile {
  path: string;
  content: string;
  summary?: string;
  language?: string;
  entrypoint?: boolean;
}

export interface CodingReportProject {
  title?: string;
  runtime: 'node' | 'python' | 'static' | 'generic';
  root_dir?: string;
  entrypoint?: string;
  install?: string[];
  run?: string[];
  test?: string[];
  notes?: string[];
  files: CodingReportProjectFile[];
}

export interface CodingReportPreview {
  type: 'html' | 'url';
  title?: string;
  html?: string;
  url?: string;
}

export interface CodingReport {
  summary?: string;
  worklog?: string[];
  changed_files?: CodingReportChangedFile[];
  how_to_run?: string[];
  notes?: string[];
  project?: CodingReportProject | null;
  preview?: CodingReportPreview | null;
}

export interface ProjectRunVerification {
  kind: 'http' | 'process_exit' | 'none';
  ok: boolean;
  message: string;
  url?: string;
  http_status?: number | null;
}

export interface ProjectRunResult {
  runtime: 'node' | 'python' | 'static' | 'generic';
  status: 'passed' | 'failed' | 'timeout' | 'unsupported';
  project_run_count: number | null;
  command: string[];
  entrypoint: string | null;
  duration_ms: number;
  exit_code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  verification: ProjectRunVerification;
}

export interface ProjectDeployment {
  id: string;
  status: 'deploying' | 'running' | 'stopped' | 'failed';
  title: string;
  runtime: 'node' | 'python';
  entrypoint: string | null;
  env: Record<string, string>;
  webhook_url: string;
  linked_agent_id: string | null;
  linked_agent_name: string | null;
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
  recent_runs: Array<{
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
  }>;
  created_at: string;
  updated_at: string;
  last_started_at: string | null;
  last_stopped_at: string | null;
}

export interface ToolTrace {
  tool_call_id: string;
  tool_name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  status: string;
  duration_ms: number | null;
  error?: string;
}

export interface ChatListItem {
  id: string;
  title: string;
  mode: ChatMode;
  agent_id: string | null;
  agent_name?: string | null;
  agent_model_external_id?: string | null;
  agent_model_label?: string | null;
  effective_model_label?: string | null;
  model_external_id: string | null;
  access: ChatAccess;
  access_identifiers: string[];
  share_token: string | null;
  message_count: number;
  last_message_preview: string | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
  owner_name?: string | null;
  owner_username?: string | null;
  owner_email?: string | null;
  is_admin_view?: boolean;
  has_site_preview?: boolean;
  has_published_landing?: boolean;
  has_active_deployment?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  run_id: string | null;
  usage: Record<string, unknown> | null;
  project_run_count?: number | null;
  attachments?: ChatAttachment[];
  latency_ms: number | null;
  created_at: string;
}

export interface ChatAttachment {
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  kind: 'image' | 'text' | 'file';
  url: string;
  text_preview?: string;
}

export interface ChatToolDefinition {
  id: string;
  name: string;
  slug: string;
  tool_type: string;
  description: string | null;
  is_builtin: boolean;
  is_active: boolean;
}

export interface ChatPendingRunState {
  run_id: string;
  status: string;
  started_at: string;
  completed_at?: string | null;
  label: string;
  detail: string;
  tool_name?: string | null;
  error?: string | null;
  is_terminal?: boolean;
  is_partial?: boolean;
}

export interface ChatDetails {
  chat: Omit<ChatListItem, 'last_message_preview'> & {
    agent_name: string | null;
    agent_chat_description: string | null;
    agent_starter_prompts: string[];
    tool_ids: string[];
    tools: ChatToolDefinition[];
    pending_run: ChatPendingRunState | null;
  };
  messages: ChatMessage[];
}

export interface GalleryPreviewItem {
  message_id: string;
  chat_id: string;
  chat_title: string;
  chat_url: string;
  kind: 'preview' | 'project' | 'hybrid';
  preview_title: string | null;
  preview_type: 'html' | 'url' | null;
  preview_url: string | null;
  preview_html: string | null;
  project_title: string | null;
  project_runtime: 'node' | 'python' | 'static' | 'generic' | null;
  project_entrypoint: string | null;
  project_file_count: number;
  project_run_count: number;
  author_name: string;
  author_username: string | null;
  view_count: number;
  unique_view_count: number;
  total_view_count: number;
  reaction_counts: Record<ChatReactionType, number>;
  my_reaction: ChatReactionType | null;
  created_at: string;
  total_usd_cost: number;
  total_rub_cost: number;
  model: string | null;
}

export interface GalleryReactionState {
  reaction_counts: Record<ChatReactionType, number>;
  my_reaction: ChatReactionType | null;
}

export interface SendMessageResult {
  processing?: boolean;
  pending_run?: ChatPendingRunState | null;
  user_message: ChatMessage;
  assistant_message: ChatMessage | null;
  chat: {
    id: string;
    title: string;
    mode: ChatMode;
    agent_id: string | null;
    model_external_id: string | null;
    access: ChatAccess;
    access_identifiers: string[];
    share_token: string | null;
  };
}

export interface UpdateMessagePreviewResult {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  run_id: string | null;
  usage: Record<string, unknown> | null;
  latency_ms: number | null;
  created_at: string;
}

export interface ChatStats {
  chat: {
    id: string;
    title: string;
    mode: ChatMode;
    agent_id: string | null;
    agent_name: string | null;
    model_external_id: string | null;
    created_at: string;
    updated_at: string;
    last_message_at: string;
    message_count: number;
    user_messages: number;
    assistant_messages: number;
  };
  totals: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    usd_cost: number;
    rub_cost: number;
    messages_with_usage: number;
    total_latency_ms: number;
  };
  by_model: Array<{
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    usd_cost: number;
    rub_cost: number;
    messages: number;
  }>;
  usd_to_rub_rate: number;
}

export interface ChatAgentOption {
  id: string;
  name: string;
  owner_user_id: string;
  owner_name: string | null;
  owner_username: string | null;
  is_owner: boolean;
  description: string | null;
  created_at: string;
  total_runs: number;
  model_external_id: string | null;
  model_label: string | null;
  pricing_input_usd_per_million: number | null;
  pricing_output_usd_per_million: number | null;
  is_coding_model: boolean;
  chat_description: string | null;
  starter_prompts: string[];
}

export interface ChatBundleExport {
  filename: string;
  payload: unknown;
}

export interface PublishedLanding {
  id?: string;
  slug?: string;
  subdomain?: string | null;
  title?: string | null;
  description?: string | null;
  url: string;
  site_url?: string | null;
  preview_url?: string | null;
  is_published?: boolean;
  updated_at?: string | null;
}

export interface TransferChatResult {
  chat_id: string;
  transferred_to: {
    id?: string;
    name?: string | null;
    username?: string | null;
    email: string;
  };
}

function resolveBundleFilename(contentDisposition: string | undefined, fallback: string): string {
  if (!contentDisposition) return fallback;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) return quotedMatch[1];

  const plainMatch = contentDisposition.match(/filename=([^;]+)/i);
  return plainMatch?.[1]?.trim() || fallback;
}

export const chatsApi = {
  list: () => apiClient.get<{ data: ChatListItem[] }>('/chats').then((r) => r.data.data),

  listAgents: () => apiClient.get<{ data: ChatAgentOption[] }>('/chats/agents').then((r) => r.data.data),

  get: (chatId: string) =>
    apiClient.get<{ data: ChatDetails }>(`/chats/${chatId}`).then((r) => r.data.data),

  create: (payload?: {
    title?: string;
      mode?: ChatMode;
      agent_id?: string | null;
      model_external_id?: string | null;
      system_prompt?: string | null;
      tool_ids?: string[];
      access?: ChatAccess;
      access_identifiers?: string[];
    }) => apiClient.post<{ data: ChatListItem }>('/chats', payload ?? {}).then((r) => r.data.data),

  update: (
    chatId: string,
    payload: {
      title?: string;
      mode?: ChatMode;
      agent_id?: string | null;
      model_external_id?: string | null;
      system_prompt?: string | null;
      tool_ids?: string[];
      access?: ChatAccess;
      access_identifiers?: string[];
    },
  ) => apiClient.patch<{ data: ChatListItem }>(`/chats/${chatId}`, payload).then((r) => r.data.data),

  transfer: (chatId: string, identifier: string) =>
    apiClient
      .post<{ data: TransferChatResult }>(`/chats/${chatId}/transfer`, { identifier })
      .then((r) => r.data.data),

  gallery: (limit = 24) =>
    apiClient.get<{ data: GalleryPreviewItem[] }>(`/gallery/previews?limit=${encodeURIComponent(String(limit))}`).then((r) => r.data.data),

  setGalleryReaction: (chatId: string, reactionType: ChatReactionType) =>
    apiClient
      .post<{ data: GalleryReactionState }>(`/gallery/previews/${chatId}/reaction`, { reaction_type: reactionType })
      .then((r) => r.data.data),

  deleteGalleryReaction: (chatId: string) =>
    apiClient
      .delete<{ data: GalleryReactionState }>(`/gallery/previews/${chatId}/reaction`)
      .then((r) => r.data.data),

  remove: (chatId: string) => apiClient.delete(`/chats/${chatId}`),

  deleteMessage: (chatId: string, messageId: string) =>
    apiClient.delete<{ data: { ok: true } }>(`/chats/${chatId}/messages/${messageId}`).then((r) => r.data.data),

  truncateFromMessage: (chatId: string, messageId: string) =>
    apiClient.post<{ data: { ok: true } }>(`/chats/${chatId}/messages/${messageId}/truncate`).then((r) => r.data.data),

  share: (chatId: string) =>
    apiClient.post<{ data: { share_token: string } }>(`/chats/${chatId}/share`).then((r) => r.data.data),

  sendMessage: (chatId: string, content: string, attachments?: ChatAttachment[]) =>
    apiClient
      .post<{ data: SendMessageResult }>(`/chats/${chatId}/messages`, { content, attachments: attachments ?? [] })
      .then((r) => r.data.data),

  uploadFiles: (files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return apiClient
      .post<{ data: ChatAttachment[] }>('/chats/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data.data);
  },

  stats: (chatId: string) =>
    apiClient.get<{ data: ChatStats }>(`/chats/${chatId}/stats`).then((r) => r.data.data),

  updatePreview: (chatId: string, messageId: string, payload: { title?: string | null; html: string }) =>
    apiClient
      .patch<{ data: UpdateMessagePreviewResult }>(`/chats/${chatId}/messages/${messageId}/preview`, payload)
      .then((r) => r.data.data),

  getPublishedLanding: (chatId: string, messageId: string) =>
    apiClient
      .get<{ data: PublishedLanding | null }>(`/chats/${chatId}/messages/${messageId}/landing`)
      .then((r) => r.data.data),

  publishLanding: (chatId: string, messageId: string) =>
    apiClient
      .post<{ data: PublishedLanding }>(`/chats/${chatId}/messages/${messageId}/landing`)
      .then((r) => r.data.data),

  updateLanding: (
    chatId: string,
    messageId: string,
    payload: { title?: string | null; slug?: string | null; subdomain?: string | null; description?: string | null },
  ) =>
    apiClient
      .patch<{ data: PublishedLanding }>(`/chats/${chatId}/messages/${messageId}/landing`, payload)
      .then((r) => r.data.data),

  unpublishLanding: (chatId: string, messageId: string) =>
    apiClient
      .delete<{ data: { ok: true } }>(`/chats/${chatId}/messages/${messageId}/landing`)
      .then((r) => r.data.data),

  runProject: (chatId: string, messageId: string) =>
    apiClient
      .post<{ data: ProjectRunResult }>(`/chats/${chatId}/messages/${messageId}/project-run`)
      .then((r) => r.data.data),

  runGalleryProject: (chatId: string, messageId: string) =>
    apiClient
      .post<{ data: ProjectRunResult }>(`/gallery/previews/${chatId}/messages/${messageId}/project-run`)
      .then((r) => r.data.data),

  getProjectDeployment: (chatId: string, messageId: string) =>
    apiClient
      .get<{ data: ProjectDeployment | null }>(`/chats/${chatId}/messages/${messageId}/project-deployment`)
      .then((r) => r.data.data),

  upsertProjectDeployment: (
    chatId: string,
    messageId: string,
    payload: { env?: Record<string, string>; linked_agent_id?: string | null; set_telegram_webhook?: boolean },
  ) =>
    apiClient
      .post<{ data: ProjectDeployment }>(`/chats/${chatId}/messages/${messageId}/project-deployment`, payload)
      .then((r) => r.data.data),

  startProjectDeployment: (chatId: string, messageId: string) =>
    apiClient
      .post<{ data: ProjectDeployment }>(`/chats/${chatId}/messages/${messageId}/project-deployment/start`)
      .then((r) => r.data.data),

  reinstallProjectDeploymentWebhook: (chatId: string, messageId: string) =>
    apiClient
      .post<{ data: ProjectDeployment }>(`/chats/${chatId}/messages/${messageId}/project-deployment/reinstall-webhook`)
      .then((r) => r.data.data),

  stopProjectDeployment: (chatId: string, messageId: string) =>
    apiClient
      .post<{ data: ProjectDeployment }>(`/chats/${chatId}/messages/${messageId}/project-deployment/stop`)
      .then((r) => r.data.data),

  updateSharedPreview: (token: string, messageId: string, payload: { title?: string | null; html: string }) =>
    apiClient
      .patch<{ data: UpdateMessagePreviewResult }>(`/shared/chats/${token}/messages/${messageId}/preview`, payload)
      .then((r) => r.data.data),

  exportBundle: (chatId: string) =>
    apiClient
      .get<{ data: unknown }>(`/chats/${chatId}/export`)
      .then((r): ChatBundleExport => ({
        filename: resolveBundleFilename(r.headers['content-disposition'], `chat-${chatId}.llmchat.json`),
        payload: r.data.data,
      })),

  exportSharedBundle: (token: string) =>
    apiClient
      .get<{ data: unknown }>(`/shared/chats/${token}/export`)
      .then((r): ChatBundleExport => ({
        filename: resolveBundleFilename(r.headers['content-disposition'], `shared-chat-${token}.llmchat.json`),
        payload: r.data.data,
      })),

  importBundle: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient
      .post<{ data: ChatListItem }>('/chats/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data.data);
  },
};
