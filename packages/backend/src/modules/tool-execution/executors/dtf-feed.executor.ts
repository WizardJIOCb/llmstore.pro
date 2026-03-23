import axios from 'axios';
import { db } from '../../../config/database.js';
import { sourceCacheEntries } from '../../../db/schema/source-cache.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../../lib/logger.js';
import type { DtfFeedResult, DtfFeedArticle } from '../types.js';

const DTF_API_URL = 'https://api.dtf.ru/v2.1/timeline';
const CACHE_KEY = 'dtf_latest_feed';
const CACHE_TTL_SEC = 120;

async function getCached(): Promise<DtfFeedResult | null> {
  const [entry] = await db
    .select()
    .from(sourceCacheEntries)
    .where(eq(sourceCacheEntries.cache_key, CACHE_KEY))
    .limit(1);

  if (entry && new Date(entry.expires_at) > new Date()) {
    return entry.content_json as unknown as DtfFeedResult;
  }
  return null;
}

async function setCache(data: DtfFeedResult): Promise<void> {
  const expiresAt = new Date(Date.now() + CACHE_TTL_SEC * 1000);
  await db
    .insert(sourceCacheEntries)
    .values({
      cache_key: CACHE_KEY,
      source_type: 'dtf_feed',
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

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

export async function executeDtfFeed(input: { limit?: number }): Promise<DtfFeedResult> {
  const limit = Math.min(input.limit ?? 10, 30);

  // Check cache
  const cached = await getCached();
  if (cached) {
    logger.info('DTF feed: serving from cache');
    return {
      ...cached,
      articles: cached.articles.slice(0, limit),
    };
  }

  logger.info('DTF feed: fetching from API');

  const { data } = await axios.get(DTF_API_URL, {
    timeout: 15000,
    params: {
      allSite: true,
      sorting: 'new',
      count: 30,
    },
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; LLMStore/1.0; +https://llmstore.pro)',
    },
  });

  const items = data?.result?.items ?? [];
  const articles: DtfFeedArticle[] = [];

  for (const item of items) {
    const entry = item?.data;
    if (!entry) continue;

    const title = entry.title || '';
    const url = entry.url || '';
    const author = entry.subsite?.name || entry.author?.name || '';

    // Extract stats
    const counters = entry.counters || {};
    const comments_count: number = counters.comments ?? 0;
    const likesObj = entry.likes;
    const likes_count: number = (typeof likesObj === 'object' && likesObj !== null)
      ? (likesObj.counterLikes ?? 0)
      : 0;

    // Extract snippet from first text block
    let snippet = '';
    const blocks = entry.blocks || [];
    for (const block of blocks) {
      if (block.type === 'text' && block.data?.text) {
        snippet = stripHtml(block.data.text).slice(0, 200);
        break;
      }
    }

    if (url) {
      articles.push({
        title: title || snippet.slice(0, 80) || '(без заголовка)',
        url,
        author,
        snippet,
        comments_count,
        likes_count,
      });
    }
  }

  const result: DtfFeedResult = {
    articles: articles.slice(0, 30),
    fetched_at: new Date().toISOString(),
  };

  await setCache(result);

  return {
    ...result,
    articles: result.articles.slice(0, limit),
  };
}
