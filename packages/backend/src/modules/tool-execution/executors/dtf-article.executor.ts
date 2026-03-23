import axios from 'axios';
import * as cheerio from 'cheerio';
import { db } from '../../../config/database.js';
import { sourceCacheEntries } from '../../../db/schema/source-cache.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../../lib/logger.js';
import { AppError } from '../../../middleware/error-handler.js';
import type { DtfArticleResult } from '../types.js';

const CACHE_TTL_SEC = 600;
const ALLOWED_DOMAINS = ['dtf.ru', 'www.dtf.ru'];

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

async function getCached(url: string): Promise<DtfArticleResult | null> {
  const key = cacheKey(url);
  const [entry] = await db
    .select()
    .from(sourceCacheEntries)
    .where(eq(sourceCacheEntries.cache_key, key))
    .limit(1);

  if (entry && new Date(entry.expires_at) > new Date()) {
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
    logger.debug({ url: input.url }, 'DTF article: serving from cache');
    return cached;
  }

  logger.debug({ url: input.url }, 'DTF article: fetching fresh');

  const { data: html } = await axios.get(input.url, {
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; LLMStore/1.0; +https://llmstore.pro)',
      'Accept': 'text/html',
      'Accept-Language': 'ru-RU,ru;q=0.9',
    },
  });

  const $ = cheerio.load(html);

  // Extract title
  const title = $('h1').first().text().trim()
    || $('[class*="title"]').first().text().trim()
    || $('title').text().trim();

  // Extract author
  const author = $('[class*="author__name"], [class*="subsite__name"], [class*="content-header__author"]').first().text().trim()
    || $('meta[name="author"]').attr('content')
    || '';

  // Extract published date
  const published_at = $('time').attr('datetime')
    || $('meta[property="article:published_time"]').attr('content')
    || null;

  // Extract article body text
  // Remove unwanted elements
  $('script, style, nav, header, footer, [class*="comments"], [class*="sidebar"], [class*="recommend"]').remove();

  const bodyEl = $('[class*="content--full"], [class*="content__body"], article [class*="text"], article');
  let text = '';

  if (bodyEl.length > 0) {
    // Get paragraphs from the body
    const paragraphs: string[] = [];
    bodyEl.find('p, h2, h3, li, blockquote').each((_i, el) => {
      const t = $(el).text().trim();
      if (t.length > 0) paragraphs.push(t);
    });
    text = paragraphs.join('\n\n');
  }

  // Fallback to all paragraphs if body extraction failed
  if (!text) {
    const paragraphs: string[] = [];
    $('p').each((_i, el) => {
      const t = $(el).text().trim();
      if (t.length > 20) paragraphs.push(t);
    });
    text = paragraphs.join('\n\n');
  }

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
