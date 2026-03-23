export const UserRole = {
  USER: 'user',
  POWER_USER: 'power_user',
  CURATOR: 'curator',
  ADMIN: 'admin',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const userRoleValues = Object.values(UserRole) as [UserRole, ...UserRole[]];

export const UserStatus = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DELETED: 'deleted',
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const userStatusValues = Object.values(UserStatus) as [UserStatus, ...UserStatus[]];

export const AuthProvider = {
  EMAIL: 'email',
  GOOGLE: 'google',
  GITHUB: 'github',
} as const;

export type AuthProvider = (typeof AuthProvider)[keyof typeof AuthProvider];

export const authProviderValues = Object.values(AuthProvider) as [AuthProvider, ...AuthProvider[]];
