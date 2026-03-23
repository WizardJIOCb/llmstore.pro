import axios from 'axios';
import * as cheerio from 'cheerio';
import { db } from '../../../config/database.js';
import { sourceCacheEntries } from '../../../db/schema/source-cache.js';
import { eq, gt } from 'drizzle-orm';
import { logger } from '../../../lib/logger.js';
import type { DtfFeedResult, DtfFeedArticle } from '../types.js';

const DTF_NEW_URL = 'https://dtf.ru/new';
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

export async function executeDtfFeed(input: { limit?: number }): Promise<DtfFeedResult> {
  const limit = Math.min(input.limit ?? 10, 30);

  // Check cache
  const cached = await getCached();
  if (cached) {
    logger.debug('DTF feed: serving from cache');
    return {
      ...cached,
      articles: cached.articles.slice(0, limit),
    };
  }

  logger.debug('DTF feed: fetching fresh data');

  const { data: html } = await axios.get(DTF_NEW_URL, {
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; LLMStore/1.0; +https://llmstore.pro)',
      'Accept': 'text/html',
      'Accept-Language': 'ru-RU,ru;q=0.9',
    },
  });

  const $ = cheerio.load(html);
  const articles: DtfFeedArticle[] = [];

  // DTF uses article elements or content feed items
  $('article, [class*="feed__item"], [class*="content-feed"]').each((_i, el) => {
    const $el = $(el);
    const titleEl = $el.find('h2 a, [class*="title"] a, [class*="content__title"] a, h3 a').first();
    const title = titleEl.text().trim() || $el.find('h2, [class*="title"], [class*="content__title"]').first().text().trim();
    const url = titleEl.attr('href') || $el.find('a[href*="/"]').first().attr('href') || '';
    const author = $el.find('[class*="author"], [class*="subsite"]').first().text().trim();
    const snippet = $el.find('[class*="preview"], [class*="text"], p').first().text().trim().slice(0, 200);

    if (title && url) {
      const fullUrl = url.startsWith('http') ? url : `https://dtf.ru${url}`;
      articles.push({ title, url: fullUrl, author, snippet });
    }
  });

  // Fallback: try anchor tags that look like article links
  if (articles.length === 0) {
    $('a[href]').each((_i, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();
      if (href.match(/dtf\.ru\/\w+\/\d+/) && text.length > 10 && articles.length < 30) {
        const fullUrl = href.startsWith('http') ? href : `https://dtf.ru${href}`;
        if (!articles.some(a => a.url === fullUrl)) {
          articles.push({ title: text, url: fullUrl, author: '', snippet: '' });
        }
      }
    });
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
