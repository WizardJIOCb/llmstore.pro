import type { UserRole } from './roles.js';

export const USD_TO_RUB_RATE = 90;

export interface UserLimits {
  max_agents: number;
  max_runs_per_day: number;
  max_tokens_per_run: number;
}

export const ROLE_LIMITS: Record<UserRole, UserLimits> = {
  user: { max_agents: 3, max_runs_per_day: 50, max_tokens_per_run: 8192 },
  power_user: { max_agents: 10, max_runs_per_day: 200, max_tokens_per_run: 16384 },
  curator: { max_agents: 50, max_runs_per_day: 500, max_tokens_per_run: 32768 },
  admin: { max_agents: -1, max_runs_per_day: -1, max_tokens_per_run: -1 },
};
