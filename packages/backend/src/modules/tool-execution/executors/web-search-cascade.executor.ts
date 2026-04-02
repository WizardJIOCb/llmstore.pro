import axios, { AxiosError } from 'axios';
import { load } from 'cheerio';
import { env } from '../../../config/env.js';
import { logger } from '../../../lib/logger.js';
import { AppError } from '../../../middleware/error-handler.js';

type ProviderName =
  | 'tavily'
  | 'brave'
  | 'google_cse'
  | 'exa'
  | 'serpapi'
  | 'duckduckgo_html';

interface WebSearchInput {
  query?: unknown;
  max_results?: unknown;
  topic?: unknown;
}

interface WebSearchConfig {
  provider_order?: unknown;
  timeout_ms?: unknown;
  max_results?: unknown;
}

interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  source: ProviderName;
  published_at?: string | null;
}

interface SearchAttempt {
  provider: ProviderName;
  status: 'success' | 'skipped' | 'empty' | 'error';
  reason?: string;
  result_count?: number;
}

const DEFAULT_PROVIDER_ORDER: ProviderName[] = [
  'tavily',
  'brave',
  'google_cse',
  'exa',
  'serpapi',
  'duckduckgo_html',
];

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_RESULTS = 5;

function clampPositiveInteger(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function unwrapDuckDuckGoUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl;

  try {
    const resolved = new URL(rawUrl, 'https://duckduckgo.com');
    const target = resolved.searchParams.get('uddg');
    return target ? decodeURIComponent(target) : resolved.toString();
  } catch {
    return rawUrl;
  }
}

function parseQuery(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError(400, 'INVALID_SEARCH_QUERY', 'Web search requires a non-empty query');
  }
  return value.trim().slice(0, 500);
}

function parseTopic(value: unknown): 'general' | 'news' {
  return value === 'news' ? 'news' : 'general';
}

function parseProviderOrder(value: unknown): ProviderName[] {
  if (!Array.isArray(value)) return DEFAULT_PROVIDER_ORDER;

  const parsed = value
    .filter((item): item is ProviderName => typeof item === 'string' && DEFAULT_PROVIDER_ORDER.includes(item as ProviderName));

  return parsed.length > 0 ? Array.from(new Set(parsed)) : DEFAULT_PROVIDER_ORDER;
}

function buildAxiosErrorReason(error: unknown): string {
  if (error instanceof AppError) return error.message;

  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const statusText = error.response?.statusText;
    const message = typeof error.response?.data === 'string'
      ? error.response.data
      : error.message;
    return status ? `${status}${statusText ? ` ${statusText}` : ''}: ${message}` : message;
  }

  return error instanceof Error ? error.message : String(error);
}

function pushAttempt(
  attempts: SearchAttempt[],
  provider: ProviderName,
  status: SearchAttempt['status'],
  reason?: string,
  result_count?: number,
) {
  attempts.push({ provider, status, reason, result_count });
}

function normalizeResults(provider: ProviderName, items: SearchResultItem[], maxResults: number): SearchResultItem[] {
  const seen = new Set<string>();
  const normalized: SearchResultItem[] = [];

  for (const item of items) {
    const url = item.url.trim();
    const title = item.title.trim();
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);
    normalized.push({
      ...item,
      title,
      url,
      snippet: item.snippet.trim(),
      source: provider,
    });
    if (normalized.length >= maxResults) break;
  }

  return normalized;
}

async function searchTavily(query: string, maxResults: number, topic: 'general' | 'news', timeoutMs: number): Promise<SearchResultItem[]> {
  if (!env.TAVILY_API_KEY) {
    throw new AppError(400, 'SEARCH_PROVIDER_NOT_CONFIGURED', 'Tavily API key is not configured');
  }

  const { data } = await axios.post('https://api.tavily.com/search', {
    api_key: env.TAVILY_API_KEY,
    query,
    topic,
    max_results: maxResults,
    search_depth: 'basic',
    include_answer: false,
    include_raw_content: false,
  }, {
    timeout: timeoutMs,
  });

  const results = Array.isArray(data?.results) ? data.results : [];
  return normalizeResults('tavily', results.map((item: Record<string, unknown>) => ({
    title: String(item.title ?? ''),
    url: String(item.url ?? ''),
    snippet: String(item.content ?? ''),
    source: 'tavily',
    published_at: typeof item.published_date === 'string' ? item.published_date : null,
  })), maxResults);
}

