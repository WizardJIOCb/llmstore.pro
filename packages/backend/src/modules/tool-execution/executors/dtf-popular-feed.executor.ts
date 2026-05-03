import { db } from '../../../config/database.js';
import { sourceCacheEntries } from '../../../db/schema/source-cache.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../../lib/logger.js';
import type { DtfPopularResult, DtfPopularArticle } from '../types.js';
import { fetchDtfJson } from './dtf-http.js';
import { buildDtfReactionStats } from './dtf-reactions.js';

const DTF_API_URL = 'https://api.dtf.ru/v2.1/timeline';
const CACHE_TTL_SEC = 300;

const PERIOD_SECONDS: Record<string, number> = {
  day: 86400,
  week: 7 * 86400,
  month: 30 * 86400,
  year: 365 * 86400,
};

interface CachedData {
  articles: ParsedEntry[];
  sorting: string;
  fetched_at: string;
}

interface ParsedEntry extends DtfPopularArticle {
  _date: number;
}

function cacheKey(sorting: string): string {
  return `dtf_popular_v3_${sorting}`;
}

async function getCached(sorting: string, includeExpired = false): Promise<CachedData | null> {
  const [entry] = await db
    .select()
    .from(sourceCacheEntries)
    .where(eq(sourceCacheEntries.cache_key, cacheKey(sorting)))
    .limit(1);

  if (entry && (includeExpired || new Date(entry.expires_at) > new Date())) {
    return entry.content_json as unknown as CachedData;
  }
  return null;
}

async function setCache(sorting: string, data: CachedData): Promise<void> {
  const key = cacheKey(sorting);
  const expiresAt = new Date(Date.now() + CACHE_TTL_SEC * 1000);
  await db
    .insert(sourceCacheEntries)
    .values({
      cache_key: key,
      source_type: 'dtf_popular',
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

function toPublishedAt(value: number | undefined): string | null {
  if (!value || !Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}

interface RawEntry {
  title?: string;
  url?: string;
  date?: number;
  blocks?: Array<{ type: string; data?: { text?: string } }>;
  counters?: { comments?: number; favorites?: number; reactions?: number };
  likes?: { counterLikes?: number } | number;
  reactions?: { counters?: Array<{ id?: number; count?: number }> };
  subsite?: { name?: string };
  author?: { name?: string };
}

interface DtfPopularResponse {
  result?: {
    items?: Array<{ type?: string; data?: Record<string, unknown> }>;
  };
}

function extractEntry(raw: RawEntry): ParsedEntry | null {
  const title = raw.title || '';
  const url = raw.url || '';
  if (!url) return null;

  const author = raw.subsite?.name || raw.author?.name || '';
  const counters = raw.counters || {};
  const comments_count = counters.comments ?? 0;
  const favorites_count = counters.favorites ?? 0;
  const reactionStats = buildDtfReactionStats({
    counters,
    reactions: raw.reactions,
    likes: raw.likes,
  });

  let snippet = '';
  const blocks = raw.blocks || [];
  for (const block of blocks) {
    if (block.type === 'text' && block.data?.text) {
      snippet = stripHtml(block.data.text).slice(0, 200);
      break;
    }
  }

  return {
    title: title || snippet.slice(0, 80) || '(без заголовка)',
    url,
    author,
    snippet,
    published_at: toPublishedAt(raw.date),
    comments_count,
    reactions_count: reactionStats.reactions_count,
    reaction_breakdown: reactionStats.reaction_breakdown,
    reactions_summary: reactionStats.reactions_summary,
    favorites_count,
    _date: raw.date ?? 0,
  };
}

export async function executeDtfPopularFeed(input: {
  sorting?: string;
  period?: string;
  limit?: number;
}): Promise<DtfPopularResult> {
  const sorting = (input.sorting === 'popular') ? 'popular' : 'hotness';
  const period = input.period ?? 'day';
  const limit = Math.min(input.limit ?? 10, 30);

  const cached = await getCached(sorting);
  if (cached) {
    logger.info({ sorting }, 'DTF popular: serving from cache');
    return applyFilters(cached.articles, period, limit, sorting, cached.fetched_at);
  }

  const staleCache = await getCached(sorting, true);

  logger.info({ sorting }, 'DTF popular: fetching from API');

  let data: DtfPopularResponse;
  try {
    data = await fetchDtfJson(`dtf-popular-${sorting}`, DTF_API_URL, {
      params: {
        allSite: true,
        sorting,
        count: 30,
      },
    });
  } catch (error) {
    if (staleCache) {
      logger.warn({ sorting, err: error }, 'DTF popular: serving stale cache after API failure');
      return applyFilters(staleCache.articles, period, limit, sorting, staleCache.fetched_at);
    }

    throw error;
  }

  const items: Array<{ type?: string; data?: Record<string, unknown> }> = data?.result?.items ?? [];
  const articles: ParsedEntry[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (item.type === 'news') {
      const newsList = (item.data as { news?: Array<{ type?: string; data?: RawEntry }> })?.news ?? [];
      for (const n of newsList) {
        if (n.type === 'entry' && n.data) {
          const article = extractEntry(n.data);
          if (article && !seen.has(article.url)) {
            seen.add(article.url);
            articles.push(article);
          }
        }
      }
    } else if (item.type === 'entry' && item.data) {
      const article = extractEntry(item.data as unknown as RawEntry);
      if (article && !seen.has(article.url)) {
        seen.add(article.url);
        articles.push(article);
      }
    }
  }

  await setCache(sorting, { articles, sorting, fetched_at: new Date().toISOString() });

  return applyFilters(articles, period, limit, sorting, new Date().toISOString());
}

function applyFilters(
  articles: ParsedEntry[],
  period: string,
  limit: number,
  sorting: string,
  fetchedAt: string,
): DtfPopularResult {
  let filtered = [...articles];

  const periodSec = PERIOD_SECONDS[period];
  if (periodSec) {
    const threshold = Math.floor(Date.now() / 1000) - periodSec;
    filtered = filtered.filter(a => a._date >= threshold);
  }

  filtered.sort((a, b) => b.comments_count - a.comments_count);

  const clean: DtfPopularArticle[] = filtered.slice(0, limit).map(({ _date, ...rest }) => rest);

  return {
    articles: clean,
    sorting,
    period,
    fetched_at: fetchedAt,
  };
}
