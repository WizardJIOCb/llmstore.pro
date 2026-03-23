import type { UserRole, UserStatus } from '../constants/index.js';

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