async function searchBrave(query: string, maxResults: number, timeoutMs: number): Promise<SearchResultItem[]> {
  if (!env.BRAVE_SEARCH_API_KEY) {
    throw new AppError(400, 'SEARCH_PROVIDER_NOT_CONFIGURED', 'Brave Search API key is not configured');
  }

  const { data } = await axios.get('https://api.search.brave.com/res/v1/web/search', {
    timeout: timeoutMs,
    params: {
      q: query,
      count: maxResults,
      search_lang: 'ru',
      country: 'RU',
    },
    headers: {
      'X-Subscription-Token': env.BRAVE_SEARCH_API_KEY,
      'Accept': 'application/json',
    },
  });

  const results = Array.isArray(data?.web?.results) ? data.web.results : [];
  return normalizeResults('brave', results.map((item: Record<string, unknown>) => ({
    title: String(item.title ?? ''),
    url: String(item.url ?? ''),
    snippet: String(item.description ?? ''),
    source: 'brave',
    published_at: typeof item.age === 'string' ? item.age : null,
  })), maxResults);
}

async function searchGoogleCse(query: string, maxResults: number, timeoutMs: number): Promise<SearchResultItem[]> {
  if (!env.GOOGLE_CUSTOM_SEARCH_API_KEY || !env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID) {
    throw new AppError(400, 'SEARCH_PROVIDER_NOT_CONFIGURED', 'Google Custom Search API is not configured');
  }

  const { data } = await axios.get('https://www.googleapis.com/customsearch/v1', {
    timeout: timeoutMs,
    params: {
      key: env.GOOGLE_CUSTOM_SEARCH_API_KEY,
      cx: env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID,
      q: query,
      num: Math.min(maxResults, 10),
      hl: 'ru',
      safe: 'off',
    },
  });

  const results = Array.isArray(data?.items) ? data.items : [];
  return normalizeResults('google_cse', results.map((item: Record<string, unknown>) => ({
    title: String(item.title ?? ''),
    url: String(item.link ?? ''),
    snippet: String(item.snippet ?? ''),
    source: 'google_cse',
    published_at: null,
  })), maxResults);
}

async function searchExa(query: string, maxResults: number, timeoutMs: number): Promise<SearchResultItem[]> {
  if (!env.EXA_API_KEY) {
    throw new AppError(400, 'SEARCH_PROVIDER_NOT_CONFIGURED', 'Exa API key is not configured');
  }

  const { data } = await axios.post('https://api.exa.ai/search', {
    query,
    numResults: maxResults,
    type: 'auto',
    useAutoprompt: true,
  }, {
    timeout: timeoutMs,
    headers: {
      'x-api-key': env.EXA_API_KEY,
      'Content-Type': 'application/json',
    },
  });

  const results = Array.isArray(data?.results) ? data.results : [];
  return normalizeResults('exa', results.map((item: Record<string, unknown>) => {
    const highlights = Array.isArray(item.highlights) ? item.highlights : [];
    return {
      title: String(item.title ?? ''),
      url: String(item.url ?? ''),
      snippet: String(item.text ?? highlights[0] ?? ''),
      source: 'exa',
      published_at: typeof item.publishedDate === 'string' ? item.publishedDate : null,
    };
  }), maxResults);
}

async function searchSerpApi(query: string, maxResults: number, timeoutMs: number): Promise<SearchResultItem[]> {
  if (!env.SERPAPI_API_KEY) {
    throw new AppError(400, 'SEARCH_PROVIDER_NOT_CONFIGURED', 'SerpApi key is not configured');
  }

  const { data } = await axios.get('https://serpapi.com/search.json', {
    timeout: timeoutMs,
    params: {
      engine: 'google',
      q: query,
      api_key: env.SERPAPI_API_KEY,
      num: maxResults,
      hl: 'ru',
      gl: 'ru',
    },
  });

  const results = Array.isArray(data?.organic_results) ? data.organic_results : [];
  return normalizeResults('serpapi', results.map((item: Record<string, unknown>) => ({
    title: String(item.title ?? ''),
    url: String(item.link ?? ''),
    snippet: String(item.snippet ?? ''),
    source: 'serpapi',
    published_at: typeof item.date === 'string' ? item.date : null,
  })), maxResults);
}

