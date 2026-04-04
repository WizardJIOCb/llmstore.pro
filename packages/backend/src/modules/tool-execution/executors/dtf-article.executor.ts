import { db } from '../../../config/database.js';
import { sourceCacheEntries } from '../../../db/schema/source-cache.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../../lib/logger.js';
import { AppError } from '../../../middleware/error-handler.js';
import type { DtfArticleResult } from '../types.js';
import { fetchDtfJson } from './dtf-http.js';

const DTF_LOCATE_URL = 'https://api.dtf.ru/v2.1/locate';
const CACHE_TTL_SEC = 600;
const ALLOWED_DOMAINS = ['dtf.ru', 'www.dtf.ru'];

interface DtfArticleResponseEntry {
  title?: string;
  date?: number;
  blocks?: Array<{
    type?: string;
    data?: {
      text?: string;
      items?: string[];
    };
  }>;
  subsite?: { name?: string };
  author?: { name?: string };
}

interface DtfArticleResponse {
  result?: {
    data?: DtfArticleResponseEntry;
  };
}

function validateDtfUrl(url: string): void {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_DOMAINS.includes(parsed.hostname)) {
      throw new AppError(400, 'INVALID_DOMAIN', `URL must be from dtf.ru, got: ${parsed.hostname}`);
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(400, 'INVALID_URL', `Invalid URL: ${url}`);
  }
}

function cacheKey(url: string): string {
  return `dtf_article:${url}`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

async function getCached(url: string, includeExpired = false): Promise<DtfArticleResult | null> {
  const key = cacheKey(url);
  const [entry] = await db
    .select()
    .from(sourceCacheEntries)
    .where(eq(sourceCacheEntries.cache_key, key))
    .limit(1);

  if (entry && (includeExpired || new Date(entry.expires_at) > new Date())) {
    return entry.content_json as unknown as DtfArticleResult;
  }
  return null;
}

async function setCache(url: string, data: DtfArticleResult): Promise<void> {
  const key = cacheKey(url);
  const expiresAt = new Date(Date.now() + CACHE_TTL_SEC * 1000);
  await db
    .insert(sourceCacheEntries)
    .values({
      cache_key: key,
      source_type: 'dtf_article',
      content_json: data as unknown as Record<string, unknown>,
      expires_at: expiresAt,
    })
    .onConflictDoUpdate({
      target: sourceCacheEntries.cache_key,
      set: {
        content_json: data as unknown as Record<string, unknown>,
        expires_at: expiresAt,
      },
    });
}

export async function executeDtfArticleFetch(input: { url: string }): Promise<DtfArticleResult> {
  validateDtfUrl(input.url);

  // Check cache
  const cached = await getCached(input.url);
  if (cached) {
    logger.info({ url: input.url }, 'DTF article: serving from cache');
    return cached;
  }

  const staleCache = await getCached(input.url, true);

  logger.info({ url: input.url }, 'DTF article: fetching from API');

  let data: DtfArticleResponse;
  try {
    data = await fetchDtfJson('dtf-article', DTF_LOCATE_URL, {
      params: { url: input.url },
    });
  } catch (error) {
    if (staleCache) {
      logger.warn({ url: input.url, err: error }, 'DTF article: serving stale cache after API failure');
      return staleCache;
    }

    throw error;
  }

  const entry = data?.result?.data;
  if (!entry) {
    throw new AppError(404, 'ARTICLE_NOT_FOUND', `Article not found: ${input.url}`);
  }

  const title = entry.title || '';
  const author = entry.subsite?.name || entry.author?.name || '';
  const published_at = entry.date ? new Date(entry.date * 1000).toISOString() : null;

  // Extract text from blocks
  const blocks = entry.blocks || [];
  const paragraphs: string[] = [];
  for (const block of blocks) {
    if (block.type === 'text' && block.data?.text) {
      paragraphs.push(stripHtml(block.data.text));
    } else if (block.type === 'header' && block.data?.text) {
      paragraphs.push('## ' + stripHtml(block.data.text));
    } else if (block.type === 'list' && block.data?.items) {
      for (const item of block.data.items) {
        paragraphs.push('- ' + stripHtml(item));
      }
    }
  }

  let text = paragraphs.join('\n\n');

  // Truncate to reasonable size for LLM context
  if (text.length > 8000) {
    text = text.slice(0, 8000) + '\n\n[...текст обрезан]';
  }

  const result: DtfArticleResult = {
    title,
    author,
    text,
    published_at,
    url: input.url,
  };

  await setCache(input.url, result);

  return result;
}
