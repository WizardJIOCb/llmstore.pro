import type { UserRole, UserStatus } from '../constants/index.js';
import type { UserLimits } from '../constants/limits.js';

export interface UserPublic {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: string;
}

export interface UserSlim {
  id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
}

export interface LinkedAccount {
  provider: string;
  provider_account_id: string;
  created_at: string;
}

export interface AgentUsageSummary {
  agent_id: string;
  agent_name: string;
  total_runs: number;
  total_tokens: number;
  total_cost: string;
}

export interface UserUsageSummary {
  total_runs: number;
  total_tokens: number;
  total_cost_usd: string;
  per_agent: AgentUsageSummary[];
}

export type BalanceHistoryDirection = 'credit' | 'debit';
export type BalanceHistoryCategory = 'topup' | 'writeoff';

export interface BalanceHistoryItem {
  id: string;
  created_at: string;
  title: string;
  event_type: string;
  category: BalanceHistoryCategory;
  direction: BalanceHistoryDirection;
  amount_usd: string;
  tokens: number;
  model: string | null;
}

export interface UserProfile extends UserPublic {
  balance_usd: string;
  balance_rub: string;
  linked_accounts: LinkedAccount[];
  usage: UserUsageSummary;
  balance_history: BalanceHistoryItem[];
  limits: UserLimits;
}
