import axios from 'axios';
import { isIP } from 'node:net';
import { load } from 'cheerio';
import { AppError } from '../../../middleware/error-handler.js';

type HttpMethod = 'GET' | 'POST';

interface HttpRequestInput {
  url?: unknown;
  method?: unknown;
  headers?: unknown;
  body?: unknown;
}

interface HttpRequestConfig {
  timeout_ms?: unknown;
  max_response_size?: unknown;
  allowed_domains?: unknown;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_SIZE = 50 * 1024;
const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

function parseMethod(value: unknown): HttpMethod {
  const method = typeof value === 'string' ? value.trim().toUpperCase() : 'GET';
  if (method === 'GET' || method === 'POST') return method;
  throw new AppError(400, 'INVALID_HTTP_METHOD', 'HTTP Request tool supports only GET and POST methods');
}

function parseUrl(value: unknown): URL {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError(400, 'INVALID_HTTP_URL', 'HTTP Request tool requires a valid URL');
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new AppError(400, 'INVALID_HTTP_URL', 'HTTP Request tool requires a valid URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new AppError(400, 'INVALID_HTTP_PROTOCOL', 'Only http and https URLs are allowed');
  }

  const hostname = parsed.hostname.trim().toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new AppError(400, 'BLOCKED_HTTP_HOST', 'Requests to localhost are not allowed');
  }

  const ipVersion = isIP(hostname);
  if (ipVersion) {
    const isPrivateV4 = hostname.startsWith('10.')
      || hostname.startsWith('127.')
      || hostname.startsWith('192.168.')
      || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
    const isPrivateV6 = hostname === '::1' || hostname.toLowerCase().startsWith('fc') || hostname.toLowerCase().startsWith('fd');
    if (isPrivateV4 || isPrivateV6) {
      throw new AppError(400, 'BLOCKED_HTTP_HOST', 'Requests to private IP ranges are not allowed');
    }
  }

  return parsed;
}

function parseHeaders(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const parsed: Array<[string, string]> = [];
  for (const [key, headerValue] of Object.entries(value as Record<string, unknown>)) {
    if (!key.trim() || typeof headerValue !== 'string') continue;
    parsed.push([key, headerValue.trim()]);
    if (parsed.length >= 32) break;
  }

  return Object.fromEntries(parsed);
}

function parseAllowedDomains(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function ensureAllowedDomain(url: URL, allowedDomains: string[]) {
  if (allowedDomains.length === 0) return;

  const hostname = url.hostname.toLowerCase();
  const isAllowed = allowedDomains.some((domain) => (
    hostname === domain || hostname.endsWith(`.${domain}`)
  ));

  if (!isAllowed) {
    throw new AppError(400, 'HTTP_DOMAIN_NOT_ALLOWED', `Domain is not allowed for this tool: ${hostname}`);
  }
}

function clampPositiveInteger(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function truncateByBytes(text: string, maxBytes: number): { value: string; truncated: boolean } {
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.byteLength <= maxBytes) {
    return { value: text, truncated: false };
  }

  const truncatedBuffer = buffer.subarray(0, maxBytes);
  return {
    value: `${truncatedBuffer.toString('utf8')}…`,
    truncated: true,
  };
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function summarizeHtml(html: string, pageUrl: URL, maxBytes: number) {
  const $ = load(html);
  $('script, style, noscript').remove();

  const title = normalizeWhitespace($('title').first().text());
  const text = normalizeWhitespace($('body').text());
  const excerpt = truncateByBytes(text || title || '', maxBytes);

  const links: Array<{ title: string; url: string }> = [];
  const seen = new Set<string>();
  $('a[href]').each((_, element) => {
    if (links.length >= 10) return false;
    const href = $(element).attr('href');
    if (!href) return;

    try {
      const resolved = new URL(href, pageUrl);
      if (!['http:', 'https:'].includes(resolved.protocol)) return;
      const normalizedUrl = resolved.toString();
      if (seen.has(normalizedUrl)) return;
      seen.add(normalizedUrl);
      links.push({
        title: normalizeWhitespace($(element).text()).slice(0, 200) || normalizedUrl,
        url: normalizedUrl,
      });
    } catch {
      // Ignore invalid links in scraped HTML.
    }

    return undefined;
  });

  return {
    title: title || null,
    body: excerpt.value,
    truncated: excerpt.truncated,
    links,
  };
}

function isYandexCaptcha(finalUrl: string, bodyText: string): boolean {
  const normalizedUrl = finalUrl.toLowerCase();
  if (normalizedUrl.includes('yandex.ru/showcaptchafast')) return true;

  const normalizedBody = bodyText.toLowerCase();
  return normalizedBody.includes('showcaptchafast') || normalizedBody.includes('<title>верификация</title>');
}

export async function executeHttpRequest(
  input: HttpRequestInput,
  config?: HttpRequestConfig,
): Promise<Record<string, unknown>> {
  const url = parseUrl(input.url);
  const method = parseMethod(input.method);
  const headers = parseHeaders(input.headers);
  const timeoutMs = clampPositiveInteger(config?.timeout_ms, DEFAULT_TIMEOUT_MS, 60_000);
  const maxResponseSize = clampPositiveInteger(config?.max_response_size, DEFAULT_MAX_RESPONSE_SIZE, 1_000_000);
  const allowedDomains = parseAllowedDomains(config?.allowed_domains);

  ensureAllowedDomain(url, allowedDomains);

  const response = await axios.request<string>({
    url: url.toString(),
    method,
    headers,
    data: method === 'POST' && typeof input.body === 'string' ? input.body : undefined,
    timeout: timeoutMs,
    maxRedirects: 5,
    responseType: 'text',
    transformResponse: [(data) => data],
    validateStatus: () => true,
  });

  const bodyText = typeof response.data === 'string'
    ? response.data
    : JSON.stringify(response.data ?? null);
  const finalUrl = response.request?.res?.responseUrl ?? url.toString();
  const contentTypeHeader = response.headers['content-type'];
  const contentType = Array.isArray(contentTypeHeader) ? contentTypeHeader[0] : contentTypeHeader;
  const isHtml = typeof contentType === 'string' && contentType.toLowerCase().includes('text/html');

  if (isYandexCaptcha(finalUrl, bodyText)) {
    throw new AppError(
      429,
      'REMOTE_BOT_PROTECTION',
      'Yandex returned a bot-protection verification page instead of search results',
    );
  }

  if (isHtml) {
    const summary = summarizeHtml(bodyText, new URL(finalUrl), maxResponseSize);
    return {
      status: response.status,
      url: url.toString(),
      final_url: finalUrl,
      content_type: contentType ?? null,
      title: summary.title,
      body: summary.body,
      truncated: summary.truncated,
      links: summary.links,
      format: 'html_summary',
    };
  }

  const truncatedBody = truncateByBytes(bodyText, maxResponseSize);

  return {
    status: response.status,
    url: url.toString(),
    final_url: finalUrl,
    content_type: typeof contentType === 'string' ? contentType : null,
    body: truncatedBody.value,
    truncated: truncatedBody.truncated,
  };
}
