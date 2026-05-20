import type { UserRole, UserStatus } from '../constants/index.js';
import type { UserLimits } from '../constants/limits.js';

export interface UserImpersonationInfo {
  is_impersonating: boolean;
  impersonator_user_id: string | null;
  impersonator_role: UserRole | null;
}

export interface UserPublic {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  role: UserRole;
  status: UserStatus;
  email_verified_at: string | null;
  created_at: string;
  impersonation?: UserImpersonationInfo;
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

export type AliceTargetType = 'general_chat' | 'agent_chat' | 'specific_chat';
export type AliceTtsMode = 'brief' | 'standard';

export interface AliceProfileSettingsDto {
  is_enabled: boolean;
  default_target_type: AliceTargetType;
  default_chat_id: string | null;
  default_agent_id: string | null;
  default_model_external_id: string | null;
  save_messages: boolean;
  tts_mode: AliceTtsMode;
  max_tts_chars: number;
}

export interface AliceProfileStatusDto {
  is_linked: boolean;
  linked_at: string | null;
  last_seen_at: string | null;
  linked_skill_user_id: string | null;
}

export interface AliceProfileLinkDto {
  linked_skill_user_id: string;
  linked_at: string;
  last_seen_at: string | null;
  application_id: string | null;
}

export interface AliceLinkCodeDto {
  code: string;
  expires_at: string;
}

export interface AliceProfileDto {
  settings: AliceProfileSettingsDto;
  status: AliceProfileStatusDto;
  links: AliceProfileLinkDto[];
  link_code?: AliceLinkCodeDto | null;
}

export interface TelegramProfileSettingsDto {
  notify_on_task_completed: boolean;
  notify_on_task_failed: boolean;
  notify_on_landing_ready: boolean;
}

export interface TelegramProfileStatusDto {
  is_linked: boolean;
  linked_at: string | null;
  last_seen_at: string | null;
  telegram_user_id: string | null;
  telegram_chat_id: string | null;
  telegram_username: string | null;
  telegram_display_name: string | null;
}

export interface TelegramLinkCodeDto {
  code: string;
  expires_at: string;
}

export interface TelegramProfileDto {
  settings: TelegramProfileSettingsDto;
  status: TelegramProfileStatusDto;
  bot_username: string | null;
  link_code?: TelegramLinkCodeDto | null;
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

export type ProfileLeaderboardSort = 'tokens' | 'cost' | 'chats' | 'messages';

export interface ProfileLeaderboardEntry {
  rank: number;
  position: number;
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  total_tokens: number;
  total_cost_usd: string;
  chats_count: number;
  messages_count: number;
  is_current_user: boolean;
}

export interface ProfileLeaderboard {
  sort_by: ProfileLeaderboardSort;
  page: number;
  per_page: number;
  total_pages: number;
  total_users: number;
  current_user: ProfileLeaderboardEntry | null;
  entries: ProfileLeaderboardEntry[];
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
  chat_id?: string | null;
}

export interface UserProfile extends UserPublic {
  has_pending_email_verification: boolean;
  has_password: boolean;
  balance_usd: string;
  balance_rub: string;
  usd_to_rub_rate: number;
  linked_accounts: LinkedAccount[];
  alice: AliceProfileDto | null;
  telegram: TelegramProfileDto | null;
  provider_keys: {
    openrouter: {
      configured: boolean;
      key_hint: string | null;
      label: string | null;
      updated_at: string | null;
    };
  };
  usage: UserUsageSummary;
  balance_history: BalanceHistoryItem[];
  limits: UserLimits;
}

export interface PublicUserProfile extends UserSlim {
  role: UserRole;
  created_at: string;
  usd_to_rub_rate: number;
  usage: UserUsageSummary;
}
