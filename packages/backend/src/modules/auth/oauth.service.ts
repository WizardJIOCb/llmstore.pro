import axios from 'axios';
import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { users, authAccounts } from '../../db/schema/index.js';
import { env } from '../../config/env.js';
import { AppError, ConflictError } from '../../middleware/error-handler.js';
import type { UserPublic } from '@llmstore/shared';

interface OAuthUserInfo {
  email: string;
  name: string | null;
  avatar_url: string | null;
  provider_account_id: string;
}

const PROVIDER_CONFIG: Record<string, {
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string;
  clientId: () => string;
  clientSecret: () => string;
}> = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scopes: 'openid email profile',
    clientId: () => env.GOOGLE_CLIENT_ID,
    clientSecret: () => env.GOOGLE_CLIENT_SECRET,
  },
  yandex: {
    authorizeUrl: 'https://oauth.yandex.ru/authorize',
    tokenUrl: 'https://oauth.yandex.ru/token',
    userInfoUrl: 'https://login.yandex.ru/info?format=json',
    scopes: '',
    clientId: () => env.YANDEX_CLIENT_ID,
    clientSecret: () => env.YANDEX_CLIENT_SECRET,
  },
  mailru: {
    authorizeUrl: 'https://oauth.mail.ru/login',
    tokenUrl: 'https://oauth.mail.ru/token',
    userInfoUrl: 'https://oauth.mail.ru/userinfo',
    scopes: 'userinfo',
    clientId: () => env.MAILRU_CLIENT_ID,
    clientSecret: () => env.MAILRU_CLIENT_SECRET,
  },
};

const SUPPORTED_PROVIDERS = Object.keys(PROVIDER_CONFIG);

export function validateProvider(provider: string): void {
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new AppError(400, 'INVALID_PROVIDER', `Неподдерживаемый OAuth провайдер: ${provider}`);
  }
}

function getCallbackUrl(provider: string): string {
  return `${env.BACKEND_URL}/api/auth/oauth/${provider}/callback`;
}

export function getOAuthUrl(provider: string, state: string): string {
  validateProvider(provider);
  const config = PROVIDER_CONFIG[provider];
  const params = new URLSearchParams({
    client_id: config.clientId(),
    redirect_uri: getCallbackUrl(provider),
    response_type: 'code',
    state,
  });

  if (config.scopes) {
    params.set('scope', config.scopes);
  }

  if (provider === 'google') {
    params.set('access_type', 'offline');
    params.set('prompt', 'consent');
  }

  return `${config.authorizeUrl}?${params.toString()}`;
}

