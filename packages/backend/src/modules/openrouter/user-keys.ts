import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { userProviderKeys } from '../../db/schema/index.js';
import { decryptSecret } from '../../lib/secret-vault.js';
import { OpenRouterClient } from './client.js';
import { openRouterClient } from './index.js';

export interface ResolvedOpenRouterClient {
  client: OpenRouterClient;
  source: 'system' | 'user';
  key_hint: string | null;
}
export async function getUserOpenRouterKeyStatus(userId: string): Promise<{
  configured: boolean;
  key_hint: string | null;
  label: string | null;
  updated_at: string | null;
}> {
  const [row] = await db
    .select({
      key_hint: userProviderKeys.key_hint,
      label: userProviderKeys.label,
      updated_at: userProviderKeys.updated_at,
    })
    .from(userProviderKeys)
    .where(and(
      eq(userProviderKeys.user_id, userId),
      eq(userProviderKeys.provider, 'openrouter'),
    ))
    .limit(1);

  return {
    configured: Boolean(row),
    key_hint: row?.key_hint ?? null,
    label: row?.label ?? null,
    updated_at: row?.updated_at ? row.updated_at.toISOString() : null,
  };
}

export async function resolveOpenRouterClientForUser(userId: string): Promise<ResolvedOpenRouterClient> {
  const [row] = await db
    .select({
      encrypted_api_key: userProviderKeys.encrypted_api_key,
      key_hint: userProviderKeys.key_hint,
    })
    .from(userProviderKeys)
    .where(and(
      eq(userProviderKeys.user_id, userId),
      eq(userProviderKeys.provider, 'openrouter'),
    ))
    .limit(1);

  if (!row) {
    return { client: openRouterClient, source: 'system', key_hint: null };
  }

  return {
    client: new OpenRouterClient(decryptSecret(row.encrypted_api_key)),
    source: 'user',
    key_hint: row.key_hint ?? null,
  };
}
