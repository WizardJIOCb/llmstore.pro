const ALLOWED_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'div',
  'em',
  'font',
  'h1',
  'h2',
  'h3',
  'h4',
  'hr',
  'i',
  'li',
  'ol',
  'p',
  'span',
  'strong',
  'u',
  'ul',
]);

const BLOCK_TAGS = new Set(['blockquote', 'div', 'h1', 'h2', 'h3', 'h4', 'ol', 'p', 'ul']);
const VOID_TAGS = new Set(['br', 'hr']);
const ALLOWED_STYLE_PROPERTIES = new Set([
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'text-align',
  'text-decoration',
]);

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("'", '&#39;');
}

function sanitizeStyleValue(property: string, value: string): string | null {
  const normalizedValue = value.trim();
  if (!normalizedValue) return null;

  switch (property) {
    case 'text-align':
      return /^(left|center|right|justify)$/i.test(normalizedValue) ? normalizedValue.toLowerCase() : null;
    case 'font-family': {
      const cleaned = normalizedValue
        .split(',')
        .map((part) => part.trim().replace(/^['"]+|['"]+$/g, ''))
        .filter(Boolean)
        .map((part) => part.replace(/[^a-zA-Z0-9 _-]/g, ''))
        .filter(Boolean)
        .slice(0, 3);
      return cleaned.length > 0 ? cleaned.join(', ') : null;
    }
    case 'font-size':
      return /^(\d+(\.\d+)?(px|rem|em|%)|small|medium|large|x-large|xx-large)$/i.test(normalizedValue)
        ? normalizedValue
        : null;
    case 'font-style':
      return /^(normal|italic|oblique)$/i.test(normalizedValue) ? normalizedValue.toLowerCase() : null;
    case 'font-weight':
      return /^(normal|bold|[1-9]00)$/i.test(normalizedValue) ? normalizedValue.toLowerCase() : null;
    case 'text-decoration':
      return /^(none|underline|line-through|overline)(\s+(underline|line-through|overline))*$/i.test(normalizedValue)
        ? normalizedValue.toLowerCase()
        : null;
    default:
      return null;
  }
}

function sanitizeStyleAttribute(value: string): string | null {
  const entries = value
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf(':');
      if (separatorIndex === -1) return null;
      const property = entry.slice(0, separatorIndex).trim().toLowerCase();
      const styleValue = entry.slice(separatorIndex + 1).trim();
      if (!ALLOWED_STYLE_PROPERTIES.has(property)) return null;
      const sanitized = sanitizeStyleValue(property, styleValue);
      return sanitized ? `${property}: ${sanitized}` : null;
    })
    .filter((entry): entry is string => Boolean(entry));

  return entries.length > 0 ? entries.join('; ') : null;
}

function sanitizeHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(trimmed)) return trimmed;
  return null;
}

function sanitizeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml(node.textContent ?? '');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();

  if (tagName === 'script' || tagName === 'style') {
    return '';
  }

  if (tagName === 'center') {
    const inner = Array.from(element.childNodes).map(sanitizeNode).join('');
    return inner ? `<div style="text-align: center">${inner}</div>` : '';
  }

  if (!ALLOWED_TAGS.has(tagName)) {
    return Array.from(element.childNodes).map(sanitizeNode).join('');
  }

  const attributes: string[] = [];

  if (tagName === 'a') {
    const href = sanitizeHref(element.getAttribute('href') ?? '');
    if (href) {
      attributes.push(`href="${escapeAttribute(href)}"`);
      if (/^https?:/i.test(href)) {
        attributes.push('target="_blank"', 'rel="noopener noreferrer"');
      }
    }
  }

  if (tagName === 'font') {
    const face = (element.getAttribute('face') ?? '').trim();
    if (face) {
      attributes.push(`face="${escapeAttribute(face.replace(/[^a-zA-Z0-9 _,-]/g, ''))}"`);
    }
  }

  const align = (element.getAttribute('align') ?? '').trim().toLowerCase();
  const styleValue = sanitizeStyleAttribute(element.getAttribute('style') ?? '');
  const alignment = /^(left|center|right|justify)$/.test(align) ? `text-align: ${align}` : null;
  const mergedStyle = [styleValue, alignment].filter(Boolean).join('; ');

  if (mergedStyle && (tagName === 'div' || tagName === 'p' || tagName === 'blockquote' || tagName === 'span' || tagName.startsWith('h'))) {
    attributes.push(`style="${escapeAttribute(mergedStyle)}"`);
  }

  const inner = Array.from(element.childNodes).map(sanitizeNode).join('');

  if (VOID_TAGS.has(tagName)) {
    return `<${tagName}${attributes.length ? ` ${attributes.join(' ')}` : ''}>`;
  }

  if (!inner.trim() && BLOCK_TAGS.has(tagName)) {
    return '';
  }

  return `<${tagName}${attributes.length ? ` ${attributes.join(' ')}` : ''}>${inner}</${tagName}>`;
}

export function isRichNewsHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

export function plainTextNewsToHtml(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function normalizeNewsEditorValue(value: string): string {
  if (!value.trim()) return '<p><br></p>';
  return isRichNewsHtml(value) ? value : plainTextNewsToHtml(value);
}

export function sanitizeNewsHtml(value: string): string {
  if (typeof DOMParser === 'undefined') {
    return value;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(value, 'text/html');
    const html = Array.from(doc.body.childNodes).map(sanitizeNode).join('').trim();
    return html;
  } catch {
    return '';
  }
}

export function renderNewsContentHtml(value: string): string {
  if (!value.trim()) return '';
  return sanitizeNewsHtml(isRichNewsHtml(value) ? value : plainTextNewsToHtml(value));
}