async function searchDuckDuckGoHtml(query: string, maxResults: number, timeoutMs: number): Promise<SearchResultItem[]> {
  const { data } = await axios.get<string>('https://html.duckduckgo.com/html/', {
    timeout: timeoutMs,
    params: {
      q: query,
      kl: 'ru-ru',
    },
    responseType: 'text',
    transformResponse: [(value) => value],
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; LLMStore/1.0; +https://llmstore.pro)',
      'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
    },
  });

  const $ = load(typeof data === 'string' ? data : '');
  const results: SearchResultItem[] = [];

  $('.result').each((_, element) => {
    if (results.length >= maxResults) return false;

    const anchor = $(element).find('.result__title a, .result__a').first();
    const title = normalizeWhitespace(anchor.text());
    const url = unwrapDuckDuckGoUrl(anchor.attr('href')?.trim() ?? '');
    const snippet = normalizeWhitespace($(element).find('.result__snippet').first().text());

    if (!title || !url) return undefined;

    results.push({
      title,
      url,
      snippet,
      source: 'duckduckgo_html',
      published_at: null,
    });

    return undefined;
  });

  return normalizeResults('duckduckgo_html', results, maxResults);
}

const providerExecutors: Record<ProviderName, (query: string, maxResults: number, topic: 'general' | 'news', timeoutMs: number) => Promise<SearchResultItem[]>> = {
  tavily: (query, maxResults, topic, timeoutMs) => searchTavily(query, maxResults, topic, timeoutMs),
  brave: (query, maxResults, _topic, timeoutMs) => searchBrave(query, maxResults, timeoutMs),
  google_cse: (query, maxResults, _topic, timeoutMs) => searchGoogleCse(query, maxResults, timeoutMs),
  exa: (query, maxResults, _topic, timeoutMs) => searchExa(query, maxResults, timeoutMs),
  serpapi: (query, maxResults, _topic, timeoutMs) => searchSerpApi(query, maxResults, timeoutMs),
  duckduckgo_html: (query, maxResults, _topic, timeoutMs) => searchDuckDuckGoHtml(query, maxResults, timeoutMs),
};

export async function executeWebSearchCascade(
  input: WebSearchInput,
  config?: WebSearchConfig,
): Promise<Record<string, unknown>> {
  const query = parseQuery(input.query);
  const topic = parseTopic(input.topic);
  const maxResults = clampPositiveInteger(input.max_results ?? config?.max_results, DEFAULT_MAX_RESULTS, 10);
  const timeoutMs = clampPositiveInteger(config?.timeout_ms, DEFAULT_TIMEOUT_MS, 60_000);
  const providerOrder = parseProviderOrder(config?.provider_order);

  const attempts: SearchAttempt[] = [];

  for (const provider of providerOrder) {
    try {
      const results = await providerExecutors[provider](query, maxResults, topic, timeoutMs);

      if (results.length === 0) {
        pushAttempt(attempts, provider, 'empty', 'Provider returned no results', 0);
        continue;
      }

      pushAttempt(attempts, provider, 'success', undefined, results.length);
      return {
        query,
        provider,
        results,
        attempts,
        success: true,
      };
    } catch (error) {
      const reason = buildAxiosErrorReason(error);
      if (error instanceof AppError && error.code === 'SEARCH_PROVIDER_NOT_CONFIGURED') {
        pushAttempt(attempts, provider, 'skipped', reason);
      } else {
        logger.warn({ provider, query, reason }, 'Web search provider failed');
        pushAttempt(attempts, provider, 'error', reason);
      }
    }
  }

  return {
    query,
    provider: null,
    results: [],
    attempts,
    success: false,
    error: 'No search provider returned results',
  };
}
