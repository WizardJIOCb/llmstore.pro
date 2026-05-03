import { db } from '../../../config/database.js';
import { sourceCacheEntries } from '../../../db/schema/source-cache.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../../lib/logger.js';
import { AppError } from '../../../middleware/error-handler.js';
import type { DtfSearchResult, DtfSearchArticle } from '../types.js';
import { fetchDtfJson } from './dtf-http.js';
import { buildDtfReactionStats } from './dtf-reactions.js';

const DTF_SEARCH_URL = 'https://api.dtf.ru/v2.1/search';
const CACHE_TTL_SEC = 300;

const PERIOD_SECONDS: Record<string, number> = {
  day: 86400,
  week: 7 * 86400,
  month: 30 * 86400,
  year: 365 * 86400,
};

interface ParsedEntry extends DtfSearchArticle {
  _date: number;
}

interface RawEntry {
  title?: string;
  url?: string;
  date?: number;
  isEditorial?: boolean;
  blocks?: Array<{ type?: string; data?: { text?: string; items?: string[] } }>;
  counters?: { comments?: number; favorites?: number; reactions?: number; views?: number };
  likes?: { counterLikes?: number } | number;
  reactions?: { counters?: Array<{ id?: number; count?: number }> };
  subsite?: { name?: string };
  author?: { name?: string };
}

interface DtfSearchResponse {
  result?: {
    contents?: Array<{ type?: string; data?: RawEntry }>;
  };
}

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ');
}

function cacheKey(query: string): string {
  return `dtf_search_v1:${query.toLowerCase()}`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

function toPublishedAt(value: number | undefined): string | null {
  if (!value || !Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}

async function getCached(query: string, includeExpired = false): Promise<ParsedEntry[] | null> {
  const [entry] = await db
    .select()
    .from(sourceCacheEntries)
    .where(eq(sourceCacheEntries.cache_key, cacheKey(query)))
    .limit(1);

  if (entry && (includeExpired || new Date(entry.expires_at) > new Date())) {
    return entry.content_json as unknown as ParsedEntry[];
  }
  return null;
}

async function setCache(query: string, articles: ParsedEntry[]): Promise<void> {
  const expiresAt = new Date(Date.now() + CACHE_TTL_SEC * 1000);
  await db
    .insert(sourceCacheEntries)
    .values({
      cache_key: cacheKey(query),
      source_type: 'dtf_search',
      content_json: articles as unknown as Record<string, unknown>,
      expires_at: expiresAt,
    })
    .onConflictDoUpdate({
      target: sourceCacheEntries.cache_key,
      set: {
        content_json: articles as unknown as Record<string, unknown>,
        expires_at: expiresAt,
      },
    });
}

function extractSnippet(blocks: RawEntry['blocks']): string {
  for (const block of blocks ?? []) {
    if ((block.type === 'text' || block.type === 'header') && block.data?.text) {
      const text = stripHtml(block.data.text);
      if (text) return text.slice(0, 240);
    }
  }
  return '';
}

function extractEntry(raw: RawEntry): ParsedEntry | null {
  const url = raw.url || '';
  if (!url) return null;

  const counters = raw.counters || {};
  const reactionStats = buildDtfReactionStats({
    counters,
    reactions: raw.reactions,
    likes: raw.likes,
  });
  const snippet = extractSnippet(raw.blocks);

  return {
    title: raw.title || snippet.slice(0, 80) || '(без заголовка)',
    url,
    author: raw.subsite?.name || raw.author?.name || '',
    snippet,
    published_at: toPublishedAt(raw.date),
    comments_count: counters.comments ?? 0,
    reactions_count: reactionStats.reactions_count,
    reaction_breakdown: reactionStats.reaction_breakdown,
    reactions_summary: reactionStats.reactions_summary,
    favorites_count: counters.favorites ?? 0,
    views_count: counters.views ?? 0,
    is_editorial: Boolean(raw.isEditorial),
    _date: raw.date ?? 0,
  };
}

function applyFilters(
  articles: ParsedEntry[],
  query: string,
  period: string,
  limit: number,
  fetchedAt: string,
): DtfSearchResult {
  let filtered = [...articles];
  const periodSec = PERIOD_SECONDS[period];
  if (periodSec) {
    const threshold = Math.floor(Date.now() / 1000) - periodSec;
    filtered = filtered.filter((article) => article._date >= threshold);
  }

  const clean: DtfSearchArticle[] = filtered
    .slice(0, limit)
    .map(({ _date, ...article }) => article);

  return {
    query,
    period,
    articles: clean,
    fetched_at: fetchedAt,
  };
}

export async function executeDtfSearch(input: {
  query: string;
  period?: string;
  limit?: number;
}): Promise<DtfSearchResult> {
  const query = normalizeQuery(input.query ?? '');
  if (query.length < 2) {
    throw new AppError(400, 'INVALID_QUERY', 'Search query must be at least 2 characters');
  }

  const period = input.period ?? 'all';
  const limit = Math.min(input.limit ?? 10, 30);

  const cached = await getCached(query);
  if (cached) {
    logger.info({ query }, 'DTF search: serving from cache');
    return applyFilters(cached, query, period, limit, new Date().toISOString());
  }

  const staleCache = await getCached(query, true);
  logger.info({ query }, 'DTF search: fetching from API');

  let data: DtfSearchResponse;
  try {
    data = await fetchDtfJson('dtf-search', DTF_SEARCH_URL, {
      params: {
        query,
        count: 30,
      },
    });
  } catch (error) {
    if (staleCache) {
      logger.warn({ query, err: error }, 'DTF search: serving stale cache after API failure');
      return applyFilters(staleCache, query, period, limit, new Date().toISOString());
    }

    throw error;
  }

  const seen = new Set<string>();
  const articles: ParsedEntry[] = [];
  for (const item of data?.result?.contents ?? []) {
    if (item.type !== 'entry' || !item.data) continue;
    const article = extractEntry(item.data);
    if (!article || seen.has(article.url)) continue;
    seen.add(article.url);
    articles.push(article);
  }

  await setCache(query, articles);

  return applyFilters(articles, query, period, limit, new Date().toISOString());
}
