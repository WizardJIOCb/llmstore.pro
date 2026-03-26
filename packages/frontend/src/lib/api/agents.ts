import { apiClient } from '../api-client';

// --- Types ---

export interface Agent {
  id: string;
  owner_user_id: string;
  name: string;
  slug: string | null;
  description: string | null;
  visibility: string;
  status: string;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentVersion {
  id: string;
  agent_id: string;
  version_number: number;
  model_id: string | null;
  system_prompt: string | null;
  runtime_config: Record<string, unknown>;
  response_mode: string;
  created_at: string;
}

export interface ToolDefinition {
  id: string;
  name: string;
  slug: string;
  tool_type: string;
  description: string | null;
  input_schema: Record<string, unknown>;
  is_builtin: boolean;
  is_active: boolean;
}

export interface AgentFull extends Agent {
  version: AgentVersion | null;
  tools: ToolDefinition[];
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

export interface RunResult {
  run_id: string;
  status: string;
  output: string;
  tool_traces: ToolTrace[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; estimated_cost: string; model: string } | null;
  latency_ms: number;
}

export interface RunSummary {
  id: string;
  agent_id: string;
  status: string;
  mode: string;
  input_summary: string | null;
  output_summary: string | null;
  latency_ms: number | null;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

export interface AgentStats {
  agent_id: string;
  total_runs: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_cost: string;
  total_latency_ms: number;
  last_run_at: string | null;
}

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  runId?: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number; estimated_cost: string; model: string } | null;
  latencyMs?: number;
  toolTraces?: ToolTrace[];
}

export interface ChatHistoryResponse {
  session_id: string | null;
  share_token: string | null;
  messages: ChatHistoryMessage[];
}

export interface SharedChatResponse {
  messages: ChatHistoryMessage[];
  agent_name: string;
}

export interface RunDetail {
  id: string;
  agent_id: string;
  status: string;
  mode: string;
  input_summary: string | null;
  output_summary: string | null;
  final_output: string | null;
  latency_ms: number | null;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  messages: Array<{
    id: string;
    role: string;
    content_text: string | null;
    created_at: string;
  }>;
  tool_calls: Array<{
    id: string;
    tool_call_id: string;
    tool_name: string;
    tool_input: Record<string, unknown>;
    tool_output: Record<string, unknown> | null;
    status: string;
    duration_ms: number | null;
    error_message: string | null;
  }>;
}

// --- API ---

export const agentApi = {
  create: (data: {
    name: string;
    description?: string;
    visibility?: 'public' | 'private';
    system_prompt?: string;
    tool_ids?: string[];
    runtime_config?: Record<string, unknown>;
  }) =>
    apiClient.post<{ data: AgentFull }>('/agents', data).then(r => r.data.data),

  list: () =>
    apiClient.get<{ data: Agent[] }>('/agents').then(r => r.data.data),

  get: (id: string) =>
    apiClient.get<{ data: AgentFull }>(`/agents/${id}`).then(r => r.data.data),

  update: (id: string, data: {
    name?: string;
    description?: string;
    visibility?: string;
    status?: string;
    system_prompt?: string;
    model_id?: string | null;
    runtime_config?: Record<string, unknown>;
    tool_ids?: string[];
    response_mode?: 'text' | 'json_object' | 'json_schema';
  }) =>
    apiClient.put<{ data: Agent }>(`/agents/${id}`, data).then(r => r.data.data),

  delete: (id: string) =>
    apiClient.delete(`/agents/${id}`),

  createVersion: (agentId: string, data: {
    system_prompt?: string;
    tool_ids?: string[];
    runtime_config?: Record<string, unknown>;
  }) =>
    apiClient.post<{ data: AgentVersion }>(`/agents/${agentId}/versions`, data).then(r => r.data.data),

  listBuiltinTools: () =>
    apiClient.get<{ data: ToolDefinition[] }>('/agents/tools/builtin').then(r => r.data.data),

  getStats: () =>
    apiClient.get<{ data: Record<string, AgentStats> }>('/agents/stats').then(r => r.data.data),

  // Chat history
  getChatHistory: (agentId: string) =>
    apiClient.get<{ data: ChatHistoryResponse }>(`/agents/${agentId}/chat`).then(r => r.data.data),

  shareChat: (agentId: string) =>
    apiClient.post<{ data: { share_token: string } }>(`/agents/${agentId}/chat/share`).then(r => r.data.data),

  clearChat: (agentId: string) =>
    apiClient.post(`/agents/${agentId}/chat/clear`),

  getSharedChat: (token: string) =>
    apiClient.get<{ data: SharedChatResponse }>(`/shared/chat/${token}`).then(r => r.data.data),

  // Runtime
  startRun: (agentId: string, data: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  }) =>
    apiClient.post<{ data: RunResult }>(`/agents/${agentId}/runs`, data).then(r => r.data.data),

  getRun: (runId: string) =>
    apiClient.get<{ data: RunDetail }>(`/runs/${runId}`).then(r => r.data.data),

  listRuns: (agentId?: string) => {
    const params = agentId ? { agent_id: agentId } : {};
    return apiClient.get<{ data: RunSummary[] }>('/runs', { params }).then(r => r.data.data);
  },
};
