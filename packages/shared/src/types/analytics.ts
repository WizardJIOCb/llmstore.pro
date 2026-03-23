import type { AgentRunStatus, AgentRunMode } from '../constants/index.js';

export interface AgentRunSummary {
  id: string;
  agent_id: string;
  agent_name: string;
  status: AgentRunStatus;
  mode: AgentRunMode;
  model_name: string | null;
  started_at: string;
  completed_at: string | null;
  latency_ms: number | null;
  input_summary: string | null;
  output_summary: string | null;
  actual_cost: number | null;
}

export interface UsageSummary {
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens: number | null;
  cached_tokens: number | null;
  total_tokens: number | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  cache_discount: number | null;
}

export interface CostEstimate {
  low: number;
  mid: number;
  high: number;
  currency: string;
}

export interface CostDashboardResponse {
  total_cost: number;
  total_runs: number;
  total_tokens: number;
  cache_savings: number;
  series: Array<{
    date: string;
    cost: number;
    runs: number;
    tokens: number;
  }>;
  by_agent?: Array<{
    agent_id: string;
    agent_name: string;
    cost: number;
    runs: number;
  }>;
  by_model?: Array<{
    model_id: string;
    model_name: string;
    cost: number;
    runs: number;
  }>;
}