async function exchangeCodeForToken(provider: string, code: string): Promise<string> {
  const config = PROVIDER_CONFIG[provider];

  const params = new URLSearchParams({
    client_id: config.clientId(),
    client_secret: config.clientSecret(),
    code,
    redirect_uri: getCallbackUrl(provider),
    grant_type: 'authorization_code',
  });

  const response = await axios.post(config.tokenUrl, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return response.data.access_token;
}

async function fetchUserInfo(provider: string, accessToken: string): Promise<OAuthUserInfo> {
  const config = PROVIDER_CONFIG[provider];

  const response = await axios.get(config.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = response.data;

  switch (provider) {
    case 'google':
      return {
        email: data.email,
        name: data.name || null,
        avatar_url: data.picture || null,
        provider_account_id: String(data.id),
      };
    case 'yandex':
      return {
        email: data.default_email || data.emails?.[0] || '',
        name: data.display_name || data.real_name || null,
        avatar_url: data.default_avatar_id
          ? `https://avatars.yandex.net/get-yapic/${data.default_avatar_id}/islands-200`
          : null,
        provider_account_id: String(data.id),
      };
    case 'mailru':
      return {
        email: data.email || '',
        name: data.name || null,
        avatar_url: data.image || null,
        provider_account_id: String(data.id),
      };
    default:
      throw new AppError(400, 'INVALID_PROVIDER', 'Неподдерживаемый провайдер');
  }
}

const userPublicColumns = {
  id: users.id,
  email: users.email,
  username: users.username,
  name: users.name,
  avatar_url: users.avatar_url,
  role: users.role,
  status: users.status,
  created_at: users.created_at,
} as const;

function toUserPublic(user: typeof userPublicColumns extends infer T ? { [K in keyof T]: unknown } : never): UserPublic {
  const u = user as Record<string, unknown>;
  return {
    id: u.id as string,
    email: u.email as string,
    username: u.username as string | null,
    name: u.name as string | null,
    avatar_url: u.avatar_url as string | null,
    role: u.role as UserPublic['role'],
    status: u.status as UserPublic['status'],
    created_at: (u.created_at as Date).toISOString(),
  };
}

export async function handleCallback(
  provider: string,
  code: string,
  sessionUserId?: string,
): Promise<UserPublic> {
  validateProvider(provider);

  const accessToken = await exchangeCodeForToken(provider, code);
  const userInfo = await fetchUserInfo(provider, accessToken);

  if (!userInfo.email) {
    throw new AppError(400, 'NO_EMAIL', 'Не удалось получить email от провайдера');
  }

  // Check if this provider account is already linked
  const [existingAccount] = await db
    .select({ id: authAccounts.id, user_id: authAccounts.user_id })
    .from(authAccounts)
    .where(
      and(
        eq(authAccounts.provider, provider as 'google' | 'yandex' | 'mailru'),
        eq(authAccounts.provider_account_id, userInfo.provider_account_id),
      ),
    )
    .limit(1);

  // Link mode: user is already logged in, linking a new provider
  if (sessionUserId) {
    if (existingAccount) {
      if (existingAccount.user_id === sessionUserId) {
        // Already linked to this user — just return
        const [user] = await db.select(userPublicColumns).from(users).where(eq(users.id, sessionUserId)).limit(1);
        return toUserPublic(user);
      }
      throw new ConflictError('Этот аккаунт уже привязан к другому пользователю');
    }

    await db.insert(authAccounts).values({
      user_id: sessionUserId,
      provider: provider as 'google' | 'yandex' | 'mailru',
      provider_account_id: userInfo.provider_account_id,
      access_token: accessToken,
    });

    const [user] = await db.select(userPublicColumns).from(users).where(eq(users.id, sessionUserId)).limit(1);
    return toUserPublic(user);
  }

  // Login mode: find or create user

  // Case 1: Account already exists — login
  if (existingAccount) {
    const [user] = await db.select(userPublicColumns).from(users).where(eq(users.id, existingAccount.user_id)).limit(1);
    if (!user) throw new AppError(500, 'USER_NOT_FOUND', 'Пользователь не найден');
    return toUserPublic(user);
  }

  // Case 2: User with same email exists — link and login
  const [existingUser] = await db
    .select(userPublicColumns)
    .from(users)
    .where(eq(users.email, userInfo.email.toLowerCase()))
    .limit(1);

  if (existingUser) {
    await db.insert(authAccounts).values({
      user_id: existingUser.id as string,
      provider: provider as 'google' | 'yandex' | 'mailru',
      provider_account_id: userInfo.provider_account_id,
      access_token: accessToken,
    });
    return toUserPublic(existingUser);
  }

  // Case 3: Create new user
  const [newUser] = await db
    .insert(users)
    .values({
      email: userInfo.email.toLowerCase(),
      name: userInfo.name,
      avatar_url: userInfo.avatar_url,
      role: 'user',
      status: 'active',
    })
    .returning(userPublicColumns);

  await db.insert(authAccounts).values({
    user_id: newUser.id as string,
    provider: provider as 'google' | 'yandex' | 'mailru',
    provider_account_id: userInfo.provider_account_id,
    access_token: accessToken,
  });

  return toUserPublic(newUser);
}
