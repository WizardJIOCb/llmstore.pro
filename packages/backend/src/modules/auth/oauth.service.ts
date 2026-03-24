import axios from 'axios';
import crypto from 'crypto';
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
  pkce?: boolean;
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
  vk: {
    authorizeUrl: 'https://id.vk.com/authorize',
    tokenUrl: 'https://id.vk.com/oauth2/auth',
    userInfoUrl: 'https://id.vk.com/oauth2/user_info',
    scopes: 'vkid.personal_info email phone',
    clientId: () => env.VK_CLIENT_ID,
    clientSecret: () => env.VK_CLIENT_SECRET,
    pkce: true,
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

// ─── PKCE helpers ───────────────────────────────────────────

export function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  return { codeVerifier, codeChallenge };
}

// ─── OAuth URL generation ───────────────────────────────────

export function getOAuthUrl(provider: string, state: string, codeChallenge?: string): string {
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

  // VK ID requires PKCE
  if (config.pkce && codeChallenge) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 's256');
  }

  return `${config.authorizeUrl}?${params.toString()}`;
}

// ─── Token exchange ─────────────────────────────────────────

interface TokenExchangeOptions {
  provider: string;
  code: string;
  codeVerifier?: string;
  deviceId?: string;
  state?: string;
}

interface TokenResult {
  accessToken: string;
  email?: string;
  phone?: string;
  userId?: string;
}

async function exchangeCodeForToken(opts: TokenExchangeOptions): Promise<TokenResult> {
  const config = PROVIDER_CONFIG[opts.provider];

  const params = new URLSearchParams({
    client_id: config.clientId(),
    code: opts.code,
    redirect_uri: getCallbackUrl(opts.provider),
    grant_type: 'authorization_code',
  });

  // VK uses PKCE instead of client_secret
  if (config.pkce) {
    if (opts.codeVerifier) params.set('code_verifier', opts.codeVerifier);
    if (opts.deviceId) params.set('device_id', opts.deviceId);
    if (opts.state) params.set('state', opts.state);
  } else {
    params.set('client_secret', config.clientSecret());
  }

  const response = await axios.post(config.tokenUrl, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (opts.provider === 'vk') {
    console.log('[OAuth VK] token response:', JSON.stringify(response.data));
  }

  return {
    accessToken: response.data.access_token,
    email: response.data.email,
    phone: response.data.phone,
    userId: response.data.user_id ? String(response.data.user_id) : undefined,
  };
}

// ─── User info fetching ─────────────────────────────────────

async function fetchUserInfo(provider: string, token: TokenResult): Promise<OAuthUserInfo> {
  const config = PROVIDER_CONFIG[provider];

  // VK uses POST with form data for user info
  if (provider === 'vk') {
    const response = await axios.post(
      config.userInfoUrl,
      new URLSearchParams({ client_id: config.clientId(), access_token: token.accessToken }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    console.log('[OAuth VK] userinfo response:', JSON.stringify(response.data));
    const data = response.data.user;

    // Email can come from token response or userinfo
    const email = data?.email || token.email || '';
    const phone = data?.phone || token.phone || '';
    const userId = String(data?.user_id || token.userId || '');

    // If no email, generate a placeholder from VK user_id so we can still create account
    const effectiveEmail = email || (phone ? `${phone}@vk.user` : `${userId}@vk.user`);

    return {
      email: effectiveEmail,
      name: [data?.first_name, data?.last_name].filter(Boolean).join(' ') || null,
      avatar_url: data?.avatar || null,
      provider_account_id: userId,
    };
  }

  // Other providers use GET with Bearer token
  const response = await axios.get(config.userInfoUrl, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
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

// ─── Helpers ────────────────────────────────────────────────

type ProviderType = 'google' | 'yandex' | 'mailru' | 'vk';

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

// ─── Main callback handler ──────────────────────────────────

/** Update user avatar from OAuth provider if user has no avatar set */
async function updateAvatarIfMissing(userId: string, avatarUrl: string | null) {
  if (!avatarUrl) return;
  const [user] = await db
    .select({ avatar_url: users.avatar_url })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (user && !user.avatar_url) {
    await db.update(users).set({ avatar_url: avatarUrl }).where(eq(users.id, userId));
  }
}

export interface HandleCallbackOptions {
  provider: string;
  code: string;
  sessionUserId?: string;
  codeVerifier?: string;
  deviceId?: string;
  state?: string;
}

export async function handleCallback(opts: HandleCallbackOptions): Promise<UserPublic> {
  const { provider, code, sessionUserId, codeVerifier, deviceId, state } = opts;
  validateProvider(provider);

  const token = await exchangeCodeForToken({ provider, code, codeVerifier, deviceId, state });
  const userInfo = await fetchUserInfo(provider, token);

  if (!userInfo.email) {
    throw new AppError(400, 'NO_EMAIL', 'Не удалось получить email от провайдера');
  }

  // Check if this provider account is already linked
  const [existingAccount] = await db
    .select({ id: authAccounts.id, user_id: authAccounts.user_id })
    .from(authAccounts)
    .where(
      and(
        eq(authAccounts.provider, provider as ProviderType),
        eq(authAccounts.provider_account_id, userInfo.provider_account_id),
      ),
    )
    .limit(1);

  // Link mode: user is already logged in, linking a new provider
  if (sessionUserId) {
    if (existingAccount) {
      if (existingAccount.user_id === sessionUserId) {
        await updateAvatarIfMissing(sessionUserId, userInfo.avatar_url);
        const [user] = await db.select(userPublicColumns).from(users).where(eq(users.id, sessionUserId)).limit(1);
        return toUserPublic(user);
      }
      throw new ConflictError('Этот аккаунт уже привязан к другому пользователю');
    }

    await db.insert(authAccounts).values({
      user_id: sessionUserId,
      provider: provider as ProviderType,
      provider_account_id: userInfo.provider_account_id,
      access_token: token.accessToken,
    });

    await updateAvatarIfMissing(sessionUserId, userInfo.avatar_url);
    const [user] = await db.select(userPublicColumns).from(users).where(eq(users.id, sessionUserId)).limit(1);
    return toUserPublic(user);
  }

  // Login mode: find or create user

  // Case 1: Account already exists — login
  if (existingAccount) {
    await updateAvatarIfMissing(existingAccount.user_id, userInfo.avatar_url);
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
      provider: provider as ProviderType,
      provider_account_id: userInfo.provider_account_id,
      access_token: token.accessToken,
    });
    await updateAvatarIfMissing(existingUser.id as string, userInfo.avatar_url);
    const [updated] = await db.select(userPublicColumns).from(users).where(eq(users.id, existingUser.id as string)).limit(1);
    return toUserPublic(updated);
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
    provider: provider as ProviderType,
    provider_account_id: userInfo.provider_account_id,
    access_token: token.accessToken,
  });

  return toUserPublic(newUser);
}
