import { AppError } from '../../../middleware/error-handler.js';

function toPathSegments(path: string): string[] {
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function getValueAtPath(source: unknown, path: string): unknown {
  const normalizedPath = path.trim()
    .replace(/^\$\.?/, '')
    .replace(/^input\.?/, '');
  if (!normalizedPath) return source;

  let current: unknown = source;
  for (const segment of toPathSegments(normalizedPath)) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      current = Number.isInteger(index) ? current[index] : undefined;
      continue;
    }
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function resolveTemplateString(template: string, source: unknown): unknown {
  const matches = Array.from(template.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g));
  if (matches.length === 0) return template;

  const fullTemplateMatch = template.match(/^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/);
  if (fullTemplateMatch) {
    return getValueAtPath(source, fullTemplateMatch[1]);
  }

  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawPath: string) => {
    const resolved = getValueAtPath(source, rawPath);
    if (resolved === null || resolved === undefined) return '';
    if (typeof resolved === 'string') return resolved;
    if (typeof resolved === 'number' || typeof resolved === 'boolean') return String(resolved);
    return JSON.stringify(resolved);
  });
}

function resolveTemplateValue(template: unknown, source: unknown): unknown {
  if (typeof template === 'string') {
    return resolveTemplateString(template, source);
  }
  if (Array.isArray(template)) {
    return template.map((item) => resolveTemplateValue(item, source));
  }
  if (template && typeof template === 'object') {
    return Object.fromEntries(
      Object.entries(template as Record<string, unknown>).map(([key, value]) => [key, resolveTemplateValue(value, source)]),
    );
  }
  return template;
}

export async function executeJsonTransform(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const source = input.input;
  const transform = input.transform;

  if (source === undefined) {
    throw new AppError(400, 'INVALID_JSON_TRANSFORM_INPUT', 'input is required');
  }
  if (transform === undefined || transform === null) {
    throw new AppError(400, 'INVALID_JSON_TRANSFORM', 'transform is required');
  }

  if (typeof transform === 'string') {
    const trimmed = transform.trim();
    if (!trimmed) {
      throw new AppError(400, 'INVALID_JSON_TRANSFORM', 'transform must not be empty');
    }

    if (trimmed === '$' || trimmed === 'input' || trimmed === '.') {
      return { result: source };
    }

    if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        return { result: resolveTemplateValue(parsed, source) };
      } catch {
        // Fall back to path resolution for non-JSON transform strings.
      }
    }

    return { result: getValueAtPath(source, trimmed) };
  }

  if (typeof transform === 'object') {
    return { result: resolveTemplateValue(transform, source) };
  }

  throw new AppError(400, 'INVALID_JSON_TRANSFORM', 'transform must be a string or object');
}
