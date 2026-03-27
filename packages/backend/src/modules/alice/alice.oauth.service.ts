import crypto from 'crypto';
import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { env } from '../../config/env.js';
import {
  aliceOauthAuthorizationCodes,
  aliceOauthTokens,
} from '../../db/schema/index.js';
import { ALICE_AUTH_CODE_TTL_SECONDS } from './alice.constants.js';
import type { AliceAuthorizeRequest, OAuthTokenResponse } from './alice.types.js';
import { AliceOAuthError } from './alice.types.js';

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function randomToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

export function validateAuthorizeRequest(input: Partial<AliceAuthorizeRequest>): AliceAuthorizeRequest {
  if (input.response_type !== 'code') {
    throw new AliceOAuthError('unsupported_response_type', 'response_type must be code');
  }
  if (!input.client_id) {
    throw new AliceOAuthError('invalid_request', 'client_id is required');
  }
  if (!input.redirect_uri) {
    throw new AliceOAuthError('invalid_request', 'redirect_uri is required');
  }
  if (input.client_id !== env.ALICE_SKILL_CLIENT_ID) {
    throw new AliceOAuthError('unauthorized_client', 'Invalid client_id', 401);
  }
  if (input.redirect_uri !== env.ALICE_ALLOWED_REDIRECT_URI) {
    throw new AliceOAuthError('invalid_request', 'Invalid redirect_uri');
  }

  return {
    response_type: 'code',
    client_id: input.client_id,
    redirect_uri: input.redirect_uri,
    state: input.state,
    scope: input.scope,
  };
}

export function validateClientCredentials(clientId?: string, clientSecret?: string): void {
  if (!clientId || !clientSecret) {
    throw new AliceOAuthError('invalid_client', 'Client authentication failed', 401);
  }
  if (clientId !== env.ALICE_SKILL_CLIENT_ID || clientSecret !== env.ALICE_SKILL_CLIENT_SECRET) {
    throw new AliceOAuthError('invalid_client', 'Client authentication failed', 401);
  }
}

export function createAuthorizeSuccessRedirect(
  redirectUri: string,
  code: string,
  state?: string,
): string {
  const url = new URL(redirectUri);
  url.searchParams.set('code', code);
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

export function createAuthorizeErrorRedirect(
  redirectUri: string,
  errorCode: string,
  state?: string,
): string {
  const url = new URL(redirectUri);
  url.searchParams.set('error', errorCode);
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

export async function issueAuthorizationCode(
  userId: string,
  request: AliceAuthorizeRequest,
): Promise<string> {
  const rawCode = randomToken(32);
  const codeHash = sha256(rawCode);
  const now = new Date();

  await db.insert(aliceOauthAuthorizationCodes).values({
    user_id: userId,
    client_id: request.client_id,
    code_hash: codeHash,
    redirect_uri: request.redirect_uri,
    scopes_json: request.scope ? request.scope.split(' ').filter(Boolean) : null,
    expires_at: addSeconds(now, ALICE_AUTH_CODE_TTL_SECONDS),
  });

  return rawCode;
}

export async function exchangeAuthorizationCode(
  code: string,
  clientId: string,
  redirectUri: string,
): Promise<OAuthTokenResponse> {
  const codeHash = sha256(code);
  const now = new Date();

  return db.transaction(async (tx) => {
    const [authCode] = await tx
      .select()
      .from(aliceOauthAuthorizationCodes)
      .where(
        and(
          eq(aliceOauthAuthorizationCodes.code_hash, codeHash),
          eq(aliceOauthAuthorizationCodes.client_id, clientId),
          eq(aliceOauthAuthorizationCodes.redirect_uri, redirectUri),
        ),
      )
      .limit(1);

    if (!authCode) throw new AliceOAuthError('invalid_grant', 'Invalid authorization code');
    if (authCode.consumed_at) throw new AliceOAuthError('invalid_grant', 'Authorization code already consumed');
    if (authCode.expires_at <= now) throw new AliceOAuthError('invalid_grant', 'Authorization code expired');

    const consumed = await tx
      .update(aliceOauthAuthorizationCodes)
      .set({ consumed_at: now })
      .where(
        and(
          eq(aliceOauthAuthorizationCodes.id, authCode.id),
          isNull(aliceOauthAuthorizationCodes.consumed_at),
        ),
      )
      .returning({ id: aliceOauthAuthorizationCodes.id });

    if (!consumed.length) {
      throw new AliceOAuthError('invalid_grant', 'Authorization code already consumed');
    }

    const accessToken = randomToken();
    const refreshToken = randomToken();
    const accessExpiresAt = addSeconds(now, env.ALICE_ACCESS_TOKEN_TTL_SECONDS);
    const refreshExpiresAt = addSeconds(now, env.ALICE_REFRESH_TOKEN_TTL_SECONDS);

    await tx.insert(aliceOauthTokens).values({
      user_id: authCode.user_id,
      client_id: clientId,
      access_token_hash: sha256(accessToken),
      refresh_token_hash: sha256(refreshToken),
      access_expires_at: accessExpiresAt,
      refresh_expires_at: refreshExpiresAt,
    });

    return {
      token_type: 'Bearer',
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: env.ALICE_ACCESS_TOKEN_TTL_SECONDS,
    };
  });
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
): Promise<OAuthTokenResponse> {
  const refreshHash = sha256(refreshToken);
  const now = new Date();

  const [tokenRow] = await db
    .select()
    .from(aliceOauthTokens)
    .where(
      and(
        eq(aliceOauthTokens.client_id, clientId),
        eq(aliceOauthTokens.refresh_token_hash, refreshHash),
      ),
    )
    .limit(1);

  if (!tokenRow) throw new AliceOAuthError('invalid_grant', 'Invalid refresh token');
  if (tokenRow.revoked_at) throw new AliceOAuthError('invalid_grant', 'Refresh token revoked');
  if (!tokenRow.refresh_expires_at || tokenRow.refresh_expires_at <= now) {
    throw new AliceOAuthError('invalid_grant', 'Refresh token expired');
  }

  const newAccessToken = randomToken();
  const newRefreshToken = randomToken();

  await db
    .update(aliceOauthTokens)
    .set({
      access_token_hash: sha256(newAccessToken),
      refresh_token_hash: sha256(newRefreshToken),
      access_expires_at: addSeconds(now, env.ALICE_ACCESS_TOKEN_TTL_SECONDS),
      refresh_expires_at: addSeconds(now, env.ALICE_REFRESH_TOKEN_TTL_SECONDS),
      revoked_at: null,
      last_used_at: now,
    })
    .where(eq(aliceOauthTokens.id, tokenRow.id));

  return {
    token_type: 'Bearer',
    access_token: newAccessToken,
    refresh_token: newRefreshToken,
    expires_in: env.ALICE_ACCESS_TOKEN_TTL_SECONDS,
  };
}

export async function revokeTokenByValue(token: string, clientId: string): Promise<void> {
  const tokenHash = sha256(token);
  await db
    .update(aliceOauthTokens)
    .set({ revoked_at: new Date() })
    .where(
      and(
        eq(aliceOauthTokens.client_id, clientId),
        or(
          eq(aliceOauthTokens.access_token_hash, tokenHash),
          eq(aliceOauthTokens.refresh_token_hash, tokenHash),
        ),
      ),
    );
}
